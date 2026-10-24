package api

import (
	"bytes"
	"encoding/json"
	"fmt"
	"image"
	"image/jpeg"
	_ "image/png"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

const MaxAvatarUploadBytes = 2 << 20 // 2 MB

func (s *Server) handleMe(w http.ResponseWriter, r *http.Request) {
	user := CurrentUser(r)
	if user == nil {
		writeErr(w, http.StatusUnauthorized, "请先登录")
		return
	}

	switch r.Method {
	case http.MethodGet:
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"user": user,
		})

	case http.MethodPatch:
		var req struct {
			Name   *string `json:"name"`
			Avatar *string `json:"avatar"`
			Bio    *string `json:"bio"`
		}
		r.Body = http.MaxBytesReader(w, r.Body, 8192)
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeErr(w, http.StatusBadRequest, "请求格式错误")
			return
		}
		updated, err := s.store.UpdateProfile(r.Context(), user.ID, req.Name, req.Avatar, req.Bio)
		if err != nil {
			writeErr(w, http.StatusInternalServerError, "更新个人资料失败")
			return
		}
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"user": updated,
		})

	default:
		writeErr(w, http.StatusMethodNotAllowed, "Method not allowed")
	}
}

func (s *Server) handleMeAvatar(w http.ResponseWriter, r *http.Request) {
	user := CurrentUser(r)
	if user == nil {
		writeErr(w, http.StatusUnauthorized, "请先登录")
		return
	}
	if r.Method != http.MethodPost {
		writeErr(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, MaxAvatarUploadBytes)
	if err := r.ParseMultipartForm(MaxAvatarUploadBytes); err != nil {
		writeErr(w, http.StatusBadRequest, "头像图片不能超过 2MB")
		return
	}

	file, _, err := r.FormFile("avatar")
	if err != nil {
		writeErr(w, http.StatusBadRequest, "未找到上传文件字段 avatar")
		return
	}
	defer file.Close()

	rawBytes, err := io.ReadAll(file)
	if err != nil || len(rawBytes) < 16 {
		writeErr(w, http.StatusBadRequest, "读取图片内容失败")
		return
	}

	// Verify JPEG (FF D8 FF) or PNG (89 50 4E 47) magic bytes
	isJPEG := rawBytes[0] == 0xFF && rawBytes[1] == 0xD8 && rawBytes[2] == 0xFF
	isPNG := rawBytes[0] == 0x89 && rawBytes[1] == 0x50 && rawBytes[2] == 0x4E && rawBytes[3] == 0x47
	if !isJPEG && !isPNG {
		writeErr(w, http.StatusBadRequest, "仅支持 JPEG 或 PNG 格式图片")
		return
	}

	img, _, err := image.Decode(bytes.NewReader(rawBytes))
	if err != nil {
		writeErr(w, http.StatusBadRequest, "图片解码失败，文件已损坏")
		return
	}

	// Re-encode to clean JPEG (strips any EXIF/polyglot payload)
	var outBuf bytes.Buffer
	if err := jpeg.Encode(&outBuf, img, &jpeg.Options{Quality: 85}); err != nil {
		writeErr(w, http.StatusInternalServerError, "图片处理失败")
		return
	}

	if err := os.MkdirAll(s.cfg.AvatarDir, 0o750); err != nil {
		writeErr(w, http.StatusInternalServerError, "创建头像目录失败")
		return
	}

	fileName := fmt.Sprintf("u_%d_%d.jpg", user.ID, time.Now().UnixMilli())
	destPath := filepath.Join(s.cfg.AvatarDir, fileName)
	if err := os.WriteFile(destPath, outBuf.Bytes(), 0o640); err != nil {
		writeErr(w, http.StatusInternalServerError, "保存头像文件失败")
		return
	}

	// Best-effort cleanup of old uploaded avatar file
	if strings.HasPrefix(user.AvatarURL, "/avatars/u_") {
		oldName := filepath.Base(user.AvatarURL)
		if oldName != fileName {
			_ = os.Remove(filepath.Join(s.cfg.AvatarDir, oldName))
		}
	}

	newURL := "/avatars/" + fileName
	updated, err := s.store.UpdateProfile(r.Context(), user.ID, nil, &newURL, nil)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "更新用户头像记录失败")
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"avatar": newURL,
		"user":   updated,
	})
}
