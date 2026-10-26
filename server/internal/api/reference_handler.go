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

	// Verify valid JSON and keep ONLY official reference items. Whatever the client sends, an
	// admin's private worlds / articles / preferences must never land in the public seed file.
	var raw map[string]interface{}
	if err := json.Unmarshal(bodyBytes, &raw); err != nil {
		writeErr(w, http.StatusBadRequest, "素材格式必须是合法的 JSON 设定集")
		return
	}
	filtered := filterReferenceOnly(raw)
	bodyBytes, err = json.Marshal(filtered)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "序列化素材失败")
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
		writeErrLog(w, r, http.StatusInternalServerError, "写入临时素材文件失败", err)
		return
	}

	if err := os.Rename(tmpPath, seedPath); err != nil {
		writeErrLog(w, r, http.StatusInternalServerError, "更新素材文件失败", err)
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status":  "ok",
		"message": "全站官方公共参考素材已成功更新",
	})
}

// handleAddReferenceItem allows admins to add a specific example setting
func (s *Server) handleAddReferenceItem(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeErr(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}
	user := CurrentUser(r)
	if user == nil {
		writeErr(w, http.StatusUnauthorized, "请先登录")
		return
	}
	if !user.IsAdmin {
		writeErr(w, http.StatusForbidden, "只有管理员可添加官方范例设定")
		return
	}

	var req struct {
		Kind string                 `json:"kind"` // "world" | "org" | "char" | "article"
		Item map[string]interface{} `json:"item"`
	}
	r.Body = http.MaxBytesReader(w, r.Body, 2*1024*1024)
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Kind == "" || req.Item == nil {
		writeErr(w, http.StatusBadRequest, "请求参数错误")
		return
	}

	seedPath := filepath.Join(s.cfg.DataDir, "seed.json")
	b, err := os.ReadFile(seedPath)
	if err != nil {
		b = []byte(`{"_version":6,"worlds":{},"orgs":{},"chars":{},"articles":[]}`)
	}
	var doc map[string]interface{}
	if err := json.Unmarshal(b, &doc); err != nil {
		doc = map[string]interface{}{"_version": 6, "worlds": map[string]interface{}{}, "orgs": map[string]interface{}{}, "chars": map[string]interface{}{}, "articles": []interface{}{}}
	}

	itemID, _ := req.Item["id"].(string)
	if itemID == "" {
		writeErr(w, http.StatusBadRequest, "条目缺少 ID")
		return
	}
	req.Item["isReference"] = true
	req.Item["refAuthorId"] = user.ID
	req.Item["refAuthorName"] = user.Nickname

	switch req.Kind {
	case "world":
		worlds, _ := doc["worlds"].(map[string]interface{})
		if worlds == nil {
			worlds = make(map[string]interface{})
		}
		worlds[itemID] = req.Item
		doc["worlds"] = worlds
	case "org":
		orgs, _ := doc["orgs"].(map[string]interface{})
		if orgs == nil {
			orgs = make(map[string]interface{})
		}
		orgs[itemID] = req.Item
		doc["orgs"] = orgs
	case "char":
		chars, _ := doc["chars"].(map[string]interface{})
		if chars == nil {
			chars = make(map[string]interface{})
		}
		chars[itemID] = req.Item
		doc["chars"] = chars
	case "article":
		articles, _ := doc["articles"].([]interface{})
		found := false
		for i, a := range articles {
			if amap, ok := a.(map[string]interface{}); ok && amap["id"] == itemID {
				articles[i] = req.Item
				found = true
				break
			}
		}
		if !found {
			articles = append(articles, req.Item)
		}
		doc["articles"] = articles
	default:
		writeErr(w, http.StatusBadRequest, "不支持的条目类型: "+req.Kind)
		return
	}

	newBytes, err := json.MarshalIndent(doc, "", "  ")
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "序列化失败")
		return
	}
	if err := os.WriteFile(seedPath, newBytes, 0o644); err != nil {
		writeErrLog(w, r, http.StatusInternalServerError, "保存范例设定失败", err)
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{"ok": true, "message": "官方范例设定已成功添加"})
}

// handleDeleteReferenceItem allows admins to delete their own created reference items (super admins can delete any)
func (s *Server) handleDeleteReferenceItem(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		writeErr(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}
	user := CurrentUser(r)
	if user == nil {
		writeErr(w, http.StatusUnauthorized, "请先登录")
		return
	}
	if !user.IsAdmin {
		writeErr(w, http.StatusForbidden, "只有管理员可删除官方范例设定")
		return
	}

	kind := r.URL.Query().Get("kind")
	id := r.URL.Query().Get("id")
	if kind == "" || id == "" {
		writeErr(w, http.StatusBadRequest, "参数缺少 kind 或 id")
		return
	}

	seedPath := filepath.Join(s.cfg.DataDir, "seed.json")
	b, err := os.ReadFile(seedPath)
	if err != nil {
		writeErr(w, http.StatusNotFound, "未找到素材文件")
		return
	}
	var doc map[string]interface{}
	if err := json.Unmarshal(b, &doc); err != nil {
		writeErr(w, http.StatusInternalServerError, "素材文件格式错误")
		return
	}

	deleted := false
	checkCanDelete := func(item map[string]interface{}) bool {
		if user.IsSuperAdmin {
			return true
		}
		if aID, ok := item["refAuthorId"].(float64); ok && int64(aID) == user.ID {
			return true
		}
		if aID, ok := item["refAuthorId"].(int64); ok && aID == user.ID {
			return true
		}
		return false
	}

	switch kind {
	case "world":
		if worlds, ok := doc["worlds"].(map[string]interface{}); ok {
			if wItem, ok := worlds[id].(map[string]interface{}); ok {
				if !checkCanDelete(wItem) {
					writeErr(w, http.StatusForbidden, "只能删除自己添加的官方范例设定")
					return
				}
				delete(worlds, id)
				deleted = true
			}
		}
	case "org":
		if orgs, ok := doc["orgs"].(map[string]interface{}); ok {
			if oItem, ok := orgs[id].(map[string]interface{}); ok {
				if !checkCanDelete(oItem) {
					writeErr(w, http.StatusForbidden, "只能删除自己添加的官方范例设定")
					return
				}
				delete(orgs, id)
				deleted = true
			}
		}
	case "char":
		if chars, ok := doc["chars"].(map[string]interface{}); ok {
			if cItem, ok := chars[id].(map[string]interface{}); ok {
				if !checkCanDelete(cItem) {
					writeErr(w, http.StatusForbidden, "只能删除自己添加的官方范例设定")
					return
				}
				delete(chars, id)
				deleted = true
			}
		}
	case "article":
		if articles, ok := doc["articles"].([]interface{}); ok {
			var remaining []interface{}
			for _, a := range articles {
				if amap, ok := a.(map[string]interface{}); ok && amap["id"] == id {
					if !checkCanDelete(amap) {
						writeErr(w, http.StatusForbidden, "只能删除自己添加的官方范例设定")
						return
					}
					deleted = true
				} else {
					remaining = append(remaining, a)
				}
			}
			doc["articles"] = remaining
		}
	}

	if !deleted {
		writeErr(w, http.StatusNotFound, "未找到指定的范例条目或已删除")
		return
	}

	newBytes, err := json.MarshalIndent(doc, "", "  ")
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "序列化失败")
		return
	}
	if err := os.WriteFile(seedPath, newBytes, 0o644); err != nil {
		writeErrLog(w, r, http.StatusInternalServerError, "保存素材失败", err)
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{"ok": true, "message": "范例设定已成功删除"})
}

var referenceMapCollections = []string{"worlds", "orgs", "chars", "templates"}
var referenceListCollections = []string{"timeline", "plots", "scenes", "glossary", "articles"}

func isReferenceFlagged(v interface{}) bool {
	m, ok := v.(map[string]interface{})
	if !ok {
		return false
	}
	flag, _ := m["isReference"].(bool)
	return flag
}

// filterReferenceOnly returns a DocV6-shaped document that contains only `isReference` items.
// Non-collection fields (stats, preferences, ui) are dropped.
func filterReferenceOnly(doc map[string]interface{}) map[string]interface{} {
	out := map[string]interface{}{"_version": 6}
	for _, key := range referenceMapCollections {
		res := map[string]interface{}{}
		if m, ok := doc[key].(map[string]interface{}); ok {
			for id, v := range m {
				if isReferenceFlagged(v) {
					res[id] = v
				}
			}
		}
		out[key] = res
	}
	for _, key := range referenceListCollections {
		res := make([]interface{}, 0)
		if list, ok := doc[key].([]interface{}); ok {
			for _, v := range list {
				if isReferenceFlagged(v) {
					res = append(res, v)
				}
			}
		}
		out[key] = res
	}
	return out
}
