package api

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"creator/server/internal/auth"
	"creator/server/internal/config"
	"creator/server/internal/store"
)

func (s *Server) handleAuthChallenge(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeErr(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}
	ch, err := s.challenge.Generate()
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "无法生成验证码")
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"question":     ch.Question,
		"token":        ch.Token,
		"registerMode": s.cfg.RegisterMode,
		"smtpEnabled":  s.mailer.Enabled(),
	})
}

func (s *Server) handleRegister(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeErr(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}
	if s.cfg.RegisterMode == config.RegisterModeClosed {
		writeErr(w, http.StatusForbidden, "当前系统已关闭公开注册，请联系管理员创建账号")
		return
	}

	ip := ClientIP(r)
	if !s.guard.AllowRegister(ip) {
		writeErr(w, http.StatusTooManyRequests, "注册过于频繁，请稍后再试")
		return
	}

	var req struct {
		Email           string `json:"email"`
		Password        string `json:"password"`
		InviteCode      string `json:"inviteCode"`
		ChallengeToken  string `json:"challengeToken"`
		ChallengeAnswer string `json:"challengeAnswer"`
	}
	r.Body = http.MaxBytesReader(w, r.Body, 8192)
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, "请求格式错误")
		return
	}

	// Verify challenge when provided or required in open mode
	if req.ChallengeToken != "" || req.ChallengeAnswer != "" {
		if err := s.challenge.Verify(req.ChallengeToken, req.ChallengeAnswer); err != nil {
			writeErr(w, http.StatusBadRequest, err.Error())
			return
		}
	}

	email := strings.ToLower(strings.TrimSpace(req.Email))
	if err := auth.ValidateEmail(email); err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}

	hash, err := auth.HashPassword(req.Password)
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}

	requireInvite := s.cfg.RegisterMode == config.RegisterModeInvite
	user, err := s.store.CreateUser(r.Context(), email, hash, req.InviteCode, requireInvite)
	if err != nil {
		if errors.Is(err, store.ErrEmailTaken) {
			writeErr(w, http.StatusConflict, "该邮箱已注册，请直接登录")
			return
		}
		if errors.Is(err, store.ErrInvalidInvite) {
			writeErr(w, http.StatusBadRequest, "邀请码无效或已用尽")
			return
		}
		writeErr(w, http.StatusInternalServerError, "注册失败")
		return
	}

	if err := s.issueSessionCookie(w, r, user.ID); err != nil {
		writeErr(w, http.StatusInternalServerError, "创建会话失败")
		return
	}

	writeJSON(w, http.StatusCreated, map[string]interface{}{
		"user": user,
	})
}

func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeErr(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	var req struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	r.Body = http.MaxBytesReader(w, r.Body, 8192)
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, "请求格式错误")
		return
	}

	email := strings.ToLower(strings.TrimSpace(req.Email))
	ip := ClientIP(r)
	if !s.guard.AllowLogin(ip, email) {
		writeErr(w, http.StatusTooManyRequests, "登录尝试过多，账号已暂时保护锁定，请 15 分钟后再试")
		return
	}

	user, err := s.store.GetUserByEmail(r.Context(), email)
	if err != nil || user == nil || !auth.CheckPassword(req.Password, user.PasswordHash) {
		s.guard.RecordLoginFailure(email)
		writeErr(w, http.StatusUnauthorized, "邮箱或密码错误")
		return
	}
	if user.IsDisabled {
		writeErr(w, http.StatusForbidden, "该账号已被禁用")
		return
	}

	s.guard.ClearLoginFailures(email)
	if err := s.issueSessionCookie(w, r, user.ID); err != nil {
		writeErr(w, http.StatusInternalServerError, "创建会话失败")
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"user": user,
	})
}

func (s *Server) handleLogout(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeErr(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}
	if c, err := r.Cookie(auth.SessionCookie); err == nil && c.Value != "" {
		_ = s.store.DeleteSession(r.Context(), auth.HashToken(c.Value))
	}
	http.SetCookie(w, &http.Cookie{
		Name:     auth.SessionCookie,
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		Secure:   s.cfg.SecureCookie,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   -1,
	})
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) handleForgotPassword(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeErr(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}
	if !s.mailer.Enabled() {
		writeErr(w, http.StatusNotImplemented, "当前未启用邮件服务，请联系管理员通过 CLI 重置密码")
		return
	}
	var req struct {
		Email string `json:"email"`
	}
	_ = json.NewDecoder(r.Body).Decode(&req)
	email := strings.ToLower(strings.TrimSpace(req.Email))

	u, err := s.store.GetUserByEmail(r.Context(), email)
	if err == nil && u != nil {
		b := make([]byte, 16)
		_, _ = rand.Read(b)
		rawToken := hex.EncodeToString(b)
		_ = s.store.CreatePasswordReset(r.Context(), auth.HashToken(rawToken), u.ID, 15*time.Minute)
		_ = s.mailer.SendResetToken(email, rawToken)
	}
	// Always return 200 to prevent user enumeration
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) handleResetPassword(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeErr(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}
	var req struct {
		Token       string `json:"token"`
		NewPassword string `json:"newPassword"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, "请求格式错误")
		return
	}
	hash, err := auth.HashPassword(req.NewPassword)
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	if err := s.store.ConsumePasswordReset(r.Context(), auth.HashToken(req.Token), hash); err != nil {
		writeErr(w, http.StatusBadRequest, "重置令牌无效或已过期")
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) issueSessionCookie(w http.ResponseWriter, r *http.Request, userID int64) error {
	rawToken, tokenHash, err := auth.GenerateSessionToken()
	if err != nil {
		return err
	}
	ttl := time.Duration(auth.SessionTTLHours) * time.Hour
	if err := s.store.CreateSession(r.Context(), tokenHash, userID, r.UserAgent(), ClientIP(r), ttl); err != nil {
		return err
	}
	http.SetCookie(w, &http.Cookie{
		Name:     auth.SessionCookie,
		Value:    rawToken,
		Path:     "/",
		HttpOnly: true,
		Secure:   s.cfg.SecureCookie,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   auth.SessionTTLHours * 3600,
	})
	return nil
}
