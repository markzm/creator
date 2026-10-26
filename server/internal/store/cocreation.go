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
	ErrProjectNotFound   = errors.New("cocreation project not found")
	ErrCommentNotFound   = errors.New("comment not found")
	ErrCommentForbidden  = errors.New("permission denied to delete comment")
	ErrUserMuted         = errors.New("您已被管理员禁言，无法发表评论或公开作品")
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
	Replies    []SettingComment `json:"replies,omitempty"`
}

type Notification struct {
	ID         int64  `json:"id"`
	UserID     int64  `json:"userId"`
	SenderID   int64  `json:"senderId"`
	SenderName string `json:"senderName"`
	Type       string `json:"type"` // 'doujin_created' | 'canon_requested' | 'canon_approved' | 'comment_reply' | 'comment_liked' | 'admin_alert'
	Title      string `json:"title"`
	Content    string `json:"content"`
	TargetID   string `json:"targetId"`
	TargetKind string `json:"targetKind"`
	IsRead     bool   `json:"isRead"`
	CreatedAt  int64  `json:"createdAt"`
}

type CocreationProject struct {
	ID           string   `json:"id"`
	WorldID      string   `json:"worldId"`
	WorldTitle   string   `json:"worldTitle"`
	OwnerID      int64    `json:"ownerId"`
	OwnerName    string   `json:"ownerName"`
	Admins       []string `json:"admins"` // List of admin emails or nicknames
	Summary      string   `json:"summary"`
	IsOpenDoujin bool     `json:"isOpenDoujin"`
	CreatedAt    int64    `json:"createdAt"`
	UpdatedAt    int64    `json:"updatedAt"`
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

// ----------------------------------------------------
// Comments / Discussions
// ----------------------------------------------------

func (s *Store) AddComment(ctx context.Context, shareID string, userID int64, userName, userAvatar, content string, parentID int64) (*SettingComment, error) {
	// Check if user is muted
	var isMuted int
	if err := s.ReadDB.QueryRowContext(ctx, `SELECT COALESCE(is_muted, 0) FROM users WHERE id = ?`, userID).Scan(&isMuted); err == nil && isMuted != 0 {
		return nil, ErrUserMuted
	}

	content = strings.TrimSpace(content)
	if content == "" {
		return nil, errors.New("评论内容不能为空")
	}
	content = truncateRunes(content, 1000)
	now := time.Now().Unix()

	res, err := s.WriteDB.ExecContext(ctx, `
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

	c := &SettingComment{
		ID:         cid,
		ShareID:    shareID,
		UserID:     userID,
		UserName:   userName,
		UserAvatar: userAvatar,
		Content:    content,
		ParentID:   parentID,
		LikeCount:  0,
		HasLiked:   false,
		CreatedAt:  now,
	}

	// Trigger notifications
	go func() {
		bgCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		// If it is a reply, notify parent comment author
		if parentID > 0 {
			var parentUserID int64
			var parentContent string
			if err := s.ReadDB.QueryRowContext(bgCtx, `SELECT user_id, content FROM setting_comments WHERE id = ?`, parentID).Scan(&parentUserID, &parentContent); err == nil {
				if parentUserID != userID {
					_ = s.CreateNotification(bgCtx, parentUserID, userID, userName, "comment_reply",
						fmt.Sprintf("%s 回复了您的评论", userName),
						content, shareID, "share")
				}
			}
		}

		// Also notify share owner if not the commenter
		var shareOwnerID int64
		var shareTitle string
		if err := s.ReadDB.QueryRowContext(bgCtx, `SELECT user_id, title FROM world_shares WHERE id = ?`, shareID).Scan(&shareOwnerID, &shareTitle); err == nil {
			if shareOwnerID != userID {
				_ = s.CreateNotification(bgCtx, shareOwnerID, userID, userName, "comment_reply",
					fmt.Sprintf("%s 在《%s》下发表了评论", userName, shareTitle),
					content, shareID, "share")
			}
		}
	}()

	return c, nil
}

func (s *Store) ListComments(ctx context.Context, shareID string, currentUserID int64) ([]SettingComment, error) {
	rows, err := s.ReadDB.QueryContext(ctx, `
		SELECT id, share_id, user_id, user_name, user_avatar, content, parent_id, like_count, created_at
		FROM setting_comments
		WHERE share_id = ?
		ORDER BY created_at ASC
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
			defer lRows.Close()
			for lRows.Next() {
				var lid int64
				if err := lRows.Scan(&lid); err == nil {
					likedSet[lid] = true
				}
			}
		}
	}

	// Nest replies under root comments
	rootMap := make(map[int64]*SettingComment)
	var rootList []SettingComment

	for i := range all {
		all[i].HasLiked = likedSet[all[i].ID]
		if all[i].ParentID == 0 {
			rootList = append(rootList, all[i])
		}
	}
	for i := range rootList {
		rootMap[rootList[i].ID] = &rootList[i]
	}

	for _, c := range all {
		if c.ParentID > 0 {
			if parent, exists := rootMap[c.ParentID]; exists {
				parent.Replies = append(parent.Replies, c)
			} else {
				// Fallback to root list if parent was deleted or not found
				rootList = append(rootList, c)
			}
		}
	}

	return rootList, nil
}

func (s *Store) ToggleCommentLike(ctx context.Context, commentID int64, userID int64) (bool, int, error) {
	var exists int
	err := s.ReadDB.QueryRowContext(ctx, `SELECT COUNT(*) FROM comment_likes WHERE comment_id = ? AND user_id = ?`, commentID, userID).Scan(&exists)
	if err != nil {
		return false, 0, err
	}

	now := time.Now().Unix()
	var liked bool
	if exists > 0 {
		_, _ = s.WriteDB.ExecContext(ctx, `DELETE FROM comment_likes WHERE comment_id = ? AND user_id = ?`, commentID, userID)
		_, _ = s.WriteDB.ExecContext(ctx, `UPDATE setting_comments SET like_count = MAX(0, like_count - 1) WHERE id = ?`, commentID)
		liked = false
	} else {
		_, _ = s.WriteDB.ExecContext(ctx, `INSERT OR IGNORE INTO comment_likes (comment_id, user_id, created_at) VALUES (?, ?, ?)`, commentID, userID, now)
		_, _ = s.WriteDB.ExecContext(ctx, `UPDATE setting_comments SET like_count = like_count + 1 WHERE id = ?`, commentID)
		liked = true

		// Notify comment author
		go func() {
			bgCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer cancel()
			var authorID int64
			var shareID string
			var content string
			var likerName string
			_ = s.ReadDB.QueryRowContext(bgCtx, `SELECT nickname FROM users WHERE id = ?`, userID).Scan(&likerName)
			if likerName == "" {
				likerName = "某位创作者"
			}
			if err := s.ReadDB.QueryRowContext(bgCtx, `SELECT user_id, share_id, content FROM setting_comments WHERE id = ?`, commentID).Scan(&authorID, &shareID, &content); err == nil {
				if authorID != userID {
					_ = s.CreateNotification(bgCtx, authorID, userID, likerName, "comment_liked",
						fmt.Sprintf("%s 赞了您的评论", likerName),
						content, shareID, "share")
				}
			}
		}()
	}

	var count int
	_ = s.ReadDB.QueryRowContext(ctx, `SELECT like_count FROM setting_comments WHERE id = ?`, commentID).Scan(&count)
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
// Notifications
// ----------------------------------------------------

func (s *Store) CreateNotification(ctx context.Context, userID, senderID int64, senderName, notifType, title, content, targetID, targetKind string) error {
	now := time.Now().Unix()
	_, err := s.WriteDB.ExecContext(ctx, `
		INSERT INTO notifications (user_id, sender_id, sender_name, type, title, content, target_id, target_kind, is_read, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
	`, userID, senderID, senderName, notifType, title, content, targetID, targetKind, now)
	return err
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
		ORDER BY created_at DESC
		LIMIT ?
	`, userID, limit)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var list []Notification
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

// ----------------------------------------------------
// Co-creation Projects
// ----------------------------------------------------

func (s *Store) CreateCocreationProject(ctx context.Context, worldID, worldTitle string, ownerID int64, ownerName, summary string, admins []string) (*CocreationProject, error) {
	b := make([]byte, 6)
	_, _ = rand.Read(b)
	id := "ccp_" + hex.EncodeToString(b)
	now := time.Now().Unix()

	if admins == nil {
		admins = []string{}
	}
	adminsBytes, _ := json.Marshal(admins)

	_, err := s.WriteDB.ExecContext(ctx, `
		INSERT INTO cocreation_projects (id, world_id, world_title, owner_id, owner_name, admins_json, summary, is_open_doujin, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
	`, id, worldID, worldTitle, ownerID, ownerName, string(adminsBytes), summary, now, now)
	if err != nil {
		return nil, err
	}

	return &CocreationProject{
		ID:           id,
		WorldID:      worldID,
		WorldTitle:   worldTitle,
		OwnerID:      ownerID,
		OwnerName:    ownerName,
		Admins:       admins,
		Summary:      summary,
		IsOpenDoujin: true,
		CreatedAt:    now,
		UpdatedAt:    now,
	}, nil
}

func (s *Store) GetCocreationProject(ctx context.Context, id string) (*CocreationProject, error) {
	var p CocreationProject
	var adminsStr string
	var openDoujin int
	err := s.ReadDB.QueryRowContext(ctx, `
		SELECT id, world_id, world_title, owner_id, owner_name, admins_json, summary, is_open_doujin, created_at, updated_at
		FROM cocreation_projects WHERE id = ?
	`, id).Scan(&p.ID, &p.WorldID, &p.WorldTitle, &p.OwnerID, &p.OwnerName, &adminsStr, &p.Summary, &openDoujin, &p.CreatedAt, &p.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrProjectNotFound
	}
	if err != nil {
		return nil, err
	}
	p.IsOpenDoujin = openDoujin != 0
	_ = json.Unmarshal([]byte(adminsStr), &p.Admins)
	if p.Admins == nil {
		p.Admins = []string{}
	}
	return &p, nil
}

func (s *Store) ListCocreationProjects(ctx context.Context, limit int) ([]CocreationProject, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	rows, err := s.ReadDB.QueryContext(ctx, `
		SELECT id, world_id, world_title, owner_id, owner_name, admins_json, summary, is_open_doujin, created_at, updated_at
		FROM cocreation_projects
		ORDER BY updated_at DESC
		LIMIT ?
	`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []CocreationProject
	for rows.Next() {
		var p CocreationProject
		var adminsStr string
		var openDoujin int
		if err := rows.Scan(&p.ID, &p.WorldID, &p.WorldTitle, &p.OwnerID, &p.OwnerName, &adminsStr, &p.Summary, &openDoujin, &p.CreatedAt, &p.UpdatedAt); err != nil {
			return nil, err
		}
		p.IsOpenDoujin = openDoujin != 0
		_ = json.Unmarshal([]byte(adminsStr), &p.Admins)
		if p.Admins == nil {
			p.Admins = []string{}
		}
		list = append(list, p)
	}
	return list, nil
}

func (s *Store) UpdateCocreationAdmins(ctx context.Context, projectID string, ownerID int64, admins []string) error {
	p, err := s.GetCocreationProject(ctx, projectID)
	if err != nil {
		return err
	}
	if p.OwnerID != ownerID {
		return errors.New("只有企划最高负责人才能增减分部管理员")
	}

	adminsBytes, _ := json.Marshal(admins)
	now := time.Now().Unix()
	_, err = s.WriteDB.ExecContext(ctx, `
		UPDATE cocreation_projects SET admins_json = ?, updated_at = ? WHERE id = ?
	`, string(adminsBytes), now, projectID)
	return err
}

func (s *Store) RequestCanon(ctx context.Context, shareID string, userID int64) error {
	// Mark share as requesting canonization
	now := time.Now().Unix()
	res, err := s.WriteDB.ExecContext(ctx, `
		UPDATE world_shares SET canon_requested = 1, updated_at = ? WHERE id = ? AND user_id = ?
	`, now, shareID, userID)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return errors.New("未找到对应同人作品或无权申请")
	}

	// Find project and notify owner & admins
	go func() {
		bgCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		var shareTitle, ownerName, cocreationID string
		_ = s.ReadDB.QueryRowContext(bgCtx, `SELECT title, owner_name, COALESCE(cocreation_id, '') FROM world_shares WHERE id = ?`, shareID).
			Scan(&shareTitle, &ownerName, &cocreationID)

		if cocreationID != "" {
			proj, err := s.GetCocreationProject(bgCtx, cocreationID)
			if err == nil {
				// Notify owner
				_ = s.CreateNotification(bgCtx, proj.OwnerID, userID, ownerName, "canon_requested",
					fmt.Sprintf("同人设定《%s》申请转为官方正典", shareTitle),
					fmt.Sprintf("创作者 %s 为您的共创企划《%s》创作的同人作品申请转正为官方正典，请前往审核。", ownerName, proj.WorldTitle),
					shareID, "share")

				// Notify admin emails if mapped to user ID
				for _, adm := range proj.Admins {
					var admUID int64
					if err := s.ReadDB.QueryRowContext(bgCtx, `SELECT id FROM users WHERE email = ? OR nickname = ?`, adm, adm).Scan(&admUID); err == nil {
						if admUID != proj.OwnerID && admUID != userID {
							_ = s.CreateNotification(bgCtx, admUID, userID, ownerName, "canon_requested",
								fmt.Sprintf("同人设定《%s》申请转为官方正典", shareTitle),
								fmt.Sprintf("创作者 %s 为共创企划《%s》创作的同人作品申请转正为官方正典，请审核。", ownerName, proj.WorldTitle),
								shareID, "share")
						}
					}
				}
			}
		}
	}()

	return nil
}

func (s *Store) ApproveCanon(ctx context.Context, shareID string, reviewerID int64, reviewerName string) error {
	now := time.Now().Unix()
	var authorID int64
	var shareTitle, cocreationID string
	err := s.ReadDB.QueryRowContext(ctx, `SELECT user_id, title, COALESCE(cocreation_id, '') FROM world_shares WHERE id = ?`, shareID).
		Scan(&authorID, &shareTitle, &cocreationID)
	if err != nil {
		return err
	}

	_, err = s.WriteDB.ExecContext(ctx, `
		UPDATE world_shares SET canon_status = 'canon', canon_requested = 0, updated_at = ? WHERE id = ?
	`, now, shareID)
	if err != nil {
		return err
	}

	// Notify doujin creator that their setting is now official canon!
	go func() {
		bgCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		_ = s.CreateNotification(bgCtx, authorID, reviewerID, reviewerName, "canon_approved",
			fmt.Sprintf("🎉 恭喜！您的同人作品《%s》已被转为官方正典设定！", shareTitle),
			fmt.Sprintf("企划团队审核通过，已正式接纳《%s》为世界观官方正典设定！", shareTitle),
			shareID, "share")
	}()

	return nil
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

	// Fetch public shares
	shares, err := s.ListUserItems(ctx, userID, "all", "public", 50)
	if err != nil {
		shares = []WorldShare{}
	}

	// Fetch projects owned or participated
	var projs []CocreationProject
	rows, err := s.ReadDB.QueryContext(ctx, `
		SELECT id, world_id, world_title, owner_id, owner_name, admins_json, summary, is_open_doujin, created_at, updated_at
		FROM cocreation_projects
		WHERE owner_id = ?
		ORDER BY updated_at DESC
		LIMIT 10
	`, userID)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var p CocreationProject
			var adminsStr string
			var openDoujin int
			if err := rows.Scan(&p.ID, &p.WorldID, &p.WorldTitle, &p.OwnerID, &p.OwnerName, &adminsStr, &p.Summary, &openDoujin, &p.CreatedAt, &p.UpdatedAt); err == nil {
				p.IsOpenDoujin = openDoujin != 0
				_ = json.Unmarshal([]byte(adminsStr), &p.Admins)
				projs = append(projs, p)
			}
		}
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
