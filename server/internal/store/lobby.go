package store

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"time"
	"unicode/utf8"
)

var (
	ErrShareNotFound  = errors.New("share not found")
	ErrShareForbidden = errors.New("not the owner of this share")
)

type LobbyUser struct {
	ID       int64  `json:"id"`
	Name     string `json:"name"`
	Avatar   string `json:"avatar"`
	Bio      string `json:"bio"`
	Focus    string `json:"focus"`
	LastSeen int64  `json:"lastSeen"`
	IsOnline bool   `json:"isOnline"`
}

type WorldShare struct {
	ID             string `json:"id"`
	UserID         int64  `json:"userId"`
	OwnerName      string `json:"ownerName"`
	Kind           string `json:"kind"`
	Title          string `json:"title"`
	Summary        string `json:"summary"`
	Content        string `json:"content"`
	DraftCode      string `json:"draftCode,omitempty"`
	Visibility     string `json:"visibility"` // 'public' | 'private'
	EntityID       string `json:"entityId,omitempty"`
	Tags           string `json:"tags,omitempty"`
	WordCount      int    `json:"wordCount"`
	CanonStatus    string `json:"canonStatus,omitempty"` // 'canon' or 'doujin'
	CocreationID   string `json:"cocreationId,omitempty"`
	CanonRequested bool   `json:"canonRequested,omitempty"`
	TachiEURL      string `json:"tachiEUrl,omitempty"`
	AuthorID       int64  `json:"authorId,omitempty"`
	CreatedAt      int64  `json:"createdAt"`
	UpdatedAt      int64  `json:"updatedAt"`
}

type GlobalDashboardStats struct {
	TotalUsers        int            `json:"totalUsers"`
	OnlineUsers       int            `json:"onlineUsers"`
	TotalPublicShares int            `json:"totalPublicShares"`
	KindCounts        map[string]int `json:"kindCounts"`
	TotalPublicWords  int            `json:"totalPublicWords"`
	TotalSyncedWords  int            `json:"totalSyncedWords"`
	RecentCreations   []WorldShare   `json:"recentCreations"`
	ActiveCreators    []LobbyUser    `json:"activeCreators"`
}

func (s *Store) UpdatePresence(ctx context.Context, userID int64, focus string) error {
	now := time.Now().Unix()
	focus = truncateRunes(focus, 60)
	_, err := s.WriteDB.ExecContext(ctx, `
		UPDATE users SET presence_focus = ?, last_seen_at = ? WHERE id = ?
	`, focus, now, userID)
	return err
}

func (s *Store) ListLobbyUsers(ctx context.Context, limit int) ([]LobbyUser, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	now := time.Now().Unix()
	rows, err := s.ReadDB.QueryContext(ctx, `
		SELECT id, nickname, avatar_url, bio, presence_focus, last_seen_at
		FROM users
		WHERE is_disabled = 0
		ORDER BY last_seen_at DESC
		LIMIT ?
	`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	list := make([]LobbyUser, 0)
	for rows.Next() {
		var u LobbyUser
		if err := rows.Scan(&u.ID, &u.Name, &u.Avatar, &u.Bio, &u.Focus, &u.LastSeen); err != nil {
			return nil, err
		}
		u.IsOnline = (now - u.LastSeen) < 300 // Online if active within 5 minutes
		list = append(list, u)
	}
	return list, nil
}

func (s *Store) CreateShare(ctx context.Context, userID int64, ownerName, kind, title, summary, content, draftCode string) (*WorldShare, error) {
	return s.UpsertShare(ctx, "", userID, ownerName, kind, title, summary, content, draftCode, "public", "", "", utf8.RuneCountInString(content), time.Now().Unix())
}

func (s *Store) CreateShareWithMeta(ctx context.Context, customID string, userID int64, ownerName, kind, title, summary, content, draftCode string, createdAt int64) (*WorldShare, error) {
	return s.UpsertShare(ctx, customID, userID, ownerName, kind, title, summary, content, draftCode, "public", "", "", utf8.RuneCountInString(content), createdAt)
}

const shareSelectCols = `
	id, user_id, owner_name, kind, title, summary, content, draft_code,
	COALESCE(visibility, 'public'), COALESCE(entity_id, ''), COALESCE(tags, ''), COALESCE(word_count, 0),
	COALESCE(canon_status, 'canon'), COALESCE(cocreation_id, ''), COALESCE(canon_requested, 0),
	COALESCE(tachi_e_url, ''), COALESCE(author_id, user_id),
	created_at, COALESCE(updated_at, created_at)
`

func scanShareRow(scanner interface{ Scan(...interface{}) error }) (*WorldShare, error) {
	var sh WorldShare
	var canonReq int
	err := scanner.Scan(
		&sh.ID, &sh.UserID, &sh.OwnerName, &sh.Kind, &sh.Title, &sh.Summary, &sh.Content, &sh.DraftCode,
		&sh.Visibility, &sh.EntityID, &sh.Tags, &sh.WordCount,
		&sh.CanonStatus, &sh.CocreationID, &canonReq, &sh.TachiEURL, &sh.AuthorID,
		&sh.CreatedAt, &sh.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	sh.CanonRequested = canonReq != 0
	return &sh, nil
}

func (s *Store) UpsertShareMeta(ctx context.Context, customID string, userID int64, ownerName, kind, title, summary, content, draftCode, visibility, entityID, tags string, wordCount int, canonStatus, cocreationID string, canonRequested bool, tachiEURL string, createdAt int64) (*WorldShare, error) {
	id := strings.TrimSpace(customID)
	if id == "" {
		b := make([]byte, 6)
		_, _ = rand.Read(b)
		id = "sh_" + hex.EncodeToString(b)
	}
	if kind == "" {
		kind = "world"
	}
	if visibility != "private" {
		visibility = "public"
	}
	// Check if user is muted when publishing publicly
	if visibility == "public" {
		var isMuted int
		_ = s.ReadDB.QueryRowContext(ctx, `SELECT COALESCE(is_muted, 0) FROM users WHERE id = ?`, userID).Scan(&isMuted)
		if isMuted != 0 {
			return nil, ErrUserMuted
		}
	}
	now := time.Now().Unix()
	if createdAt <= 0 {
		createdAt = now
	}
	if wordCount <= 0 {
		wordCount = utf8.RuneCountInString(content)
	}
	if canonStatus == "" {
		canonStatus = "canon"
	}
	title = truncateRunes(title, 80)
	summary = truncateRunes(summary, 200)
	ownerName = truncateRunes(ownerName, 16)
	tags = truncateRunes(tags, 100)

	canonReqVal := 0
	if canonRequested {
		canonReqVal = 1
	}

	tx, err := s.WriteDB.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	// A client may supply its own id to update an existing share, but only its own.
	if strings.TrimSpace(customID) != "" {
		var ownerID int64
		err := tx.QueryRowContext(ctx, `SELECT user_id FROM world_shares WHERE id = ?`, id).Scan(&ownerID)
		if err == nil && ownerID != userID {
			return nil, ErrShareForbidden
		}
		if err != nil && !errors.Is(err, sql.ErrNoRows) {
			return nil, err
		}
	}

	// canon_status / canon_requested are server-owned review state: an update only resets them
	// when the share is moved to a different co-creation project.
	_, err = tx.ExecContext(ctx, `
		INSERT INTO world_shares (id, user_id, owner_name, kind, title, summary, content, draft_code, visibility, entity_id, tags, word_count, canon_status, cocreation_id, canon_requested, tachi_e_url, author_id, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET
			title = excluded.title,
			summary = excluded.summary,
			content = excluded.content,
			draft_code = excluded.draft_code,
			visibility = excluded.visibility,
			tags = excluded.tags,
			word_count = excluded.word_count,
			canon_status = CASE WHEN excluded.cocreation_id <> world_shares.cocreation_id THEN excluded.canon_status ELSE world_shares.canon_status END,
			canon_requested = CASE WHEN excluded.cocreation_id <> world_shares.cocreation_id THEN 0 ELSE world_shares.canon_requested END,
			cocreation_id = excluded.cocreation_id,
			tachi_e_url = excluded.tachi_e_url,
			updated_at = excluded.updated_at
		WHERE world_shares.user_id = excluded.user_id
	`, id, userID, ownerName, kind, title, summary, content, draftCode, visibility, entityID, tags, wordCount, canonStatus, cocreationID, canonReqVal, tachiEURL, userID, createdAt, now)
	if err != nil {
		return nil, err
	}

	// Read back the authoritative row (review state may have been preserved by the upsert).
	var createdAtDB, updatedAtDB int64
	var canonStatusDB string
	var canonReqDB int
	if err := tx.QueryRowContext(ctx, `SELECT COALESCE(canon_status,'canon'), COALESCE(canon_requested,0), created_at, updated_at FROM world_shares WHERE id = ?`, id).
		Scan(&canonStatusDB, &canonReqDB, &createdAtDB, &updatedAtDB); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	canonStatus = canonStatusDB
	canonRequested = canonReqDB != 0
	createdAt = createdAtDB
	now = updatedAtDB

	// If a doujin setting is published publicly in a co-creation project, notify owner and admins
	if visibility == "public" && canonStatus == "doujin" && cocreationID != "" {
		go func() {
			bgCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer cancel()
			proj, err := s.GetCocreationProject(bgCtx, cocreationID)
			if err == nil {
				if proj.OwnerID != userID {
					_ = s.CreateNotification(bgCtx, proj.OwnerID, userID, ownerName, "doujin_created",
						fmt.Sprintf("新同人作品《%s》已发布", title),
						fmt.Sprintf("创作者 %s 为您的共创企划《%s》创作了同人作品《%s》", ownerName, proj.WorldTitle, title),
						id, "share")
				}
				for _, adm := range proj.Admins {
					var admUID int64
					if err := s.ReadDB.QueryRowContext(bgCtx, `SELECT id FROM users WHERE email = ? OR nickname = ?`, adm, adm).Scan(&admUID); err == nil {
						if admUID != proj.OwnerID && admUID != userID {
							_ = s.CreateNotification(bgCtx, admUID, userID, ownerName, "doujin_created",
								fmt.Sprintf("新同人作品《%s》已发布", title),
								fmt.Sprintf("创作者 %s 为共创企划《%s》创作了同人作品《%s》", ownerName, proj.WorldTitle, title),
								id, "share")
						}
					}
				}
			}
		}()
	}

	return &WorldShare{
		ID:             id,
		UserID:         userID,
		OwnerName:      ownerName,
		Kind:           kind,
		Title:          title,
		Summary:        summary,
		Content:        content,
		DraftCode:      draftCode,
		Visibility:     visibility,
		EntityID:       entityID,
		Tags:           tags,
		WordCount:      wordCount,
		CanonStatus:    canonStatus,
		CocreationID:   cocreationID,
		CanonRequested: canonRequested,
		TachiEURL:      tachiEURL,
		AuthorID:       userID,
		CreatedAt:      createdAt,
		UpdatedAt:      now,
	}, nil
}

func (s *Store) UpsertShare(ctx context.Context, customID string, userID int64, ownerName, kind, title, summary, content, draftCode, visibility, entityID, tags string, wordCount int, createdAt int64) (*WorldShare, error) {
	return s.UpsertShareMeta(ctx, customID, userID, ownerName, kind, title, summary, content, draftCode, visibility, entityID, tags, wordCount, "canon", "", false, "", createdAt)
}

func (s *Store) GetShare(ctx context.Context, shareID string) (*WorldShare, error) {
	row := s.ReadDB.QueryRowContext(ctx, "SELECT "+shareSelectCols+" FROM world_shares WHERE id = ?", shareID)
	sh, err := scanShareRow(row)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrShareNotFound
	}
	return sh, err
}

// ListShares maintains backward compatibility while respecting public visibility when ownerID is nil
func (s *Store) ListShares(ctx context.Context, ownerID *int64, beforeCreatedAt int64, limit int) ([]WorldShare, error) {
	if ownerID != nil {
		return s.ListUserItems(ctx, *ownerID, "all", "", limit)
	}
	return s.ListPublicShares(ctx, "all", "", beforeCreatedAt, limit)
}

func (s *Store) ListPublicShares(ctx context.Context, kind, keyword string, beforeCreatedAt int64, limit int) ([]WorldShare, error) {
	if limit <= 0 || limit > 100 {
		limit = 30
	}
	if beforeCreatedAt <= 0 {
		beforeCreatedAt = time.Now().Unix() + 3600
	}

	query := "SELECT " + shareSelectCols + " FROM world_shares WHERE visibility = 'public' AND created_at <= ?"
	args := []interface{}{beforeCreatedAt}

	if kind != "" && kind != "all" {
		if kind == "canon" || kind == "doujin" {
			query += " AND canon_status = ?"
			args = append(args, kind)
		} else {
			query += " AND kind = ?"
			args = append(args, kind)
		}
	}
	if keyword = strings.TrimSpace(keyword); keyword != "" {
		query += " AND (title LIKE ? OR summary LIKE ? OR tags LIKE ?)"
		like := "%" + keyword + "%"
		args = append(args, like, like, like)
	}

	query += " ORDER BY created_at DESC, id DESC LIMIT ?"
	args = append(args, limit)

	rows, err := s.ReadDB.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	list := make([]WorldShare, 0)
	for rows.Next() {
		sh, err := scanShareRow(rows)
		if err != nil {
			return nil, err
		}
		list = append(list, *sh)
	}
	return list, nil
}

func (s *Store) ListUserItems(ctx context.Context, userID int64, visibilityFilter, kindFilter string, limit int) ([]WorldShare, error) {
	if limit <= 0 || limit > 200 {
		limit = 100
	}

	query := "SELECT " + shareSelectCols + " FROM world_shares WHERE user_id = ?"
	args := []interface{}{userID}

	if visibilityFilter == "public" || visibilityFilter == "private" {
		query += " AND visibility = ?"
		args = append(args, visibilityFilter)
	}
	if kindFilter != "" && kindFilter != "all" {
		query += " AND kind = ?"
		args = append(args, kindFilter)
	}

	query += " ORDER BY created_at DESC, id DESC LIMIT ?"
	args = append(args, limit)

	rows, err := s.ReadDB.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	list := make([]WorldShare, 0)
	for rows.Next() {
		sh, err := scanShareRow(rows)
		if err != nil {
			return nil, err
		}
		list = append(list, *sh)
	}
	return list, nil
}

func (s *Store) UpdateShareVisibility(ctx context.Context, shareID string, userID int64, visibility string, isAdmin bool) error {
	if visibility != "private" {
		visibility = "public"
	}
	var ownerID int64
	err := s.ReadDB.QueryRowContext(ctx, `SELECT user_id FROM world_shares WHERE id = ?`, shareID).Scan(&ownerID)
	if errors.Is(err, sql.ErrNoRows) {
		return ErrShareNotFound
	}
	if err != nil {
		return err
	}
	if ownerID != userID && !isAdmin {
		return ErrShareForbidden
	}
	now := time.Now().Unix()
	_, err = s.WriteDB.ExecContext(ctx, `UPDATE world_shares SET visibility = ?, updated_at = ? WHERE id = ?`, visibility, now, shareID)
	return err
}

func (s *Store) DeleteShare(ctx context.Context, shareID string, currentUserID int64, isAdmin bool) error {
	var ownerID int64
	err := s.ReadDB.QueryRowContext(ctx, `SELECT user_id FROM world_shares WHERE id = ?`, shareID).Scan(&ownerID)
	if errors.Is(err, sql.ErrNoRows) {
		return ErrShareNotFound
	}
	if err != nil {
		return err
	}
	if ownerID != currentUserID && !isAdmin {
		return ErrShareForbidden
	}
	_, err = s.WriteDB.ExecContext(ctx, `DELETE FROM world_shares WHERE id = ?`, shareID)
	return err
}

func (s *Store) GetGlobalDashboardStats(ctx context.Context) (*GlobalDashboardStats, error) {
	stats := &GlobalDashboardStats{
		KindCounts:      map[string]int{"world": 0, "org": 0, "char": 0, "article": 0},
		RecentCreations: make([]WorldShare, 0),
		ActiveCreators:  make([]LobbyUser, 0),
	}

	// 1. Total users
	_ = s.ReadDB.QueryRowContext(ctx, `SELECT COUNT(*) FROM users WHERE is_disabled = 0`).Scan(&stats.TotalUsers)

	// 2. Online users
	now := time.Now().Unix()
	_ = s.ReadDB.QueryRowContext(ctx, `SELECT COUNT(*) FROM users WHERE is_disabled = 0 AND (? - last_seen_at) < 300`, now).Scan(&stats.OnlineUsers)

	// 3. Public shares & kind counts
	rows, err := s.ReadDB.QueryContext(ctx, `
		SELECT kind, COUNT(*), COALESCE(SUM(word_count), 0)
		FROM world_shares
		WHERE visibility = 'public'
		GROUP BY kind
	`)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var k string
			var count, words int
			if err := rows.Scan(&k, &count, &words); err == nil {
				stats.KindCounts[k] = count
				stats.TotalPublicShares += count
				stats.TotalPublicWords += words
			}
		}
	}

	// 4. Total synced bytes / words estimate from user_docs
	var totalBytes int
	_ = s.ReadDB.QueryRowContext(ctx, `SELECT COALESCE(SUM(byte_size), 0) FROM user_docs`).Scan(&totalBytes)
	stats.TotalSyncedWords = totalBytes / 3 // approx UTF-8 characters

	// 5. Recent public creations
	recent, _ := s.ListPublicShares(ctx, "all", "", 0, 8)
	stats.RecentCreations = recent

	// 6. Active creators
	creators, _ := s.ListLobbyUsers(ctx, 8)
	stats.ActiveCreators = creators

	return stats, nil
}
