package api

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strconv"
	"strings"

	"creator/server/internal/store"
)

const MaxSyncBytes = 10 << 20 // 10 MB

func (s *Server) handleSync(w http.ResponseWriter, r *http.Request) {
	user := CurrentUser(r)
	if user == nil {
		writeErr(w, http.StatusUnauthorized, "请先登录")
		return
	}

	switch r.Method {
	case http.MethodGet:
		doc, err := s.store.GetDoc(r.Context(), user.ID)
		if err != nil {
			writeErr(w, http.StatusInternalServerError, "读取云端数据失败")
			return
		}
		if doc == nil {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"data":      doc.Data,
			"rev":       doc.Rev,
			"updatedAt": doc.UpdatedAt,
		})

	case http.MethodPut:
		r.Body = http.MaxBytesReader(w, r.Body, MaxSyncBytes)
		bodyBytes, err := io.ReadAll(r.Body)
		if err != nil {
			var maxErr *http.MaxBytesError
			if errors.As(err, &maxErr) {
				writeErr(w, http.StatusRequestEntityTooLarge, "文档体积超过 10MB 上限")
				return
			}
			writeErr(w, http.StatusBadRequest, "读取请求失败")
			return
		}

		var req struct {
			Data    json.RawMessage `json:"data"`
			BaseRev int             `json:"baseRev"`
		}
		if err := json.Unmarshal(bodyBytes, &req); err != nil || len(req.Data) == 0 {
			writeErr(w, http.StatusBadRequest, "请求 JSON 格式不正确")
			return
		}

		doc, err := s.store.PutDoc(r.Context(), user.ID, req.BaseRev, req.Data, "")
		if err != nil {
			if errors.Is(err, store.ErrInvalidDoc) {
				writeErr(w, http.StatusBadRequest, "文档结构校验未通过（缺少 _version 或核心实体表）")
				return
			}
			if errors.Is(err, store.ErrSyncConflict) {
				resp := map[string]interface{}{
					"error": "检测到多端版本冲突",
				}
				if doc != nil {
					resp["serverData"] = doc.Data
					resp["serverRev"] = doc.Rev
					resp["updatedAt"] = doc.UpdatedAt
				}
				writeJSON(w, http.StatusConflict, resp)
				return
			}
			writeErr(w, http.StatusInternalServerError, "保存云端数据失败")
			return
		}

		writeJSON(w, http.StatusOK, map[string]interface{}{
			"rev":       doc.Rev,
			"updatedAt": doc.UpdatedAt,
		})

	default:
		writeErr(w, http.StatusMethodNotAllowed, "Method not allowed")
	}
}

func (s *Server) handleRevisions(w http.ResponseWriter, r *http.Request) {
	user := CurrentUser(r)
	if user == nil {
		writeErr(w, http.StatusUnauthorized, "请先登录")
		return
	}
	if r.Method != http.MethodGet {
		writeErr(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	path := strings.TrimPrefix(r.URL.Path, "/api/sync/revisions")
	path = strings.Trim(path, "/")
	if path == "" {
		list, err := s.store.ListRevisions(r.Context(), user.ID)
		if err != nil {
			writeErr(w, http.StatusInternalServerError, "查询历史快照失败")
			return
		}
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"revisions": list,
		})
		return
	}

	revID, err := strconv.ParseInt(path, 10, 64)
	if err != nil {
		writeErr(w, http.StatusBadRequest, "无效的历史版本号")
		return
	}
	detail, err := s.store.GetRevision(r.Context(), user.ID, revID)
	if err != nil {
		if errors.Is(err, store.ErrRevisionNone) {
			writeErr(w, http.StatusNotFound, "历史快照不存在")
			return
		}
		writeErr(w, http.StatusInternalServerError, "读取历史快照失败")
		return
	}
	writeJSON(w, http.StatusOK, detail)
}
