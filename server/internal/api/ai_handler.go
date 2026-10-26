package api

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"creator/server/internal/ai"
	"creator/server/internal/store"
)

// allowAI enforces the per-user AI quota (30 calls / minute). The routes are wrapped in
// RequireAuth, so user is never nil here; the guard is defensive.
func (s *Server) allowAI(w http.ResponseWriter, user *store.User) bool {
	if user == nil {
		writeErr(w, http.StatusUnauthorized, "请先登录后使用 AI 功能")
		return false
	}
	if !s.guard.Allow("ai", strconv.FormatInt(user.ID, 10), 30, time.Minute) {
		writeErr(w, http.StatusTooManyRequests, "AI 调用过于频繁，请稍后再试")
		return false
	}
	return true
}

func aiErrStatus(err error) int {
	if errors.Is(err, ai.ErrInvalidBaseURL) {
		return http.StatusBadRequest
	}
	return http.StatusInternalServerError
}

func (s *Server) handleAIStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeErr(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"publicReady": s.aiService.PublicAIReady(),
		"freeModels":  s.aiService.GetPublicFreeModels(),
		"presets": []map[string]string{
			{
				"id":      "deepseek",
				"name":    "DeepSeek 官方 API",
				"baseUrl": "https://api.deepseek.com/v1",
				"model":   "deepseek-chat",
				"hint":    "推荐：速度快、文学创作与中文能力极强",
			},
			{
				"id":      "siliconflow",
				"name":    "SiliconFlow 硅基流动",
				"baseUrl": "https://api.siliconflow.cn/v1",
				"model":   "deepseek-ai/DeepSeek-V3",
				"hint":    "国内高速中转，支持 DeepSeek-V3/R1 系列",
			},
			{
				"id":      "openrouter",
				"name":    "OpenRouter 个人 Key",
				"baseUrl": "https://openrouter.ai/api/v1",
				"model":   "deepseek/deepseek-chat",
				"hint":    "支持全球顶尖大模型聚合调用",
			},
		},
	})
}

func (s *Server) handleAIGenerate(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeErr(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	user := CurrentUser(r)
	if !s.allowAI(w, user) {
		return
	}

	var req ai.GenerateRequest
	r.Body = http.MaxBytesReader(w, r.Body, 1024*1024)
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, "请求格式错误")
		return
	}

	// If custom AI is not passed directly by client, check if user has cloud-saved config
	if (req.CustomAI == nil || req.CustomAI.APIKey == "") && user != nil && user.AIConfigEnc != "" {
		decJSON, err := ai.DecryptUserConfig(user.AIConfigEnc, s.cfg.SecretKey)
		if err == nil && decJSON != "" {
			var cloudCfg ai.UserAIConfig
			if json.Unmarshal([]byte(decJSON), &cloudCfg) == nil && cloudCfg.APIKey != "" {
				req.CustomAI = &cloudCfg
			}
		}
	}

	// If preferences not passed, check user preferences
	if req.Preferences == nil && user != nil && user.CustomPrefsJSON != "" {
		var prefs ai.StudioPreferences
		if json.Unmarshal([]byte(user.CustomPrefsJSON), &prefs) == nil {
			req.Preferences = &prefs
		}
	}

	resp, err := s.aiService.Generate(r.Context(), req)
	if err != nil {
		writeErr(w, aiErrStatus(err), err.Error())
		return
	}

	writeJSON(w, http.StatusOK, resp)
}

func (s *Server) handleAIPaint(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeErr(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	user := CurrentUser(r)
	if !s.allowAI(w, user) {
		return
	}

	var req ai.AnimePaintRequest
	r.Body = http.MaxBytesReader(w, r.Body, 1024*1024)
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, "请求格式错误")
		return
	}

	if (req.CustomAI == nil || req.CustomAI.APIKey == "") && user != nil && user.AIConfigEnc != "" {
		decJSON, err := ai.DecryptUserConfig(user.AIConfigEnc, s.cfg.SecretKey)
		if err == nil && decJSON != "" {
			var cloudCfg ai.UserAIConfig
			if json.Unmarshal([]byte(decJSON), &cloudCfg) == nil && cloudCfg.APIKey != "" {
				req.CustomAI = &cloudCfg
			}
		}
	}

	resp, err := s.aiService.PaintAnimeArt(r.Context(), &req)
	if err != nil {
		writeErr(w, aiErrStatus(err), "AI绘画生成失败: "+err.Error())
		return
	}

	writeJSON(w, http.StatusOK, resp)
}

func (s *Server) handleAITest(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeErr(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	if !s.allowAI(w, CurrentUser(r)) {
		return
	}

	var cfg ai.UserAIConfig
	r.Body = http.MaxBytesReader(w, r.Body, 32*1024)
	if err := json.NewDecoder(r.Body).Decode(&cfg); err != nil {
		writeErr(w, http.StatusBadRequest, "请求格式错误")
		return
	}
	// The UI never holds the stored key once it is saved in the cloud; fall back to it here.
	if user := CurrentUser(r); strings.TrimSpace(cfg.APIKey) == "" && user != nil && user.AIConfigEnc != "" {
		if decJSON, err := ai.DecryptUserConfig(user.AIConfigEnc, s.cfg.SecretKey); err == nil && decJSON != "" {
			var cloudCfg ai.UserAIConfig
			if json.Unmarshal([]byte(decJSON), &cloudCfg) == nil && cloudCfg.APIKey != "" {
				if strings.TrimSpace(cfg.BaseURL) == "" {
					cfg.BaseURL = cloudCfg.BaseURL
				}
				if strings.TrimSpace(cfg.Model) == "" {
					cfg.Model = cloudCfg.Model
				}
				cfg.APIKey = cloudCfg.APIKey
			}
		}
	}

	msg, err := s.aiService.TestConnection(r.Context(), cfg)
	if err != nil {
		writeErr(w, http.StatusBadRequest, "测试失败: "+err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"ok":      true,
		"message": msg,
	})
}

func (s *Server) handleUserAIConfig(w http.ResponseWriter, r *http.Request) {
	user := CurrentUser(r)
	if user == nil {
		writeErr(w, http.StatusUnauthorized, "请先登录")
		return
	}

	switch r.Method {
	case http.MethodGet:
		// Never return the raw key: the client only needs to know whether one is stored.
		var customAI map[string]interface{}
		if user.AIConfigEnc != "" {
			decJSON, err := ai.DecryptUserConfig(user.AIConfigEnc, s.cfg.SecretKey)
			if err == nil && decJSON != "" {
				var cfg ai.UserAIConfig
				if json.Unmarshal([]byte(decJSON), &cfg) == nil {
					customAI = map[string]interface{}{
						"provider":     cfg.Provider,
						"baseUrl":      cfg.BaseURL,
						"model":        cfg.Model,
						"hasKey":       strings.TrimSpace(cfg.APIKey) != "",
						"apiKeyMasked": maskKey(cfg.APIKey),
					}
				}
			} else if err != nil {
				log.Printf("[ai-config] decrypt failed for user %d (secret changed?): %v", user.ID, err)
			}
		}
		var prefs ai.StudioPreferences
		if user.CustomPrefsJSON != "" {
			_ = json.Unmarshal([]byte(user.CustomPrefsJSON), &prefs)
		}

		writeJSON(w, http.StatusOK, map[string]interface{}{
			"customAi":    customAI,
			"preferences": prefs,
		})

	case http.MethodPut:
		// Partial update: only the parts present in the payload are written.
		var payload struct {
			CustomAI    *ai.UserAIConfig      `json:"customAi"`
			Preferences *ai.StudioPreferences `json:"preferences"`
			ClearKey    bool                  `json:"clearKey"`
		}
		r.Body = http.MaxBytesReader(w, r.Body, 64*1024)
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			writeErr(w, http.StatusBadRequest, "请求格式错误")
			return
		}

		var encPtr, prefsPtr *string
		if payload.ClearKey {
			empty := ""
			encPtr = &empty
		} else if payload.CustomAI != nil && strings.TrimSpace(payload.CustomAI.APIKey) != "" {
			if _, err := s.aiService.ValidateBaseURL(payload.CustomAI.BaseURL); err != nil {
				writeErr(w, http.StatusBadRequest, err.Error())
				return
			}
			b, _ := json.Marshal(payload.CustomAI)
			enc, err := ai.EncryptUserConfig(string(b), s.cfg.SecretKey)
			if err != nil {
				writeErr(w, http.StatusInternalServerError, "加密存储配置失败")
				return
			}
			encPtr = &enc
		}
		if payload.Preferences != nil {
			b, _ := json.Marshal(payload.Preferences)
			str := string(b)
			prefsPtr = &str
		}
		if encPtr == nil && prefsPtr == nil {
			writeErr(w, http.StatusBadRequest, "没有可保存的内容")
			return
		}

		if err := s.store.UpdateUserAIConfigAndPrefs(r.Context(), user.ID, encPtr, prefsPtr); err != nil {
			writeErrLog(w, r, http.StatusInternalServerError, "保存配置失败", err)
			return
		}

		writeJSON(w, http.StatusOK, map[string]bool{"ok": true})

	default:
		writeErr(w, http.StatusMethodNotAllowed, "Method not allowed")
	}
}

func maskKey(k string) string {
	k = strings.TrimSpace(k)
	if k == "" {
		return ""
	}
	if len(k) <= 8 {
		return "****"
	}
	return k[:3] + "…" + k[len(k)-4:]
}
