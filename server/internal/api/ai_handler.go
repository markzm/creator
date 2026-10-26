package api

import (
	"encoding/json"
	"net/http"
	"strings"

	"creator/server/internal/ai"
)

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

	var req ai.GenerateRequest
	r.Body = http.MaxBytesReader(w, r.Body, 1024*1024)
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, "请求格式错误")
		return
	}

	user := CurrentUser(r)
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
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, resp)
}

func (s *Server) handleAIPaint(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeErr(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	var req ai.AnimePaintRequest
	r.Body = http.MaxBytesReader(w, r.Body, 1024*1024)
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, "请求格式错误")
		return
	}

	user := CurrentUser(r)
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
		writeErr(w, http.StatusInternalServerError, "AI绘画生成失败: "+err.Error())
		return
	}

	writeJSON(w, http.StatusOK, resp)
}

func (s *Server) handleAITest(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeErr(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	var cfg ai.UserAIConfig
	r.Body = http.MaxBytesReader(w, r.Body, 32*1024)
	if err := json.NewDecoder(r.Body).Decode(&cfg); err != nil {
		writeErr(w, http.StatusBadRequest, "请求格式错误")
		return
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
		var customAI *ai.UserAIConfig
		if user.AIConfigEnc != "" {
			decJSON, err := ai.DecryptUserConfig(user.AIConfigEnc, s.cfg.SecretKey)
			if err == nil && decJSON != "" {
				var cfg ai.UserAIConfig
				if json.Unmarshal([]byte(decJSON), &cfg) == nil {
					// Return masked key or full key for the owner
					customAI = &cfg
				}
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
		var payload struct {
			CustomAI    *ai.UserAIConfig      `json:"customAi"`
			Preferences *ai.StudioPreferences `json:"preferences"`
		}
		r.Body = http.MaxBytesReader(w, r.Body, 64*1024)
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			writeErr(w, http.StatusBadRequest, "请求格式错误")
			return
		}

		var encConfig string
		if payload.CustomAI != nil && strings.TrimSpace(payload.CustomAI.APIKey) != "" {
			b, _ := json.Marshal(payload.CustomAI)
			enc, err := ai.EncryptUserConfig(string(b), s.cfg.SecretKey)
			if err != nil {
				writeErr(w, http.StatusInternalServerError, "加密存储配置失败")
				return
			}
			encConfig = enc
		}

		var prefsJSON string
		if payload.Preferences != nil {
			b, _ := json.Marshal(payload.Preferences)
			prefsJSON = string(b)
		} else {
			prefsJSON = "{}"
		}

		if err := s.store.UpdateUserAIConfigAndPrefs(r.Context(), user.ID, encConfig, prefsJSON); err != nil {
			writeErr(w, http.StatusInternalServerError, "保存配置失败")
			return
		}

		writeJSON(w, http.StatusOK, map[string]bool{"ok": true})

	default:
		writeErr(w, http.StatusMethodNotAllowed, "Method not allowed")
	}
}
