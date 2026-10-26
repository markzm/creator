package api

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"creator/server/internal/store"
)

// ----------------------------------------------------
// Comments & Discussions
// ----------------------------------------------------

func (s *Server) handleComments(w http.ResponseWriter, r *http.Request) {
	user := CurrentUser(r)
	path := strings.TrimPrefix(r.URL.Path, "/api/comments")
	path = strings.Trim(path, "/")

	// Sub-resource: /api/comments/:id/like or DELETE /api/comments/:id
	if path != "" {
		parts := strings.Split(path, "/")
		cid, err := strconv.ParseInt(parts[0], 10, 64)
		if err != nil {
			writeErr(w, http.StatusBadRequest, "评论 ID 无效")
			return
		}

		if len(parts) == 2 && parts[1] == "like" {
			if r.Method != http.MethodPost {
				writeErr(w, http.StatusMethodNotAllowed, "Method not allowed")
				return
			}
			if user == nil {
				writeErr(w, http.StatusUnauthorized, "请先登录")
				return
			}
			if !s.guard.Allow("like", strconv.FormatInt(user.ID, 10), 60, time.Minute) {
				writeErr(w, http.StatusTooManyRequests, "操作过于频繁，请稍后再试")
				return
			}
			liked, count, err := s.store.ToggleCommentLike(r.Context(), cid, user.ID)
			if err != nil {
				if errors.Is(err, store.ErrCommentNotFound) {
					writeErr(w, http.StatusNotFound, "评论不存在")
					return
				}
				writeErrLog(w, r, http.StatusInternalServerError, "操作点赞失败", err)
				return
			}
			writeJSON(w, http.StatusOK, map[string]interface{}{
				"liked":     liked,
				"likeCount": count,
			})
			return
		}

		if r.Method == http.MethodDelete {
			if user == nil {
				writeErr(w, http.StatusUnauthorized, "请先登录")
				return
			}
			err := s.store.DeleteComment(r.Context(), cid, user.ID, user.IsAdmin)
			if err != nil {
				if errors.Is(err, store.ErrCommentNotFound) {
					writeErr(w, http.StatusNotFound, "评论不存在")
					return
				}
				if errors.Is(err, store.ErrCommentForbidden) {
					writeErr(w, http.StatusForbidden, "仅作者或管理员可删除该评论")
					return
				}
				writeErr(w, http.StatusInternalServerError, "删除评论失败")
				return
			}
			writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
			return
		}

		writeErr(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	writeErr(w, http.StatusNotFound, "Endpoint not found")
}

func (s *Server) handleShareComments(w http.ResponseWriter, r *http.Request) {
	user := CurrentUser(r)
	// URL: /api/shares/:id/comments
	trimmed := strings.TrimPrefix(r.URL.Path, "/api/shares/")
	parts := strings.Split(trimmed, "/")
	if len(parts) < 2 || parts[1] != "comments" {
		writeErr(w, http.StatusNotFound, "Endpoint not found")
		return
	}
	shareID := parts[0]

	// Discussions follow the visibility of the share they belong to.
	sh, err := s.store.GetShare(r.Context(), shareID)
	if err != nil {
		if errors.Is(err, store.ErrShareNotFound) {
			writeErr(w, http.StatusNotFound, "作品不存在")
			return
		}
		writeErrLog(w, r, http.StatusInternalServerError, "读取作品失败", err)
		return
	}
	if !canViewShare(user, sh) {
		writeErr(w, http.StatusForbidden, "该作品为作者私有，暂不公开")
		return
	}

	switch r.Method {
	case http.MethodGet:
		var currentUID int64
		if user != nil {
			currentUID = user.ID
		}
		comments, err := s.store.ListComments(r.Context(), shareID, currentUID)
		if err != nil {
			writeErrLog(w, r, http.StatusInternalServerError, "获取讨论列表失败", err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"comments": comments,
		})

	case http.MethodPost:
		if user == nil {
			writeErr(w, http.StatusUnauthorized, "请先登录后发表评论")
			return
		}
		var req struct {
			Content  string `json:"content"`
			ParentID int64  `json:"parentId"`
		}
		r.Body = http.MaxBytesReader(w, r.Body, 64*1024)
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeErr(w, http.StatusBadRequest, "请求格式错误")
			return
		}
		if strings.TrimSpace(req.Content) == "" {
			writeErr(w, http.StatusBadRequest, "评论内容不能为空")
			return
		}
		if !s.guard.Allow("comment", strconv.FormatInt(user.ID, 10), 10, time.Minute) {
			writeErr(w, http.StatusTooManyRequests, "评论过于频繁，请稍后再试")
			return
		}

		c, err := s.store.AddComment(r.Context(), shareID, user.ID, user.Nickname, user.AvatarURL, req.Content, req.ParentID)
		if err != nil {
			switch {
			case errors.Is(err, store.ErrUserMuted):
				writeErr(w, http.StatusForbidden, "您已被管理员禁言，无法发表评论")
			case errors.Is(err, store.ErrInvalidParent):
				writeErr(w, http.StatusBadRequest, err.Error())
			case errors.Is(err, store.ErrShareNotFound):
				writeErr(w, http.StatusNotFound, "作品不存在")
			default:
				writeErrLog(w, r, http.StatusInternalServerError, "发表评论失败", err)
			}
			return
		}
		writeJSON(w, http.StatusCreated, map[string]interface{}{
			"comment": c,
		})

	default:
		writeErr(w, http.StatusMethodNotAllowed, "Method not allowed")
	}
}

// ----------------------------------------------------
// Notifications
// ----------------------------------------------------

func (s *Server) handleNotifications(w http.ResponseWriter, r *http.Request) {
	user := CurrentUser(r)
	if user == nil {
		writeErr(w, http.StatusUnauthorized, "请先登录")
		return
	}

	path := strings.TrimPrefix(r.URL.Path, "/api/notifications")
	path = strings.Trim(path, "/")

	if path == "read-all" && r.Method == http.MethodPost {
		if err := s.store.MarkNotificationsRead(r.Context(), user.ID); err != nil {
			writeErrLog(w, r, http.StatusInternalServerError, "标记已读失败", err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
		return
	}
	// POST /api/notifications/:id/read
	if strings.HasSuffix(path, "/read") && r.Method == http.MethodPost {
		nid, err := strconv.ParseInt(strings.TrimSuffix(path, "/read"), 10, 64)
		if err != nil {
			writeErr(w, http.StatusBadRequest, "通知 ID 无效")
			return
		}
		if err := s.store.MarkNotificationRead(r.Context(), user.ID, nid); err != nil {
			writeErrLog(w, r, http.StatusInternalServerError, "标记已读失败", err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
		return
	}

	if r.Method == http.MethodGet {
		limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
		if limit <= 0 {
			limit = 30
		}
		list, unread, err := s.store.ListNotifications(r.Context(), user.ID, limit)
		if err != nil {
			writeErrLog(w, r, http.StatusInternalServerError, "获取通知列表失败", err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"notifications": list,
			"unreadCount":   unread,
		})
		return
	}

	writeErr(w, http.StatusMethodNotAllowed, "Method not allowed")
}

// ----------------------------------------------------
// Co-creation Projects
// ----------------------------------------------------

func (s *Server) handleCocreation(w http.ResponseWriter, r *http.Request) {
	user := CurrentUser(r)
	path := strings.TrimPrefix(r.URL.Path, "/api/cocreation")
	path = strings.Trim(path, "/")

	// 1. Projects listing or create: /api/cocreation/projects
	if path == "projects" {
		switch r.Method {
		case http.MethodGet:
			limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
			var projs []store.CocreationProject
			var err error
			if r.URL.Query().Get("mine") == "1" {
				if user == nil {
					writeErr(w, http.StatusUnauthorized, "请先登录")
					return
				}
				projs, err = s.store.ListProjectsForUser(r.Context(), user.ID, limit)
			} else {
				projs, err = s.store.ListCocreationProjects(r.Context(), limit)
			}
			if err != nil {
				writeErrLog(w, r, http.StatusInternalServerError, "获取共创企划失败", err)
				return
			}
			writeJSON(w, http.StatusOK, map[string]interface{}{"projects": projs})
			return

		case http.MethodPost:
			if user == nil {
				writeErr(w, http.StatusUnauthorized, "请先登录后发起共创企划")
				return
			}
			var req struct {
				WorldID    string   `json:"worldId"`
				WorldTitle string   `json:"worldTitle"`
				Summary    string   `json:"summary"`
				Admins     []string `json:"admins"`
			}
			r.Body = http.MaxBytesReader(w, r.Body, 32*1024)
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				writeErr(w, http.StatusBadRequest, "请求格式错误")
				return
			}
			if strings.TrimSpace(req.WorldTitle) == "" {
				writeErr(w, http.StatusBadRequest, "世界观标题不能为空")
				return
			}
			if len(req.Admins) > 20 {
				writeErr(w, http.StatusBadRequest, "管理员最多 20 位")
				return
			}
			if !s.guard.Allow("project", strconv.FormatInt(user.ID, 10), 5, time.Hour) {
				writeErr(w, http.StatusTooManyRequests, "创建企划过于频繁，请稍后再试")
				return
			}
			proj, unresolved, err := s.store.CreateCocreationProject(r.Context(), req.WorldID, req.WorldTitle, user.ID, user.Nickname, req.Summary, req.Admins)
			if err != nil {
				writeErrLog(w, r, http.StatusInternalServerError, "发起共创企划失败", err)
				return
			}
			if unresolved == nil {
				unresolved = []string{}
			}
			writeJSON(w, http.StatusCreated, map[string]interface{}{"project": proj, "unresolved": unresolved})
			return

		default:
			writeErr(w, http.StatusMethodNotAllowed, "Method not allowed")
			return
		}
	}

	// 2. Specific project: /api/cocreation/projects/:id or /api/cocreation/projects/:id/admins
	if strings.HasPrefix(path, "projects/") {
		parts := strings.Split(strings.TrimPrefix(path, "projects/"), "/")
		projectID := parts[0]

		if len(parts) == 2 && parts[1] == "admins" {
			if r.Method != http.MethodPut {
				writeErr(w, http.StatusMethodNotAllowed, "Method not allowed")
				return
			}
			if user == nil {
				writeErr(w, http.StatusUnauthorized, "请先登录")
				return
			}
			var req struct {
				Admins  []string `json:"admins"`  // legacy: emails
				Emails  []string `json:"emails"`  // preferred
				UserIDs []int64  `json:"userIds"` // explicit ids
			}
			r.Body = http.MaxBytesReader(w, r.Body, 32*1024)
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				writeErr(w, http.StatusBadRequest, "请求格式错误")
				return
			}
			emails := append(req.Emails, req.Admins...)
			if len(emails)+len(req.UserIDs) > 20 {
				writeErr(w, http.StatusBadRequest, "管理员最多 20 位")
				return
			}
			var unresolved []string
			var err error
			if len(req.UserIDs) > 0 && len(emails) == 0 {
				err = s.store.SetProjectAdmins(r.Context(), projectID, user.ID, req.UserIDs, nil)
			} else {
				unresolved, err = s.store.UpdateCocreationAdmins(r.Context(), projectID, user.ID, emails)
			}
			if err != nil {
				writeProjectErr(w, r, err)
				return
			}
			if unresolved == nil {
				unresolved = []string{}
			}
			proj, _ := s.store.GetCocreationProject(r.Context(), projectID)
			writeJSON(w, http.StatusOK, map[string]interface{}{"ok": true, "unresolved": unresolved, "project": proj})
			return
		}

		// GET /api/cocreation/projects/:id/queue?status=pending|approved|rejected|all (members only)
		if len(parts) == 2 && parts[1] == "queue" {
			if r.Method != http.MethodGet {
				writeErr(w, http.StatusMethodNotAllowed, "Method not allowed")
				return
			}
			if user == nil {
				writeErr(w, http.StatusUnauthorized, "请先登录")
				return
			}
			ok, err := s.store.IsProjectReviewer(r.Context(), projectID, user.ID)
			if err != nil {
				writeProjectErr(w, r, err)
				return
			}
			if !ok && !user.IsAdmin {
				writeErr(w, http.StatusForbidden, "只有企划成员可以查看审核队列")
				return
			}
			limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
			items, err := s.store.ListCanonQueue(r.Context(), projectID, r.URL.Query().Get("status"), limit)
			if err != nil {
				writeErrLog(w, r, http.StatusInternalServerError, "获取审核队列失败", err)
				return
			}
			writeJSON(w, http.StatusOK, map[string]interface{}{"shares": items})
			return
		}

		// PATCH /api/cocreation/projects/:id {summary?, isOpenDoujin?} (owner only)
		if len(parts) == 1 && r.Method == http.MethodPatch {
			if user == nil {
				writeErr(w, http.StatusUnauthorized, "请先登录")
				return
			}
			var req struct {
				Summary      *string `json:"summary"`
				IsOpenDoujin *bool   `json:"isOpenDoujin"`
			}
			r.Body = http.MaxBytesReader(w, r.Body, 32*1024)
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				writeErr(w, http.StatusBadRequest, "请求格式错误")
				return
			}
			if err := s.store.UpdateProject(r.Context(), projectID, user.ID, req.Summary, req.IsOpenDoujin); err != nil {
				writeProjectErr(w, r, err)
				return
			}
			proj, _ := s.store.GetCocreationProject(r.Context(), projectID)
			writeJSON(w, http.StatusOK, map[string]interface{}{"ok": true, "project": proj})
			return
		}

		if r.Method == http.MethodGet {
			proj, err := s.store.GetCocreationProject(r.Context(), projectID)
			if err != nil {
				writeErr(w, http.StatusNotFound, "企划不存在")
				return
			}
			writeJSON(w, http.StatusOK, map[string]interface{}{"project": proj})
			return
		}
	}

	// 3. Canon workflow: /api/cocreation/shares/:id/request-canon or approve-canon
	if strings.HasPrefix(path, "shares/") {
		parts := strings.Split(strings.TrimPrefix(path, "shares/"), "/")
		if len(parts) == 2 {
			shareID := parts[0]
			action := parts[1]

			if r.Method != http.MethodPost {
				writeErr(w, http.StatusMethodNotAllowed, "Method not allowed")
				return
			}
			if user == nil {
				writeErr(w, http.StatusUnauthorized, "请先登录")
				return
			}
			var err error
			switch action {
			case "request-canon":
				err = s.store.RequestCanon(r.Context(), shareID, user.ID)
			case "approve-canon":
				err = s.store.ReviewCanon(r.Context(), shareID, user.ID, user.Nickname, true, user.IsAdmin)
			case "reject-canon":
				err = s.store.ReviewCanon(r.Context(), shareID, user.ID, user.Nickname, false, user.IsAdmin)
			default:
				writeErr(w, http.StatusNotFound, "Endpoint not found")
				return
			}
			if err != nil {
				switch {
				case errors.Is(err, store.ErrCanonForbidden), errors.Is(err, store.ErrShareForbidden):
					writeErr(w, http.StatusForbidden, store.ErrCanonForbidden.Error())
				case errors.Is(err, store.ErrCanonNotEligible), errors.Is(err, store.ErrProjectClosed):
					writeErr(w, http.StatusBadRequest, err.Error())
				case errors.Is(err, store.ErrShareNotFound), errors.Is(err, store.ErrProjectNotFound):
					writeErr(w, http.StatusNotFound, "作品或企划不存在")
				default:
					writeErrLog(w, r, http.StatusInternalServerError, "转正流程操作失败", err)
				}
				return
			}
			writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
			return
		}
	}

	writeErr(w, http.StatusNotFound, "Endpoint not found")
}

// ----------------------------------------------------
// Creator Profile
// ----------------------------------------------------

func (s *Server) handleCreatorProfile(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeErr(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	uidStr := r.URL.Query().Get("user_id")
	uid, err := strconv.ParseInt(uidStr, 10, 64)
	if err != nil || uid <= 0 {
		writeErr(w, http.StatusBadRequest, "用户 ID 无效")
		return
	}

	profile, err := s.store.GetCreatorProfile(r.Context(), uid)
	if err != nil {
		writeErr(w, http.StatusNotFound, "未找到创作者信息")
		return
	}

	writeJSON(w, http.StatusOK, profile)
}

// ----------------------------------------------------
// Admin Management (Users, Roles, Mute, Ban, Comments)
// ----------------------------------------------------

func (s *Server) handleAdminUsers(w http.ResponseWriter, r *http.Request) {
	user := CurrentUser(r)
	if user == nil {
		writeErr(w, http.StatusUnauthorized, "请先登录")
		return
	}
	if !user.IsAdmin {
		writeErr(w, http.StatusForbidden, "只有管理员可访问管理面板")
		return
	}

	path := strings.TrimPrefix(r.URL.Path, "/api/admin/users")
	path = strings.Trim(path, "/")

	// 1. List all users: GET /api/admin/users
	if path == "" {
		if r.Method != http.MethodGet {
			writeErr(w, http.StatusMethodNotAllowed, "Method not allowed")
			return
		}
		users, err := s.store.ListUsers(r.Context())
		if err != nil {
			writeErrLog(w, r, http.StatusInternalServerError, "获取用户列表失败", err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]interface{}{"users": users})
		return
	}

	parts := strings.Split(path, "/")
	targetUID, err := strconv.ParseInt(parts[0], 10, 64)
	if err != nil {
		writeErr(w, http.StatusBadRequest, "用户 ID 无效")
		return
	}

	if len(parts) == 2 {
		action := parts[1]

		// Hierarchy: nobody moderates themselves; super admins are untouchable; only a super
		// admin may act on another admin.
		target, err := s.store.GetUserByID(r.Context(), targetUID)
		if err != nil {
			if errors.Is(err, store.ErrUserNotFound) {
				writeErr(w, http.StatusNotFound, "用户不存在")
				return
			}
			writeErrLog(w, r, http.StatusInternalServerError, "读取用户失败", err)
			return
		}
		if target.ID == user.ID {
			writeErr(w, http.StatusBadRequest, "不能对自己执行管理操作")
			return
		}
		if target.IsSuperAdmin {
			writeErr(w, http.StatusForbidden, "不能对超级管理员执行管理操作")
			return
		}
		if target.IsAdmin && !user.IsSuperAdmin {
			writeErr(w, http.StatusForbidden, "只有超级管理员可以处置其他管理员")
			return
		}
		r.Body = http.MaxBytesReader(w, r.Body, 16*1024)

		// 2. Grant/Revoke Admin: PUT /api/admin/users/:id/role (super admin only)
		if action == "role" && r.Method == http.MethodPut {
			if !user.IsSuperAdmin {
				writeErr(w, http.StatusForbidden, "权限不足：只有超级管理员才能增减管理员")
				return
			}
			var req struct {
				IsAdmin bool `json:"isAdmin"`
			}
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				writeErr(w, http.StatusBadRequest, "请求格式错误")
				return
			}
			if err := s.store.SetUserAdminByID(r.Context(), targetUID, req.IsAdmin); err != nil {
				writeErrLog(w, r, http.StatusInternalServerError, "更新管理员权限失败", err)
				return
			}
			writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
			return
		}

		// 3. Mute/Unmute Creator: POST /api/admin/users/:id/mute
		if action == "mute" && r.Method == http.MethodPost {
			var req struct {
				IsMuted bool   `json:"isMuted"`
				Reason  string `json:"reason"`
			}
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				writeErr(w, http.StatusBadRequest, "请求格式错误")
				return
			}
			if len([]rune(req.Reason)) > 200 {
				req.Reason = string([]rune(req.Reason)[:200])
			}
			if err := s.store.SetUserMuteByID(r.Context(), targetUID, req.IsMuted, req.Reason); err != nil {
				writeErrLog(w, r, http.StatusInternalServerError, "禁言操作失败", err)
				return
			}
			writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
			return
		}

		// 4. Disable/Enable Login: POST /api/admin/users/:id/status
		if action == "status" && r.Method == http.MethodPost {
			var req struct {
				IsDisabled bool `json:"isDisabled"`
			}
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				writeErr(w, http.StatusBadRequest, "请求格式错误")
				return
			}
			if err := s.store.SetUserDisabledByID(r.Context(), targetUID, req.IsDisabled); err != nil {
				writeErrLog(w, r, http.StatusInternalServerError, "账号状态操作失败", err)
				return
			}
			writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
			return
		}

		// 5. Lift Penalties: POST /api/admin/users/:id/lift
		if action == "lift" && r.Method == http.MethodPost {
			if err := s.store.LiftAllPenalties(r.Context(), targetUID); err != nil {
				writeErrLog(w, r, http.StatusInternalServerError, "解除惩罚失败", err)
				return
			}
			writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
			return
		}
	}

	writeErr(w, http.StatusNotFound, "Endpoint not found")
}

func writeProjectErr(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, store.ErrProjectNotFound):
		writeErr(w, http.StatusNotFound, "企划不存在")
	case errors.Is(err, store.ErrProjectForbidden):
		writeErr(w, http.StatusForbidden, err.Error())
	default:
		writeErrLog(w, r, http.StatusInternalServerError, "企划操作失败", err)
	}
}
