package api

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"unicode/utf8"

	"creator/server/internal/store"
)

func (s *Server) handlePresence(w http.ResponseWriter, r *http.Request) {
	user := CurrentUser(r)
	if user == nil {
		writeErr(w, http.StatusUnauthorized, "请先登录")
		return
	}
	if r.Method != http.MethodPost {
		writeErr(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	var req struct {
		Focus string `json:"focus"`
	}
	r.Body = http.MaxBytesReader(w, r.Body, 4096)
	_ = json.NewDecoder(r.Body).Decode(&req)

	if err := s.store.UpdatePresence(r.Context(), user.ID, req.Focus); err != nil {
		writeErr(w, http.StatusInternalServerError, "更新在线状态失败")
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// handleLobbyUsers is accessible anonymously to browse active creators
func (s *Server) handleLobbyUsers(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeErr(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	users, err := s.store.ListLobbyUsers(r.Context(), 50)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "获取在线创作者列表失败")
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"users": users,
	})
}

// handleGlobalStats is accessible anonymously to display community dashboard statistics
func (s *Server) handleGlobalStats(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeErr(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	stats, err := s.store.GetGlobalDashboardStats(r.Context())
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "获取全站整体大盘数据失败")
		return
	}
	writeJSON(w, http.StatusOK, stats)
}

func (s *Server) handleShares(w http.ResponseWriter, r *http.Request) {
	user := CurrentUser(r)
	path := strings.TrimPrefix(r.URL.Path, "/api/shares")
	path = strings.Trim(path, "/")

	// Sub-resource: /api/shares/:id
	if path != "" {
		switch r.Method {
		case http.MethodGet:
			// View single share (publicly accessible if public, or owner if private)
			sh, err := s.store.GetShare(r.Context(), path)
			if err != nil {
				if errors.Is(err, store.ErrShareNotFound) {
					writeErr(w, http.StatusNotFound, "分享条目不存在")
					return
				}
				writeErr(w, http.StatusInternalServerError, "读取分享失败")
				return
			}
			if sh.Visibility == "private" {
				if user == nil || (user.ID != sh.UserID && !user.IsAdmin) {
					writeErr(w, http.StatusForbidden, "该条目为作者私有，暂不公开")
					return
				}
			}
			writeJSON(w, http.StatusOK, map[string]interface{}{"share": sh})
			return

		case http.MethodPatch:
			// Update visibility or fields (requires owner/admin)
			if user == nil {
				writeErr(w, http.StatusUnauthorized, "请先登录")
				return
			}
			var req struct {
				Visibility string `json:"visibility"`
				Title      string `json:"title,omitempty"`
				Summary    string `json:"summary,omitempty"`
				Content    string `json:"content,omitempty"`
				Tags       string `json:"tags,omitempty"`
			}
			r.Body = http.MaxBytesReader(w, r.Body, 512*1024)
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				writeErr(w, http.StatusBadRequest, "请求格式错误")
				return
			}
			if req.Visibility != "" {
				if err := s.store.UpdateShareVisibility(r.Context(), path, user.ID, req.Visibility, user.IsAdmin); err != nil {
					if errors.Is(err, store.ErrShareNotFound) {
						writeErr(w, http.StatusNotFound, "分享条目不存在")
						return
					}
					if errors.Is(err, store.ErrShareForbidden) {
						writeErr(w, http.StatusForbidden, "仅作者本人可修改该分享")
						return
					}
					writeErr(w, http.StatusInternalServerError, "修改失败")
					return
				}
			}
			writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
			return

		case http.MethodDelete:
			if user == nil {
				writeErr(w, http.StatusUnauthorized, "请先登录")
				return
			}
			err := s.store.DeleteShare(r.Context(), path, user.ID, user.IsAdmin)
			if err != nil {
				if errors.Is(err, store.ErrShareNotFound) {
					writeErr(w, http.StatusNotFound, "分享条目不存在")
					return
				}
				if errors.Is(err, store.ErrShareForbidden) {
					writeErr(w, http.StatusForbidden, "仅作者本人可删除该分享")
					return
				}
				writeErr(w, http.StatusInternalServerError, "删除失败")
				return
			}
			writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
			return

		default:
			writeErr(w, http.StatusMethodNotAllowed, "Method not allowed")
			return
		}
	}

	// Collection: /api/shares
	switch r.Method {
	case http.MethodGet:
		// 1. My items (requires login)
		if r.URL.Query().Get("owner") == "me" {
			if user == nil {
				writeErr(w, http.StatusUnauthorized, "请先登录")
				return
			}
			vis := r.URL.Query().Get("visibility")
			kind := r.URL.Query().Get("kind")
			limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
			if limit <= 0 {
				limit = 50
			}
			items, err := s.store.ListUserItems(r.Context(), user.ID, vis, kind, limit)
			if err != nil {
				writeErr(w, http.StatusInternalServerError, "获取个人作品失败")
				return
			}
			writeJSON(w, http.StatusOK, map[string]interface{}{"shares": items})
			return
		}

		// 2. Public lobby feed (accessible anonymously)
		kind := r.URL.Query().Get("kind")
		keyword := r.URL.Query().Get("q")
		before, _ := strconv.ParseInt(r.URL.Query().Get("before"), 10, 64)
		limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
		if limit <= 0 {
			limit = 30
		}

		shares, err := s.store.ListPublicShares(r.Context(), kind, keyword, before, limit)
		if err != nil {
			writeErr(w, http.StatusInternalServerError, "获取公共大厅列表失败")
			return
		}
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"shares": shares,
		})

	case http.MethodPost:
		if user == nil {
			writeErr(w, http.StatusUnauthorized, "请先登录")
			return
		}
		var req struct {
			ID         string `json:"id,omitempty"`
			EntityID   string `json:"entityId,omitempty"`
			Kind       string `json:"kind"`
			Title      string `json:"title"`
			Summary    string `json:"summary"`
			Content    string `json:"content"`
			DraftCode  string `json:"draftCode"`
			Visibility string `json:"visibility"`
			Tags       string `json:"tags"`
		}
		r.Body = http.MaxBytesReader(w, r.Body, 1024*1024)
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeErr(w, http.StatusBadRequest, "请求格式错误")
			return
		}
		if strings.TrimSpace(req.Title) == "" {
			writeErr(w, http.StatusBadRequest, "标题不能为空")
			return
		}
		if req.Visibility != "private" {
			req.Visibility = "public"
		}
		wordCount := utf8.RuneCountInString(req.Content)

		sh, err := s.store.UpsertShare(
			r.Context(),
			req.ID,
			user.ID,
			user.Nickname,
			req.Kind,
			req.Title,
			req.Summary,
			req.Content,
			req.DraftCode,
			req.Visibility,
			req.EntityID,
			req.Tags,
			wordCount,
			0,
		)
		if err != nil {
			writeErr(w, http.StatusInternalServerError, "发布或保存失败: "+err.Error())
			return
		}
		writeJSON(w, http.StatusCreated, map[string]interface{}{
			"share": sh,
		})

	default:
		writeErr(w, http.StatusMethodNotAllowed, "Method not allowed")
	}
}
