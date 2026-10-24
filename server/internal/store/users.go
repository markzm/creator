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
	ErrUserNotFound   = errors.New("user not found")
	ErrEmailTaken     = errors.New("email already registered")
	ErrInvalidInvite  = errors.New("invalid or expired invite code")
	ErrUserDisabled   = errors.New("account is disabled")
	ErrSessionExpired = errors.New("session expired or not found")
)

type User struct {
	ID            int64  `json:"id"`
	Email         string `json:"email,omitempty"`
	PasswordHash  string `json:"-"`
	Nickname      string `json:"name"`
	AvatarURL     string `json:"avatar"`
	Bio           string `json:"bio"`
	PresenceFocus string `json:"focus"`
	LastSeenAt    int64  `json:"lastSeenAt"`
	IsAdmin       bool   `json:"isAdmin,omitempty"`
	IsDisabled    bool   `json:"-"`
	CreatedAt     int64  `json:"createdAt"`
	UpdatedAt     int64  `json:"updatedAt"`
}

type Invite struct {
	Code      string `json:"code"`
	MaxUses   int    `json:"maxUses"`
	UsedCount int    `json:"usedCount"`
	ExpiresAt *int64 `json:"expiresAt,omitempty"`
	CreatedBy string `json:"createdBy"`
	CreatedAt int64  `json:"createdAt"`
}

func truncateRunes(s string, max int) string {
	s = strings.TrimSpace(s)
	if utf8.RuneCountInString(s) <= max {
		return s
	}
	r := []rune(s)
	return string(r[:max])
}

func defaultNicknameFromEmail(email string) string {
	parts := strings.Split(email, "@")
	prefix := strings.TrimSpace(parts[0])
	if prefix == "" {
		return "创作者"
	}
	return truncateRunes(prefix, 16)
}

func (s *Store) CreateUser(ctx context.Context, email, passwordHash, inviteCode string, requireInvite bool) (*User, error) {
	email = strings.ToLower(strings.TrimSpace(email))
	now := time.Now().Unix()
	nick := defaultNicknameFromEmail(email)

	tx, err := s.WriteDB.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback() }()

	if requireInvite {
		code := strings.TrimSpace(inviteCode)
		if code == "" {
			return nil, ErrInvalidInvite
		}
		var maxUses, usedCount int
		var expiresAt sql.NullInt64
		err := tx.QueryRowContext(ctx, `SELECT max_uses, used_count, expires_at FROM invites WHERE code = ?`, code).
			Scan(&maxUses, &usedCount, &expiresAt)
		if err != nil {
			return nil, ErrInvalidInvite
		}
		if usedCount >= maxUses || (expiresAt.Valid && expiresAt.Int64 < now) {
			return nil, ErrInvalidInvite
		}
		if _, err := tx.ExecContext(ctx, `UPDATE invites SET used_count = used_count + 1 WHERE code = ?`, code); err != nil {
			return nil, err
		}
	}

	res, err := tx.ExecContext(ctx, `
		INSERT INTO users (email, password_hash, nickname, last_seen_at, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?)
	`, email, passwordHash, nick, now, now, now)
	if err != nil {
		if strings.Contains(strings.ToLower(err.Error()), "unique") {
			return nil, ErrEmailTaken
		}
		return nil, err
	}
	uid, err := res.LastInsertId()
	if err != nil {
		return nil, err
	}

	if err := tx.Commit(); err != nil {
		return nil, err
	}

	return &User{
		ID:         uid,
		Email:      email,
		Nickname:   nick,
		LastSeenAt: now,
		CreatedAt:  now,
		UpdatedAt:  now,
	}, nil
}

func (s *Store) GetUserByEmail(ctx context.Context, email string) (*User, error) {
	email = strings.ToLower(strings.TrimSpace(email))
	row := s.ReadDB.QueryRowContext(ctx, `
		SELECT id, email, password_hash, nickname, avatar_url, bio, presence_focus, last_seen_at, is_admin, is_disabled, created_at, updated_at
		FROM users WHERE email = ?
	`, email)
	return scanUser(row)
}

func (s *Store) GetUserByID(ctx context.Context, id int64) (*User, error) {
	row := s.ReadDB.QueryRowContext(ctx, `
		SELECT id, email, password_hash, nickname, avatar_url, bio, presence_focus, last_seen_at, is_admin, is_disabled, created_at, updated_at
		FROM users WHERE id = ?
	`, id)
	return scanUser(row)
}

func scanUser(row *sql.Row) (*User, error) {
	var u User
	var isAdmin, isDisabled int
	err := row.Scan(
		&u.ID, &u.Email, &u.PasswordHash, &u.Nickname, &u.AvatarURL, &u.Bio,
		&u.PresenceFocus, &u.LastSeenAt, &isAdmin, &isDisabled, &u.CreatedAt, &u.UpdatedAt,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrUserNotFound
	}
	if err != nil {
		return nil, err
	}
	u.IsAdmin = isAdmin != 0
	u.IsDisabled = isDisabled != 0
	return &u, nil
}

func (s *Store) UpdateProfile(ctx context.Context, userID int64, name, avatar, bio *string) (*User, error) {
	u, err := s.GetUserByID(ctx, userID)
	if err != nil {
		return nil, err
	}
	if name != nil {
		n := truncateRunes(*name, 16)
		if n != "" {
			u.Nickname = n
		}
	}
	if avatar != nil {
		u.AvatarURL = truncateRunes(*avatar, 128)
	}
	if bio != nil {
		u.Bio = truncateRunes(*bio, 80)
	}
	u.UpdatedAt = time.Now().Unix()

	_, err = s.WriteDB.ExecContext(ctx, `
		UPDATE users SET nickname = ?, avatar_url = ?, bio = ?, updated_at = ? WHERE id = ?
	`, u.Nickname, u.AvatarURL, u.Bio, u.UpdatedAt, userID)
	if err != nil {
		return nil, err
	}
	// Also keep author name on shares updated
	_, _ = s.WriteDB.ExecContext(ctx, `UPDATE world_shares SET owner_name = ? WHERE user_id = ?`, u.Nickname, userID)
	return u, nil
}

func (s *Store) UpdatePassword(ctx context.Context, email, newPasswordHash string) error {
	email = strings.ToLower(strings.TrimSpace(email))
	now := time.Now().Unix()
	res, err := s.WriteDB.ExecContext(ctx, `
		UPDATE users SET password_hash = ?, updated_at = ? WHERE email = ?
	`, newPasswordHash, now, email)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return ErrUserNotFound
	}
	return nil
}

func (s *Store) SetUserDisabled(ctx context.Context, email string, disabled bool) error {
	email = strings.ToLower(strings.TrimSpace(email))
	val := 0
	if disabled {
		val = 1
	}
	res, err := s.WriteDB.ExecContext(ctx, `UPDATE users SET is_disabled = ?, updated_at = ? WHERE email = ?`, val, time.Now().Unix(), email)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrUserNotFound
	}
	return nil
}

func (s *Store) ListUsers(ctx context.Context) ([]User, error) {
	rows, err := s.ReadDB.QueryContext(ctx, `
		SELECT id, email, nickname, avatar_url, bio, last_seen_at, is_admin, is_disabled, created_at
		FROM users ORDER BY id ASC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var list []User
	for rows.Next() {
		var u User
		var adm, dis int
		if err := rows.Scan(&u.ID, &u.Email, &u.Nickname, &u.AvatarURL, &u.Bio, &u.LastSeenAt, &adm, &dis, &u.CreatedAt); err != nil {
			return nil, err
		}
		u.IsAdmin = adm != 0
		u.IsDisabled = dis != 0
		list = append(list, u)
	}
	return list, nil
}

// Sessions

func (s *Store) CreateSession(ctx context.Context, tokenHash string, userID int64, ua, ip string, ttl time.Duration) error {
	now := time.Now().Unix()
	exp := time.Now().Add(ttl).Unix()
	_, err := s.WriteDB.ExecContext(ctx, `
		INSERT INTO sessions (token_hash, user_id, user_agent, ip_addr, expires_at, created_at)
		VALUES (?, ?, ?, ?, ?, ?)
	`, tokenHash, userID, truncateRunes(ua, 200), truncateRunes(ip, 64), exp, now)
	return err
}

func (s *Store) GetUserBySession(ctx context.Context, tokenHash string, slideTTL time.Duration) (*User, error) {
	now := time.Now().Unix()
	var userID, expiresAt int64
	err := s.ReadDB.QueryRowContext(ctx, `
		SELECT user_id, expires_at FROM sessions WHERE token_hash = ?
	`, tokenHash).Scan(&userID, &expiresAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrSessionExpired
	}
	if err != nil {
		return nil, err
	}
	if expiresAt < now {
		_, _ = s.WriteDB.ExecContext(ctx, `DELETE FROM sessions WHERE token_hash = ?`, tokenHash)
		return nil, ErrSessionExpired
	}

	u, err := s.GetUserByID(ctx, userID)
	if err != nil {
		return nil, err
	}
	if u.IsDisabled {
		return nil, ErrUserDisabled
	}

	// Sliding expiration if remaining time is less than 25 days
	newExp := time.Now().Add(slideTTL).Unix()
	if newExp-expiresAt > 3600 {
		_, _ = s.WriteDB.ExecContext(ctx, `UPDATE sessions SET expires_at = ? WHERE token_hash = ?`, newExp, tokenHash)
	}
	return u, nil
}

func (s *Store) DeleteSession(ctx context.Context, tokenHash string) error {
	_, err := s.WriteDB.ExecContext(ctx, `DELETE FROM sessions WHERE token_hash = ?`, tokenHash)
	return err
}

func (s *Store) DeleteAllUserSessions(ctx context.Context, userID int64) error {
	_, err := s.WriteDB.ExecContext(ctx, `DELETE FROM sessions WHERE user_id = ?`, userID)
	return err
}

// Invites

func (s *Store) CreateInvites(ctx context.Context, count, maxUses int) ([]string, error) {
	if count <= 0 {
		count = 1
	}
	if maxUses <= 0 {
		maxUses = 1
	}
	now := time.Now().Unix()
	var codes []string
	for i := 0; i < count; i++ {
		b := make([]byte, 6)
		_, _ = rand.Read(b)
		code := "INV-" + strings.ToUpper(hex.EncodeToString(b))
		_, err := s.WriteDB.ExecContext(ctx, `
			INSERT INTO invites (code, max_uses, used_count, created_by, created_at)
			VALUES (?, ?, 0, 'cli', ?)
		`, code, maxUses, now)
		if err != nil {
			return nil, fmt.Errorf("insert invite: %w", err)
		}
		codes = append(codes, code)
	}
	return codes, nil
}

// Password Reset Tokens

func (s *Store) CreatePasswordReset(ctx context.Context, tokenHash string, userID int64, ttl time.Duration) error {
	now := time.Now().Unix()
	exp := time.Now().Add(ttl).Unix()
	_, err := s.WriteDB.ExecContext(ctx, `
		INSERT INTO password_resets (token_hash, user_id, expires_at, used, created_at)
		VALUES (?, ?, ?, 0, ?)
	`, tokenHash, userID, exp, now)
	return err
}

func (s *Store) ConsumePasswordReset(ctx context.Context, tokenHash, newPasswordHash string) error {
	now := time.Now().Unix()
	tx, err := s.WriteDB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	var userID, exp int64
	var used int
	err = tx.QueryRowContext(ctx, `
		SELECT user_id, expires_at, used FROM password_resets WHERE token_hash = ?
	`, tokenHash).Scan(&userID, &exp, &used)
	if err != nil || used != 0 || exp < now {
		return errors.New("invalid or expired reset token")
	}

	if _, err := tx.ExecContext(ctx, `UPDATE password_resets SET used = 1 WHERE token_hash = ?`, tokenHash); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?`, newPasswordHash, now, userID); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM sessions WHERE user_id = ?`, userID); err != nil {
		return err
	}
	return tx.Commit()
}
