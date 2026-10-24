package api

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"

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

func (s *Server) handleLobbyUsers(w http.ResponseWriter, r *http.Request) {
	user := CurrentUser(r)
	if user == nil {
		writeErr(w, http.StatusUnauthorized, "请先登录")
		return
	}
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

func (s *Server) handleShares(w http.ResponseWriter, r *http.Request) {
	user := CurrentUser(r)
	if user == nil {
		writeErr(w, http.StatusUnauthorized, "请先登录")
		return
	}

	path := strings.TrimPrefix(r.URL.Path, "/api/shares")
	path = strings.Trim(path, "/")

	if path != "" {
		if r.Method != http.MethodDelete {
			writeErr(w, http.StatusMethodNotAllowed, "Method not allowed")
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
	}

	switch r.Method {
	case http.MethodGet:
		var ownerFilter *int64
		if r.URL.Query().Get("owner") == "me" {
			uid := user.ID
			ownerFilter = &uid
		}
		before, _ := strconv.ParseInt(r.URL.Query().Get("before"), 10, 64)
		limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
		if limit <= 0 {
			limit = 30
		}

		shares, err := s.store.ListShares(r.Context(), ownerFilter, before, limit)
		if err != nil {
			writeErr(w, http.StatusInternalServerError, "获取分享列表失败")
			return
		}
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"shares": shares,
		})

	case http.MethodPost:
		var req struct {
			Kind      string `json:"kind"`
			Title     string `json:"title"`
			Summary   string `json:"summary"`
			Content   string `json:"content"`
			DraftCode string `json:"draftCode"`
		}
		r.Body = http.MaxBytesReader(w, r.Body, 512*1024)
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeErr(w, http.StatusBadRequest, "请求格式错误")
			return
		}
		if strings.TrimSpace(req.Title) == "" {
			writeErr(w, http.StatusBadRequest, "分享标题不能为空")
			return
		}
		sh, err := s.store.CreateShare(r.Context(), user.ID, user.Nickname, req.Kind, req.Title, req.Summary, req.Content, req.DraftCode)
		if err != nil {
			writeErr(w, http.StatusInternalServerError, "发布分享失败")
			return
		}
		writeJSON(w, http.StatusCreated, map[string]interface{}{
			"share": sh,
		})

	default:
		writeErr(w, http.StatusMethodNotAllowed, "Method not allowed")
	}
}
