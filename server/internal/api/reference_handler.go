package api

import (
	"encoding/json"
	"io"
	"net/http"
	"os"
	"path/filepath"
)

// handleGetReferenceMaterials returns the current official reference materials (seed.json)
func (s *Server) handleGetReferenceMaterials(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeErr(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	seedPath := filepath.Join(s.cfg.DataDir, "seed.json")
	b, err := os.ReadFile(seedPath)
	if err != nil || len(b) == 0 {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-cache")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(b)
}

// handleUpdateReferenceMaterials allows only admins to update the official reference materials
func (s *Server) handleUpdateReferenceMaterials(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPut && r.Method != http.MethodPost {
		writeErr(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	user := CurrentUser(r)
	if user == nil {
		writeErr(w, http.StatusUnauthorized, "请先登录")
		return
	}
	if !user.IsAdmin {
		writeErr(w, http.StatusForbidden, "权限不足：只有网站管理员才能修改全站官方公共参考素材")
		return
	}

	// 10MB limit for reference material document
	r.Body = http.MaxBytesReader(w, r.Body, 10*1024*1024)
	bodyBytes, err := io.ReadAll(r.Body)
	if err != nil {
		writeErr(w, http.StatusBadRequest, "读取请求体失败")
		return
	}

	// Verify valid JSON
	var dummy map[string]interface{}
	if err := json.Unmarshal(bodyBytes, &dummy); err != nil {
		writeErr(w, http.StatusBadRequest, "素材格式必须是合法的 JSON 设定集")
		return
	}

	if err := os.MkdirAll(s.cfg.DataDir, 0o750); err != nil {
		writeErr(w, http.StatusInternalServerError, "创建数据目录失败")
		return
	}

	// Atomic write
	seedPath := filepath.Join(s.cfg.DataDir, "seed.json")
	tmpPath := seedPath + ".tmp"
	if err := os.WriteFile(tmpPath, bodyBytes, 0o644); err != nil {
		writeErr(w, http.StatusInternalServerError, "写入临时素材文件失败: "+err.Error())
		return
	}

	if err := os.Rename(tmpPath, seedPath); err != nil {
		writeErr(w, http.StatusInternalServerError, "更新素材文件失败: "+err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status":  "ok",
		"message": "全站官方公共参考素材已成功更新",
	})
}
