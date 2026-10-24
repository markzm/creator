package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"time"
)

var (
	ErrSyncConflict = errors.New("sync revision conflict")
	ErrInvalidDoc   = errors.New("invalid DocV6 JSON structure")
	ErrRevisionNone = errors.New("revision not found")
)

type UserDoc struct {
	UserID    int64           `json:"userId"`
	Rev       int             `json:"rev"`
	Data      json.RawMessage `json:"data"`
	ByteSize  int             `json:"byteSize"`
	UpdatedAt int64           `json:"updatedAt"`
}

type DocRevisionMeta struct {
	ID        int64  `json:"id"`
	Rev       int    `json:"rev"`
	ByteSize  int    `json:"byteSize"`
	Summary   string `json:"summary"`
	CreatedAt int64  `json:"createdAt"`
}

type DocRevisionDetail struct {
	DocRevisionMeta
	Data json.RawMessage `json:"data"`
}

const (
	SnapshotIntervalSec = 600 // 10 minutes between automatic history snapshots
	MaxRecentSnapshots  = 50
	MaxDailyDays        = 30
)

// ValidateAndSummarizeDoc checks that raw JSON is a valid v6 document (or compatible object)
// and computes a compact human-readable summary like "世界观:2 组织:3 角色:12".
func ValidateAndSummarizeDoc(raw []byte) (string, error) {
	var parsed map[string]interface{}
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return "", ErrInvalidDoc
	}
	ver, hasVer := parsed["_version"]
	if !hasVer {
		if v2, ok := parsed["version"]; ok {
			ver = v2
		} else {
			return "", ErrInvalidDoc
		}
	}
	_ = ver

	countMap := func(k string) (int, bool) {
		v, exists := parsed[k]
		if !exists {
			return 0, false
		}
		m, ok := v.(map[string]interface{})
		if !ok {
			return 0, false
		}
		return len(m), true
	}

	wCnt, okW := countMap("worlds")
	oCnt, okO := countMap("orgs")
	cCnt, okC := countMap("chars")
	if !okW || !okO || !okC {
		return "", ErrInvalidDoc
	}

	return fmt.Sprintf("世界观:%d 组织:%d 角色:%d", wCnt, oCnt, cCnt), nil
}

func (s *Store) GetDoc(ctx context.Context, userID int64) (*UserDoc, error) {
	var doc UserDoc
	var docStr string
	err := s.ReadDB.QueryRowContext(ctx, `
		SELECT user_id, rev, doc_json, byte_size, updated_at
		FROM user_docs WHERE user_id = ?
	`, userID).Scan(&doc.UserID, &doc.Rev, &docStr, &doc.ByteSize, &doc.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	doc.Data = json.RawMessage(docStr)
	return &doc, nil
}

// PutDoc updates user_docs with optimistic concurrency control (baseRev).
// If baseRev does not match current rev, returns ErrSyncConflict along with the current server UserDoc.
func (s *Store) PutDoc(ctx context.Context, userID int64, baseRev int, rawJSON []byte, forceSnapshotSummary string) (*UserDoc, error) {
	summary, err := ValidateAndSummarizeDoc(rawJSON)
	if err != nil {
		return nil, err
	}
	if forceSnapshotSummary != "" {
		summary = forceSnapshotSummary + " (" + summary + ")"
	}

	now := time.Now().Unix()
	byteSize := len(rawJSON)
	docStr := string(rawJSON)

	tx, err := s.WriteDB.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback() }()

	var curRev int
	var curDocStr string
	var curSize int
	var curUpdated int64
	err = tx.QueryRowContext(ctx, `
		SELECT rev, doc_json, byte_size, updated_at FROM user_docs WHERE user_id = ?
	`, userID).Scan(&curRev, &curDocStr, &curSize, &curUpdated)

	var newRev int
	if errors.Is(err, sql.ErrNoRows) {
		if baseRev != 0 {
			return nil, ErrSyncConflict
		}
		newRev = 1
		_, err = tx.ExecContext(ctx, `
			INSERT INTO user_docs (user_id, rev, doc_json, byte_size, updated_at)
			VALUES (?, ?, ?, ?, ?)
		`, userID, newRev, docStr, byteSize, now)
		if err != nil {
			return nil, err
		}
	} else if err != nil {
		return nil, err
	} else {
		if baseRev != curRev {
			return &UserDoc{
				UserID:    userID,
				Rev:       curRev,
				Data:      json.RawMessage(curDocStr),
				ByteSize:  curSize,
				UpdatedAt: curUpdated,
			}, ErrSyncConflict
		}
		newRev = curRev + 1
		_, err = tx.ExecContext(ctx, `
			UPDATE user_docs SET rev = ?, doc_json = ?, byte_size = ?, updated_at = ?
			WHERE user_id = ?
		`, newRev, docStr, byteSize, now, userID)
		if err != nil {
			return nil, err
		}
	}

	// Check if we should save a history revision snapshot (>= 10 min since last snapshot or forced)
	var lastSnapAt sql.NullInt64
	_ = tx.QueryRowContext(ctx, `
		SELECT MAX(created_at) FROM doc_revisions WHERE user_id = ?
	`, userID).Scan(&lastSnapAt)

	if forceSnapshotSummary != "" || !lastSnapAt.Valid || (now-lastSnapAt.Int64 >= SnapshotIntervalSec) {
		_, err = tx.ExecContext(ctx, `
			INSERT INTO doc_revisions (user_id, rev, byte_size, summary, doc_json, created_at)
			VALUES (?, ?, ?, ?, ?, ?)
		`, userID, newRev, byteSize, summary, docStr, now)
		if err != nil {
			return nil, err
		}
		if err := pruneRevisionsTx(ctx, tx, userID, now); err != nil {
			return nil, err
		}
	}

	if err := tx.Commit(); err != nil {
		return nil, err
	}

	return &UserDoc{
		UserID:    userID,
		Rev:       newRev,
		Data:      json.RawMessage(rawJSON),
		ByteSize:  byteSize,
		UpdatedAt: now,
	}, nil
}

// pruneRevisionsTx retains the most recent 50 revisions + 1 latest revision per calendar day for the last 30 days.
func pruneRevisionsTx(ctx context.Context, tx *sql.Tx, userID int64, now int64) error {
	rows, err := tx.QueryContext(ctx, `
		SELECT id, created_at FROM doc_revisions WHERE user_id = ? ORDER BY created_at DESC, id DESC
	`, userID)
	if err != nil {
		return err
	}
	type revItem struct {
		id        int64
		createdAt int64
	}
	var all []revItem
	for rows.Next() {
		var r revItem
		if err := rows.Scan(&r.id, &r.createdAt); err != nil {
			rows.Close()
			return err
		}
		all = append(all, r)
	}
	rows.Close()

	if len(all) <= MaxRecentSnapshots {
		return nil
	}

	cutoff30d := now - int64(MaxDailyDays*86400)
	seenDays := make(map[string]bool)
	var toDelete []int64

	for idx, r := range all {
		if idx < MaxRecentSnapshots {
			dayKey := time.Unix(r.createdAt, 0).UTC().Format("2006-01-02")
			seenDays[dayKey] = true
			continue
		}
		if r.createdAt >= cutoff30d {
			dayKey := time.Unix(r.createdAt, 0).UTC().Format("2006-01-02")
			if !seenDays[dayKey] {
				seenDays[dayKey] = true
				continue
			}
		}
		toDelete = append(toDelete, r.id)
	}

	for _, id := range toDelete {
		if _, err := tx.ExecContext(ctx, `DELETE FROM doc_revisions WHERE id = ?`, id); err != nil {
			return err
		}
	}
	return nil
}

func (s *Store) ListRevisions(ctx context.Context, userID int64) ([]DocRevisionMeta, error) {
	rows, err := s.ReadDB.QueryContext(ctx, `
		SELECT id, rev, byte_size, summary, created_at
		FROM doc_revisions WHERE user_id = ?
		ORDER BY created_at DESC, id DESC LIMIT 100
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	list := make([]DocRevisionMeta, 0)
	for rows.Next() {
		var m DocRevisionMeta
		if err := rows.Scan(&m.ID, &m.Rev, &m.ByteSize, &m.Summary, &m.CreatedAt); err != nil {
			return nil, err
		}
		list = append(list, m)
	}
	return list, nil
}

func (s *Store) GetRevision(ctx context.Context, userID, revID int64) (*DocRevisionDetail, error) {
	var d DocRevisionDetail
	var docStr string
	err := s.ReadDB.QueryRowContext(ctx, `
		SELECT id, rev, byte_size, summary, doc_json, created_at
		FROM doc_revisions WHERE id = ? AND user_id = ?
	`, revID, userID).Scan(&d.ID, &d.Rev, &d.ByteSize, &d.Summary, &docStr, &d.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrRevisionNone
	}
	if err != nil {
		return nil, err
	}
	d.Data = json.RawMessage(docStr)
	return &d, nil
}
