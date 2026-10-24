package store

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"errors"
	"strings"
	"time"
)

var (
	ErrShareNotFound  = errors.New("share not found")
	ErrShareForbidden = errors.New("not the owner of this share")
)

type LobbyUser struct {
	ID        int64  `json:"id"`
	Name      string `json:"name"`
	Avatar    string `json:"avatar"`
	Bio       string `json:"bio"`
	Focus     string `json:"focus"`
	LastSeen  int64  `json:"lastSeen"`
	IsOnline  bool   `json:"isOnline"`
}

type WorldShare struct {
	ID        string `json:"id"`
	UserID    int64  `json:"userId"`
	OwnerName string `json:"ownerName"`
	Kind      string `json:"kind"`
	Title     string `json:"title"`
	Summary   string `json:"summary"`
	Content   string `json:"content"`
	DraftCode string `json:"draftCode,omitempty"`
	CreatedAt int64  `json:"createdAt"`
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
	return s.CreateShareWithMeta(ctx, "", userID, ownerName, kind, title, summary, content, draftCode, time.Now().Unix())
}

func (s *Store) CreateShareWithMeta(ctx context.Context, customID string, userID int64, ownerName, kind, title, summary, content, draftCode string, createdAt int64) (*WorldShare, error) {
	id := strings.TrimSpace(customID)
	if id == "" {
		b := make([]byte, 6)
		_, _ = rand.Read(b)
		id = "sh_" + hex.EncodeToString(b)
	}
	if kind == "" {
		kind = "world"
	}
	title = truncateRunes(title, 60)
	summary = truncateRunes(summary, 120)
	ownerName = truncateRunes(ownerName, 16)
	if createdAt <= 0 {
		createdAt = time.Now().Unix()
	}

	_, err := s.WriteDB.ExecContext(ctx, `
		INSERT INTO world_shares (id, user_id, owner_name, kind, title, summary, content, draft_code, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET
			title = excluded.title,
			summary = excluded.summary,
			content = excluded.content,
			draft_code = excluded.draft_code
	`, id, userID, ownerName, kind, title, summary, content, draftCode, createdAt)
	if err != nil {
		return nil, err
	}
	return &WorldShare{
		ID:        id,
		UserID:    userID,
		OwnerName: ownerName,
		Kind:      kind,
		Title:     title,
		Summary:   summary,
		Content:   content,
		DraftCode: draftCode,
		CreatedAt: createdAt,
	}, nil
}

func (s *Store) ListShares(ctx context.Context, ownerID *int64, beforeCreatedAt int64, limit int) ([]WorldShare, error) {
	if limit <= 0 || limit > 100 {
		limit = 30
	}
	if beforeCreatedAt <= 0 {
		beforeCreatedAt = time.Now().Unix() + 3600
	}

	var rows *sql.Rows
	var err error
	if ownerID != nil {
		rows, err = s.ReadDB.QueryContext(ctx, `
			SELECT id, user_id, owner_name, kind, title, summary, content, draft_code, created_at
			FROM world_shares
			WHERE user_id = ? AND created_at <= ?
			ORDER BY created_at DESC, id DESC
			LIMIT ?
		`, *ownerID, beforeCreatedAt, limit)
	} else {
		rows, err = s.ReadDB.QueryContext(ctx, `
			SELECT id, user_id, owner_name, kind, title, summary, content, draft_code, created_at
			FROM world_shares
			WHERE created_at <= ?
			ORDER BY created_at DESC, id DESC
			LIMIT ?
		`, beforeCreatedAt, limit)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	list := make([]WorldShare, 0)
	for rows.Next() {
		var sh WorldShare
		if err := rows.Scan(&sh.ID, &sh.UserID, &sh.OwnerName, &sh.Kind, &sh.Title, &sh.Summary, &sh.Content, &sh.DraftCode, &sh.CreatedAt); err != nil {
			return nil, err
		}
		list = append(list, sh)
	}
	return list, nil
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
