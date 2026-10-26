package api

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strconv"
	"strings"

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
			liked, count, err := s.store.ToggleCommentLike(r.Context(), cid, user.ID)
			if err != nil {
				writeErr(w, http.StatusInternalServerError, "操作点赞失败: "+err.Error())
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

	switch r.Method {
	case http.MethodGet:
		var currentUID int64
		if user != nil {
			currentUID = user.ID
		}
		comments, err := s.store.ListComments(r.Context(), shareID, currentUID)
		if err != nil {
			writeErr(w, http.StatusInternalServerError, "获取讨论列表失败: "+err.Error())
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

		c, err := s.store.AddComment(r.Context(), shareID, user.ID, user.Nickname, user.AvatarURL, req.Content, req.ParentID)
		if err != nil {
			if errors.Is(err, store.ErrUserMuted) {
				writeErr(w, http.StatusForbidden, "您已被管理员禁言，无法发表评论")
				return
			}
			writeErr(w, http.StatusInternalServerError, "发表评论失败: "+err.Error())
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
			writeErr(w, http.StatusInternalServerError, "标记已读失败")
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
			writeErr(w, http.StatusInternalServerError, "获取通知列表失败: "+err.Error())
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
			projs, err := s.store.ListCocreationProjects(r.Context(), limit)
			if err != nil {
				writeErr(w, http.StatusInternalServerError, "获取共创企划失败: "+err.Error())
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
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				writeErr(w, http.StatusBadRequest, "请求格式错误")
				return
			}
			if strings.TrimSpace(req.WorldTitle) == "" {
				writeErr(w, http.StatusBadRequest, "世界观标题不能为空")
				return
			}
			proj, err := s.store.CreateCocreationProject(r.Context(), req.WorldID, req.WorldTitle, user.ID, user.Nickname, req.Summary, req.Admins)
			if err != nil {
				writeErr(w, http.StatusInternalServerError, "发起共创企划失败: "+err.Error())
				return
			}
			writeJSON(w, http.StatusCreated, map[string]interface{}{"project": proj})
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
				Admins []string `json:"admins"`
			}
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				writeErr(w, http.StatusBadRequest, "请求格式错误")
				return
			}
			if err := s.store.UpdateCocreationAdmins(r.Context(), projectID, user.ID, req.Admins); err != nil {
				writeErr(w, http.StatusForbidden, err.Error())
				return
			}
			writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
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

			if action == "request-canon" && r.Method == http.MethodPost {
				if user == nil {
					writeErr(w, http.StatusUnauthorized, "请先登录")
					return
				}
				if err := s.store.RequestCanon(r.Context(), shareID, user.ID); err != nil {
					writeErr(w, http.StatusBadRequest, err.Error())
					return
				}
				writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
				return
			}

			if action == "approve-canon" && r.Method == http.MethodPost {
				if user == nil {
					writeErr(w, http.StatusUnauthorized, "请先登录")
					return
				}
				if err := s.store.ApproveCanon(r.Context(), shareID, user.ID, user.Nickname, user.Email, user.IsAdmin); err != nil {
					switch {
					case errors.Is(err, store.ErrCanonForbidden):
						writeErr(w, http.StatusForbidden, err.Error())
					case errors.Is(err, store.ErrCanonNotEligible):
						writeErr(w, http.StatusBadRequest, err.Error())
					case errors.Is(err, store.ErrShareNotFound), errors.Is(err, store.ErrProjectNotFound):
						writeErr(w, http.StatusNotFound, "作品或企划不存在")
					default:
						log.Printf("[approve-canon] %v", err)
						writeErr(w, http.StatusInternalServerError, "转正审批失败")
					}
					return
				}
				writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
				return
			}
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
			writeErr(w, http.StatusInternalServerError, "获取用户列表失败: "+err.Error())
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
				writeErr(w, http.StatusInternalServerError, "更新管理员权限失败: "+err.Error())
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
			if err := s.store.SetUserMuteByID(r.Context(), targetUID, req.IsMuted, req.Reason); err != nil {
				writeErr(w, http.StatusInternalServerError, "禁言操作失败: "+err.Error())
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
				writeErr(w, http.StatusInternalServerError, "账号状态操作失败: "+err.Error())
				return
			}
			writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
			return
		}

		// 5. Lift Penalties: POST /api/admin/users/:id/lift
		if action == "lift" && r.Method == http.MethodPost {
			if err := s.store.LiftAllPenalties(r.Context(), targetUID); err != nil {
				writeErr(w, http.StatusInternalServerError, "解除惩罚失败: "+err.Error())
				return
			}
			writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
			return
		}
	}

	writeErr(w, http.StatusNotFound, "Endpoint not found")
}
