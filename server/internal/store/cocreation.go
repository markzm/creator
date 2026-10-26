package store

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"
)

var (
	ErrProjectNotFound  = errors.New("cocreation project not found")
	ErrProjectForbidden = errors.New("只有企划负责人才能修改企划设置或成员")
	ErrProjectClosed    = errors.New("该企划暂未开放同人转正申请")
	ErrCommentNotFound  = errors.New("comment not found")
	ErrCommentForbidden = errors.New("permission denied to delete comment")
	ErrInvalidParent    = errors.New("回复的目标评论不存在或不属于该作品")
	ErrUserMuted        = errors.New("您已被管理员禁言，无法发表评论或公开作品")
	ErrCanonForbidden   = errors.New("只有企划负责人、企划管理员或站点管理员可以审批转正")
	ErrCanonNotEligible = errors.New("该作品不是共创企划中的同人作品，或当前状态不允许此操作")
)

const (
	CanonReviewNone     = "none"
	CanonReviewPending  = "pending"
	CanonReviewApproved = "approved"
	CanonReviewRejected = "rejected"
)

type SettingComment struct {
	ID         int64            `json:"id"`
	ShareID    string           `json:"shareId"`
	UserID     int64            `json:"userId"`
	UserName   string           `json:"userName"`
	UserAvatar string           `json:"userAvatar"`
	Content    string           `json:"content"`
	ParentID   int64            `json:"parentId"`
	LikeCount  int              `json:"likeCount"`
	HasLiked   bool             `json:"hasLiked"`
	CreatedAt  int64            `json:"createdAt"`
	Replies    []SettingComment `json:"replies"`
}

type Notification struct {
	ID         int64  `json:"id"`
	UserID     int64  `json:"userId"`
	SenderID   int64  `json:"senderId"`
	SenderName string `json:"senderName"`
	Type       string `json:"type"` // 'doujin_created' | 'canon_requested' | 'canon_approved' | 'canon_rejected' | 'comment_reply' | 'comment_liked' | 'admin_alert'
	Title      string `json:"title"`
	Content    string `json:"content"`
	TargetID   string `json:"targetId"`
	TargetKind string `json:"targetKind"`
	IsRead     bool   `json:"isRead"`
	CreatedAt  int64  `json:"createdAt"`
}

type ProjectMember struct {
	UserID int64  `json:"userId"`
	Name   string `json:"name"`
	Avatar string `json:"avatar"`
	Role   string `json:"role"` // 'owner' | 'admin'
}

type CocreationProject struct {
	ID           string          `json:"id"`
	WorldID      string          `json:"worldId"`
	WorldTitle   string          `json:"worldTitle"`
	OwnerID      int64           `json:"ownerId"`
	OwnerName    string          `json:"ownerName"`
	Admins       []string        `json:"admins"` // legacy display list (emails); authority lives in Members
	Members      []ProjectMember `json:"members"`
	Summary      string          `json:"summary"`
	IsOpenDoujin bool            `json:"isOpenDoujin"`
	PendingCount int             `json:"pendingCount"`
	CreatedAt    int64           `json:"createdAt"`
	UpdatedAt    int64           `json:"updatedAt"`
}

type CreatorProfile struct {
	User            LobbyUser           `json:"user"`
	IsAdmin         bool                `json:"isAdmin"`
	IsSuperAdmin    bool                `json:"isSuperAdmin"`
	IsMuted         bool                `json:"isMuted"`
	CreatedAt       int64               `json:"createdAt"`
	PublishedShares []WorldShare        `json:"publishedShares"`
	Cocreations     []CocreationProject `json:"cocreations"`
}

type execer interface {
	ExecContext(ctx context.Context, query string, args ...interface{}) (sql.Result, error)
	QueryRowContext(ctx context.Context, query string, args ...interface{}) *sql.Row
	QueryContext(ctx context.Context, query string, args ...interface{}) (*sql.Rows, error)
}

func (s *Store) isUserMuted(ctx context.Context, q execer, userID int64) bool {
	var isMuted int
	_ = q.QueryRowContext(ctx, `SELECT COALESCE(is_muted, 0) FROM users WHERE id = ?`, userID).Scan(&isMuted)
	return isMuted != 0
}

// ----------------------------------------------------
// Notifications (written synchronously inside the caller's transaction)
// ----------------------------------------------------

// createNotificationTx inserts a notification. When dedupeWindow > 0 an identical
// (user, sender, type, target) notification inside the window suppresses the new one, which
// stops like/unlike or repeated requests from spamming the inbox.
func (s *Store) createNotificationTx(ctx context.Context, q execer, userID, senderID int64, senderName, notifType, title, content, targetID, targetKind string, dedupeWindow time.Duration) error {
	if userID <= 0 || userID == senderID {
		return nil
	}
	now := time.Now().Unix()
	if dedupeWindow > 0 {
		var dup int
		_ = q.QueryRowContext(ctx, `
			SELECT COUNT(*) FROM notifications
			WHERE user_id = ? AND sender_id = ? AND type = ? AND target_id = ? AND created_at >= ?
		`, userID, senderID, notifType, targetID, now-int64(dedupeWindow.Seconds())).Scan(&dup)
		if dup > 0 {
			return nil
		}
	}
	_, err := q.ExecContext(ctx, `
		INSERT INTO notifications (user_id, sender_id, sender_name, type, title, content, target_id, target_kind, is_read, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
	`, userID, senderID, truncateRunes(senderName, 32), notifType, truncateRunes(title, 200), truncateRunes(content, 500), targetID, targetKind, now)
	return err
}

// CreateNotification is the non-transactional convenience wrapper (admin alerts etc.).
func (s *Store) CreateNotification(ctx context.Context, userID, senderID int64, senderName, notifType, title, content, targetID, targetKind string) error {
	return s.createNotificationTx(ctx, s.WriteDB, userID, senderID, senderName, notifType, title, content, targetID, targetKind, 0)
}

// notifyProjectMembersTx fans a notification out to every project member except `exceptUserID`.
func (s *Store) notifyProjectMembersTx(ctx context.Context, q execer, projectID string, exceptUserID, senderID int64, senderName, notifType, title, content, targetID string) error {
	rows, err := q.QueryContext(ctx, `SELECT user_id FROM cocreation_members WHERE project_id = ?`, projectID)
	if err != nil {
		return err
	}
	var ids []int64
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err == nil && id != exceptUserID {
			ids = append(ids, id)
		}
	}
	rows.Close()
	for _, id := range ids {
		if err := s.createNotificationTx(ctx, q, id, senderID, senderName, notifType, title, content, targetID, "share", 24*time.Hour); err != nil {
			return err
		}
	}
	return nil
}

func (s *Store) ListNotifications(ctx context.Context, userID int64, limit int) ([]Notification, int, error) {
	if limit <= 0 || limit > 50 {
		limit = 30
	}

	var unreadCount int
	_ = s.ReadDB.QueryRowContext(ctx, `SELECT COUNT(*) FROM notifications WHERE user_id = ? AND is_read = 0`, userID).Scan(&unreadCount)

	rows, err := s.ReadDB.QueryContext(ctx, `
		SELECT id, user_id, sender_id, sender_name, type, title, content, target_id, target_kind, is_read, created_at
		FROM notifications
		WHERE user_id = ?
		ORDER BY created_at DESC, id DESC
		LIMIT ?
	`, userID, limit)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	list := make([]Notification, 0)
	for rows.Next() {
		var n Notification
		var read int
		if err := rows.Scan(&n.ID, &n.UserID, &n.SenderID, &n.SenderName, &n.Type, &n.Title, &n.Content, &n.TargetID, &n.TargetKind, &read, &n.CreatedAt); err != nil {
			return nil, 0, err
		}
		n.IsRead = read != 0
		list = append(list, n)
	}

	return list, unreadCount, nil
}

func (s *Store) MarkNotificationsRead(ctx context.Context, userID int64) error {
	_, err := s.WriteDB.ExecContext(ctx, `UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0`, userID)
	return err
}

// MarkNotificationRead marks a single notification as read; it must belong to the user.
func (s *Store) MarkNotificationRead(ctx context.Context, userID, notificationID int64) error {
	_, err := s.WriteDB.ExecContext(ctx, `UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?`, notificationID, userID)
	return err
}

// ----------------------------------------------------
// Comments / Discussions
// ----------------------------------------------------

func (s *Store) AddComment(ctx context.Context, shareID string, userID int64, userName, userAvatar, content string, parentID int64) (*SettingComment, error) {
	content = strings.TrimSpace(content)
	if content == "" {
		return nil, errors.New("评论内容不能为空")
	}
	content = truncateRunes(content, 1000)
	now := time.Now().Unix()

	tx, err := s.WriteDB.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	if s.isUserMuted(ctx, tx, userID) {
		return nil, ErrUserMuted
	}

	var shareOwnerID int64
	var shareTitle string
	if err := tx.QueryRowContext(ctx, `SELECT user_id, title FROM world_shares WHERE id = ?`, shareID).Scan(&shareOwnerID, &shareTitle); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrShareNotFound
		}
		return nil, err
	}

	var parentUserID int64
	if parentID > 0 {
		var parentShare string
		var parentParent int64
		err := tx.QueryRowContext(ctx, `SELECT share_id, parent_id, user_id FROM setting_comments WHERE id = ?`, parentID).Scan(&parentShare, &parentParent, &parentUserID)
		if err != nil || parentShare != shareID || parentParent != 0 {
			return nil, ErrInvalidParent
		}
	} else {
		parentID = 0
	}

	res, err := tx.ExecContext(ctx, `
		INSERT INTO setting_comments (share_id, user_id, user_name, user_avatar, content, parent_id, like_count, created_at)
		VALUES (?, ?, ?, ?, ?, ?, 0, ?)
	`, shareID, userID, userName, userAvatar, content, parentID, now)
	if err != nil {
		return nil, err
	}
	cid, err := res.LastInsertId()
	if err != nil {
		return nil, err
	}

	if parentID > 0 && parentUserID != userID {
		if err := s.createNotificationTx(ctx, tx, parentUserID, userID, userName, "comment_reply",
			fmt.Sprintf("%s 回复了您的评论", userName), content, shareID, "share", 0); err != nil {
			return nil, err
		}
	}
	if shareOwnerID != userID && shareOwnerID != parentUserID {
		if err := s.createNotificationTx(ctx, tx, shareOwnerID, userID, userName, "comment_reply",
			fmt.Sprintf("%s 在《%s》下发表了评论", userName, shareTitle), content, shareID, "share", 0); err != nil {
			return nil, err
		}
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}

	return &SettingComment{
		ID:         cid,
		ShareID:    shareID,
		UserID:     userID,
		UserName:   userName,
		UserAvatar: userAvatar,
		Content:    content,
		ParentID:   parentID,
		CreatedAt:  now,
		Replies:    []SettingComment{},
	}, nil
}

func (s *Store) ListComments(ctx context.Context, shareID string, currentUserID int64) ([]SettingComment, error) {
	rows, err := s.ReadDB.QueryContext(ctx, `
		SELECT id, share_id, user_id, user_name, user_avatar, content, parent_id, like_count, created_at
		FROM setting_comments
		WHERE share_id = ?
		ORDER BY created_at ASC, id ASC
	`, shareID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var all []SettingComment
	cIDs := make([]int64, 0)
	for rows.Next() {
		var c SettingComment
		if err := rows.Scan(&c.ID, &c.ShareID, &c.UserID, &c.UserName, &c.UserAvatar, &c.Content, &c.ParentID, &c.LikeCount, &c.CreatedAt); err != nil {
			return nil, err
		}
		c.Replies = []SettingComment{}
		all = append(all, c)
		cIDs = append(cIDs, c.ID)
	}

	likedSet := make(map[int64]bool)
	if currentUserID > 0 && len(cIDs) > 0 {
		placeholders := make([]string, len(cIDs))
		args := make([]interface{}, len(cIDs)+1)
		args[0] = currentUserID
		for i, id := range cIDs {
			placeholders[i] = "?"
			args[i+1] = id
		}
		q := fmt.Sprintf("SELECT comment_id FROM comment_likes WHERE user_id = ? AND comment_id IN (%s)", strings.Join(placeholders, ","))
		lRows, err := s.ReadDB.QueryContext(ctx, q, args...)
		if err == nil {
			for lRows.Next() {
				var lid int64
				if err := lRows.Scan(&lid); err == nil {
					likedSet[lid] = true
				}
			}
			lRows.Close()
		}
	}

	rootList := make([]SettingComment, 0)
	rootIndex := make(map[int64]int)
	for i := range all {
		all[i].HasLiked = likedSet[all[i].ID]
		if all[i].ParentID == 0 {
			rootIndex[all[i].ID] = len(rootList)
			rootList = append(rootList, all[i])
		}
	}
	for _, c := range all {
		if c.ParentID > 0 {
			if idx, ok := rootIndex[c.ParentID]; ok {
				rootList[idx].Replies = append(rootList[idx].Replies, c)
			} else {
				rootList = append(rootList, c)
			}
		}
	}
	return rootList, nil
}

// ToggleCommentLike flips the like state atomically and recomputes like_count from the likes table.
func (s *Store) ToggleCommentLike(ctx context.Context, commentID int64, userID int64) (bool, int, error) {
	tx, err := s.WriteDB.BeginTx(ctx, nil)
	if err != nil {
		return false, 0, err
	}
	defer tx.Rollback()

	var authorID int64
	var shareID, content string
	if err := tx.QueryRowContext(ctx, `SELECT user_id, share_id, content FROM setting_comments WHERE id = ?`, commentID).Scan(&authorID, &shareID, &content); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return false, 0, ErrCommentNotFound
		}
		return false, 0, err
	}

	now := time.Now().Unix()
	res, err := tx.ExecContext(ctx, `INSERT OR IGNORE INTO comment_likes (comment_id, user_id, created_at) VALUES (?, ?, ?)`, commentID, userID, now)
	if err != nil {
		return false, 0, err
	}
	inserted, _ := res.RowsAffected()
	liked := inserted == 1
	if !liked {
		if _, err := tx.ExecContext(ctx, `DELETE FROM comment_likes WHERE comment_id = ? AND user_id = ?`, commentID, userID); err != nil {
			return false, 0, err
		}
	}
	if _, err := tx.ExecContext(ctx, `UPDATE setting_comments SET like_count = (SELECT COUNT(*) FROM comment_likes WHERE comment_id = ?) WHERE id = ?`, commentID, commentID); err != nil {
		return false, 0, err
	}
	var count int
	if err := tx.QueryRowContext(ctx, `SELECT like_count FROM setting_comments WHERE id = ?`, commentID).Scan(&count); err != nil {
		return false, 0, err
	}
	if liked && authorID != userID {
		var likerName string
		_ = tx.QueryRowContext(ctx, `SELECT nickname FROM users WHERE id = ?`, userID).Scan(&likerName)
		if likerName == "" {
			likerName = "某位创作者"
		}
		if err := s.createNotificationTx(ctx, tx, authorID, userID, likerName, "comment_liked",
			fmt.Sprintf("%s 赞了您的评论", likerName), content, shareID, "share", 24*time.Hour); err != nil {
			return false, 0, err
		}
	}
	if err := tx.Commit(); err != nil {
		return false, 0, err
	}
	return liked, count, nil
}

func (s *Store) DeleteComment(ctx context.Context, commentID int64, userID int64, isAdmin bool) error {
	var authorID int64
	err := s.ReadDB.QueryRowContext(ctx, `SELECT user_id FROM setting_comments WHERE id = ?`, commentID).Scan(&authorID)
	if errors.Is(err, sql.ErrNoRows) {
		return ErrCommentNotFound
	}
	if err != nil {
		return err
	}
	if !isAdmin && authorID != userID {
		return ErrCommentForbidden
	}
	_, err = s.WriteDB.ExecContext(ctx, `DELETE FROM setting_comments WHERE id = ? OR parent_id = ?`, commentID, commentID)
	return err
}

// ----------------------------------------------------
// Co-creation Projects & Membership
// ----------------------------------------------------

// ResolveUsersByEmail maps emails to user ids; unknown emails are returned in `unresolved`.
func (s *Store) ResolveUsersByEmail(ctx context.Context, emails []string) (ids []int64, unresolved []string) {
	seen := map[string]bool{}
	for _, raw := range emails {
		e := strings.ToLower(strings.TrimSpace(raw))
		if e == "" || seen[e] {
			continue
		}
		seen[e] = true
		var id int64
		if err := s.ReadDB.QueryRowContext(ctx, `SELECT id FROM users WHERE email = ?`, e).Scan(&id); err == nil {
			ids = append(ids, id)
		} else {
			unresolved = append(unresolved, e)
		}
	}
	return ids, unresolved
}

// BackfillProjectMembers makes sure every project owner is a member and resolves legacy
// `admins_json` entries (emails) into member rows. Idempotent.
func (s *Store) BackfillProjectMembers(ctx context.Context) error {
	rows, err := s.ReadDB.QueryContext(ctx, `SELECT id, owner_id, admins_json, created_at FROM cocreation_projects`)
	if err != nil {
		// Table may not exist on very old databases that never applied 003.
		return nil
	}
	type row struct {
		id      string
		owner   int64
		admins  string
		created int64
	}
	var all []row
	for rows.Next() {
		var r row
		if err := rows.Scan(&r.id, &r.owner, &r.admins, &r.created); err == nil {
			all = append(all, r)
		}
	}
	rows.Close()
	for _, r := range all {
		if _, err := s.WriteDB.ExecContext(ctx, `INSERT OR IGNORE INTO cocreation_members (project_id, user_id, role, created_at) VALUES (?, ?, 'owner', ?)`, r.id, r.owner, r.created); err != nil {
			return err
		}
		var admins []string
		_ = json.Unmarshal([]byte(r.admins), &admins)
		ids, _ := s.ResolveUsersByEmail(ctx, admins)
		for _, id := range ids {
			if id == r.owner {
				continue
			}
			if _, err := s.WriteDB.ExecContext(ctx, `INSERT OR IGNORE INTO cocreation_members (project_id, user_id, role, created_at) VALUES (?, ?, 'admin', ?)`, r.id, id, time.Now().Unix()); err != nil {
				return err
			}
		}
	}
	return nil
}

func (s *Store) loadProjectMembers(ctx context.Context, projectIDs []string) (map[string][]ProjectMember, error) {
	out := make(map[string][]ProjectMember, len(projectIDs))
	for _, id := range projectIDs {
		out[id] = []ProjectMember{}
	}
	if len(projectIDs) == 0 {
		return out, nil
	}
	placeholders := make([]string, len(projectIDs))
	args := make([]interface{}, len(projectIDs))
	for i, id := range projectIDs {
		placeholders[i] = "?"
		args[i] = id
	}
	rows, err := s.ReadDB.QueryContext(ctx, fmt.Sprintf(`
		SELECT m.project_id, m.user_id, u.nickname, u.avatar_url, m.role
		FROM cocreation_members m JOIN users u ON u.id = m.user_id
		WHERE m.project_id IN (%s)
		ORDER BY CASE m.role WHEN 'owner' THEN 0 ELSE 1 END, m.created_at ASC
	`, strings.Join(placeholders, ",")), args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var pid string
		var m ProjectMember
		if err := rows.Scan(&pid, &m.UserID, &m.Name, &m.Avatar, &m.Role); err != nil {
			return nil, err
		}
		out[pid] = append(out[pid], m)
	}
	return out, nil
}

func (s *Store) scanProjects(ctx context.Context, rows *sql.Rows) ([]CocreationProject, error) {
	list := make([]CocreationProject, 0)
	ids := make([]string, 0)
	for rows.Next() {
		var p CocreationProject
		var adminsStr string
		var openDoujin int
		if err := rows.Scan(&p.ID, &p.WorldID, &p.WorldTitle, &p.OwnerID, &p.OwnerName, &adminsStr, &p.Summary, &openDoujin, &p.PendingCount, &p.CreatedAt, &p.UpdatedAt); err != nil {
			return nil, err
		}
		p.IsOpenDoujin = openDoujin != 0
		_ = json.Unmarshal([]byte(adminsStr), &p.Admins)
		if p.Admins == nil {
			p.Admins = []string{}
		}
		list = append(list, p)
		ids = append(ids, p.ID)
	}
	rows.Close()
	members, err := s.loadProjectMembers(ctx, ids)
	if err != nil {
		return nil, err
	}
	for i := range list {
		list[i].Members = members[list[i].ID]
	}
	return list, nil
}

const projectSelect = `
	SELECT p.id, p.world_id, p.world_title, p.owner_id, p.owner_name, p.admins_json, p.summary, p.is_open_doujin,
	       (SELECT COUNT(*) FROM world_shares ws WHERE ws.cocreation_id = p.id AND ws.canon_review = 'pending'),
	       p.created_at, p.updated_at
	FROM cocreation_projects p
`

func (s *Store) CreateCocreationProject(ctx context.Context, worldID, worldTitle string, ownerID int64, ownerName, summary string, adminEmails []string) (*CocreationProject, []string, error) {
	b := make([]byte, 6)
	_, _ = rand.Read(b)
	id := "ccp_" + hex.EncodeToString(b)
	now := time.Now().Unix()

	worldTitle = truncateRunes(strings.TrimSpace(worldTitle), 80)
	summary = truncateRunes(strings.TrimSpace(summary), 500)
	worldID = truncateRunes(strings.TrimSpace(worldID), 64)
	adminIDs, unresolved := s.ResolveUsersByEmail(ctx, adminEmails)
	var resolvedEmails []string
	for _, e := range adminEmails {
		e = strings.ToLower(strings.TrimSpace(e))
		found := false
		for _, u := range unresolved {
			if u == e {
				found = true
				break
			}
		}
		if e != "" && !found {
			resolvedEmails = append(resolvedEmails, e)
		}
	}
	if resolvedEmails == nil {
		resolvedEmails = []string{}
	}
	adminsBytes, _ := json.Marshal(resolvedEmails)

	tx, err := s.WriteDB.BeginTx(ctx, nil)
	if err != nil {
		return nil, nil, err
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO cocreation_projects (id, world_id, world_title, owner_id, owner_name, admins_json, summary, is_open_doujin, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
	`, id, worldID, worldTitle, ownerID, ownerName, string(adminsBytes), summary, now, now); err != nil {
		return nil, nil, err
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO cocreation_members (project_id, user_id, role, created_at) VALUES (?, ?, 'owner', ?)`, id, ownerID, now); err != nil {
		return nil, nil, err
	}
	for _, uid := range adminIDs {
		if uid == ownerID {
			continue
		}
		if _, err := tx.ExecContext(ctx, `INSERT OR IGNORE INTO cocreation_members (project_id, user_id, role, created_at) VALUES (?, ?, 'admin', ?)`, id, uid, now); err != nil {
			return nil, nil, err
		}
	}
	if err := tx.Commit(); err != nil {
		return nil, nil, err
	}
	proj, err := s.GetCocreationProject(ctx, id)
	if err != nil {
		return nil, nil, err
	}
	return proj, unresolved, nil
}

func (s *Store) GetCocreationProject(ctx context.Context, id string) (*CocreationProject, error) {
	rows, err := s.ReadDB.QueryContext(ctx, projectSelect+` WHERE p.id = ?`, id)
	if err != nil {
		return nil, err
	}
	list, err := s.scanProjects(ctx, rows)
	if err != nil {
		return nil, err
	}
	if len(list) == 0 {
		return nil, ErrProjectNotFound
	}
	return &list[0], nil
}

func (s *Store) ListCocreationProjects(ctx context.Context, limit int) ([]CocreationProject, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	rows, err := s.ReadDB.QueryContext(ctx, projectSelect+` ORDER BY p.updated_at DESC LIMIT ?`, limit)
	if err != nil {
		return nil, err
	}
	return s.scanProjects(ctx, rows)
}

// ListProjectsForUser returns projects the user owns or administers.
func (s *Store) ListProjectsForUser(ctx context.Context, userID int64, limit int) ([]CocreationProject, error) {
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	rows, err := s.ReadDB.QueryContext(ctx, projectSelect+`
		WHERE p.id IN (SELECT project_id FROM cocreation_members WHERE user_id = ?)
		ORDER BY p.updated_at DESC LIMIT ?`, userID, limit)
	if err != nil {
		return nil, err
	}
	return s.scanProjects(ctx, rows)
}

// IsProjectReviewer reports whether the user is a member (owner or admin) of the project.
func (s *Store) IsProjectReviewer(ctx context.Context, projectID string, userID int64) (bool, error) {
	var exists int
	if err := s.ReadDB.QueryRowContext(ctx, `SELECT COUNT(*) FROM cocreation_projects WHERE id = ?`, projectID).Scan(&exists); err != nil {
		return false, err
	}
	if exists == 0 {
		return false, ErrProjectNotFound
	}
	var n int
	if err := s.ReadDB.QueryRowContext(ctx, `SELECT COUNT(*) FROM cocreation_members WHERE project_id = ? AND user_id = ?`, projectID, userID).Scan(&n); err != nil {
		return false, err
	}
	return n > 0, nil
}

// UpdateProject lets the owner edit summary / open-doujin flag.
func (s *Store) UpdateProject(ctx context.Context, projectID string, actorID int64, summary *string, isOpenDoujin *bool) error {
	p, err := s.GetCocreationProject(ctx, projectID)
	if err != nil {
		return err
	}
	if p.OwnerID != actorID {
		return ErrProjectForbidden
	}
	if summary != nil {
		p.Summary = truncateRunes(strings.TrimSpace(*summary), 500)
	}
	open := 1
	if isOpenDoujin != nil {
		if !*isOpenDoujin {
			open = 0
		}
	} else if !p.IsOpenDoujin {
		open = 0
	}
	_, err = s.WriteDB.ExecContext(ctx, `UPDATE cocreation_projects SET summary = ?, is_open_doujin = ?, updated_at = ? WHERE id = ?`,
		p.Summary, open, time.Now().Unix(), projectID)
	return err
}

// SetProjectAdmins replaces the admin members (owner excluded) of a project. Owner only.
func (s *Store) SetProjectAdmins(ctx context.Context, projectID string, actorID int64, userIDs []int64, displayEmails []string) error {
	p, err := s.GetCocreationProject(ctx, projectID)
	if err != nil {
		return err
	}
	if p.OwnerID != actorID {
		return ErrProjectForbidden
	}
	if displayEmails == nil {
		displayEmails = []string{}
	}
	adminsBytes, _ := json.Marshal(displayEmails)
	now := time.Now().Unix()

	tx, err := s.WriteDB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, `DELETE FROM cocreation_members WHERE project_id = ? AND role <> 'owner'`, projectID); err != nil {
		return err
	}
	for _, uid := range userIDs {
		if uid == p.OwnerID {
			continue
		}
		if _, err := tx.ExecContext(ctx, `INSERT OR IGNORE INTO cocreation_members (project_id, user_id, role, created_at) VALUES (?, ?, 'admin', ?)`, projectID, uid, now); err != nil {
			return err
		}
	}
	if _, err := tx.ExecContext(ctx, `UPDATE cocreation_projects SET admins_json = ?, updated_at = ? WHERE id = ?`, string(adminsBytes), now, projectID); err != nil {
		return err
	}
	return tx.Commit()
}

// UpdateCocreationAdmins keeps the legacy email-list API: emails are resolved to members.
func (s *Store) UpdateCocreationAdmins(ctx context.Context, projectID string, ownerID int64, adminEmails []string) ([]string, error) {
	ids, unresolved := s.ResolveUsersByEmail(ctx, adminEmails)
	var resolved []string
	for _, e := range adminEmails {
		e = strings.ToLower(strings.TrimSpace(e))
		skip := e == ""
		for _, u := range unresolved {
			if u == e {
				skip = true
			}
		}
		if !skip {
			resolved = append(resolved, e)
		}
	}
	return unresolved, s.SetProjectAdmins(ctx, projectID, ownerID, ids, resolved)
}

// ----------------------------------------------------
// Canon review state machine
// ----------------------------------------------------

// RequestCanon moves a doujin share to the pending review state and notifies project members.
func (s *Store) RequestCanon(ctx context.Context, shareID string, userID int64) error {
	tx, err := s.WriteDB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	var ownerID int64
	var title, ownerName, cocreationID, canonStatus, review string
	err = tx.QueryRowContext(ctx, `
		SELECT user_id, title, owner_name, COALESCE(cocreation_id,''), COALESCE(canon_status,'canon'), COALESCE(canon_review,'none')
		FROM world_shares WHERE id = ?`, shareID).Scan(&ownerID, &title, &ownerName, &cocreationID, &canonStatus, &review)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return ErrShareNotFound
		}
		return err
	}
	if ownerID != userID {
		return ErrShareForbidden
	}
	if cocreationID == "" || canonStatus != "doujin" || (review != CanonReviewNone && review != CanonReviewRejected) {
		return ErrCanonNotEligible
	}
	var open int
	var worldTitle string
	if err := tx.QueryRowContext(ctx, `SELECT is_open_doujin, world_title FROM cocreation_projects WHERE id = ?`, cocreationID).Scan(&open, &worldTitle); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return ErrProjectNotFound
		}
		return err
	}
	if open == 0 {
		return ErrProjectClosed
	}
	now := time.Now().Unix()
	if _, err := tx.ExecContext(ctx, `UPDATE world_shares SET canon_review = 'pending', canon_requested = 1, updated_at = ? WHERE id = ?`, now, shareID); err != nil {
		return err
	}
	if err := s.notifyProjectMembersTx(ctx, tx, cocreationID, userID, userID, ownerName, "canon_requested",
		fmt.Sprintf("同人设定《%s》申请转为官方正典", title),
		fmt.Sprintf("创作者 %s 为共创企划《%s》创作的同人作品申请转正，请前往审核。", ownerName, worldTitle),
		shareID); err != nil {
		return err
	}
	return tx.Commit()
}

// ReviewCanon approves or rejects a doujin share. Reviewer must be a project member or site admin.
func (s *Store) ReviewCanon(ctx context.Context, shareID string, reviewerID int64, reviewerName string, approve, reviewerIsSiteAdmin bool) error {
	var authorID int64
	var title, cocreationID, canonStatus string
	err := s.ReadDB.QueryRowContext(ctx, `SELECT user_id, title, COALESCE(cocreation_id,''), COALESCE(canon_status,'canon') FROM world_shares WHERE id = ?`, shareID).
		Scan(&authorID, &title, &cocreationID, &canonStatus)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return ErrShareNotFound
		}
		return err
	}
	if cocreationID == "" || canonStatus != "doujin" {
		return ErrCanonNotEligible
	}
	if !reviewerIsSiteAdmin {
		ok, err := s.IsProjectReviewer(ctx, cocreationID, reviewerID)
		if err != nil {
			return err
		}
		if !ok {
			return ErrCanonForbidden
		}
	}

	tx, err := s.WriteDB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	now := time.Now().Unix()
	if approve {
		if _, err := tx.ExecContext(ctx, `UPDATE world_shares SET canon_status = 'canon', canon_review = 'approved', canon_requested = 0, reviewed_by = ?, reviewed_at = ?, updated_at = ? WHERE id = ?`, reviewerID, now, now, shareID); err != nil {
			return err
		}
		if err := s.createNotificationTx(ctx, tx, authorID, reviewerID, reviewerName, "canon_approved",
			fmt.Sprintf("🎉 恭喜！您的同人作品《%s》已被转为官方正典设定！", title),
			fmt.Sprintf("企划团队审核通过，已正式接纳《%s》为世界观官方正典设定！", title),
			shareID, "share", 0); err != nil {
			return err
		}
	} else {
		if _, err := tx.ExecContext(ctx, `UPDATE world_shares SET canon_review = 'rejected', canon_requested = 0, reviewed_by = ?, reviewed_at = ?, updated_at = ? WHERE id = ?`, reviewerID, now, now, shareID); err != nil {
			return err
		}
		if err := s.createNotificationTx(ctx, tx, authorID, reviewerID, reviewerName, "canon_rejected",
			fmt.Sprintf("同人作品《%s》的转正申请未通过", title),
			"企划团队暂未采纳本次申请。您可以根据企划设定继续完善后再次申请。",
			shareID, "share", 0); err != nil {
			return err
		}
	}
	return tx.Commit()
}

// ListCanonQueue lists shares of a project filtered by review status ('pending' by default).
func (s *Store) ListCanonQueue(ctx context.Context, projectID, status string, limit int) ([]WorldShare, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	if status == "" {
		status = CanonReviewPending
	}
	query := "SELECT " + shareSelectCols + " FROM world_shares WHERE cocreation_id = ?"
	args := []interface{}{projectID}
	if status != "all" {
		query += " AND canon_review = ?"
		args = append(args, status)
	}
	query += " ORDER BY updated_at DESC, id DESC LIMIT ?"
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

// ----------------------------------------------------
// Creator Profile
// ----------------------------------------------------

func (s *Store) GetCreatorProfile(ctx context.Context, userID int64) (*CreatorProfile, error) {
	u, err := s.GetUserByID(ctx, userID)
	if err != nil {
		return nil, err
	}

	now := time.Now().Unix()
	lUser := LobbyUser{
		ID:       u.ID,
		Name:     u.Nickname,
		Avatar:   u.AvatarURL,
		Bio:      u.Bio,
		Focus:    u.PresenceFocus,
		LastSeen: u.LastSeenAt,
		IsOnline: (now - u.LastSeenAt) < 300,
	}

	shares, err := s.ListUserItems(ctx, userID, "public", "all", 50)
	if err != nil {
		shares = []WorldShare{}
	}
	projs, err := s.ListProjectsForUser(ctx, userID, 10)
	if err != nil {
		projs = []CocreationProject{}
	}

	return &CreatorProfile{
		User:            lUser,
		IsAdmin:         u.IsAdmin,
		IsSuperAdmin:    u.IsSuperAdmin,
		IsMuted:         u.IsMuted,
		CreatedAt:       u.CreatedAt,
		PublishedShares: shares,
		Cocreations:     projs,
	}, nil
}
