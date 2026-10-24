package api

import (
	"context"
	"encoding/json"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"

	"creator/server/internal/auth"
	"creator/server/internal/config"
	"creator/server/internal/store"
)

type ctxKey string

const userCtxKey ctxKey = "current_user"

func CurrentUser(r *http.Request) *store.User {
	if u, ok := r.Context().Value(userCtxKey).(*store.User); ok {
		return u
	}
	return nil
}

func ClientIP(r *http.Request) string {
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		parts := strings.Split(xff, ",")
		return strings.TrimSpace(parts[0])
	}
	if xrip := r.Header.Get("X-Real-IP"); xrip != "" {
		return strings.TrimSpace(xrip)
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err == nil && host != "" {
		return host
	}
	return r.RemoteAddr
}

func writeJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(data)
}

func writeErr(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]interface{}{
		"error": msg,
	})
}

// SecurityHeadersAndCSRF enforces security headers and validates Origin on state-changing requests.
func SecurityHeadersAndCSRF(cfg *config.Config, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("Referrer-Policy", "strict-origin-when-cross-origin")

		// Check Origin on POST / PUT / PATCH / DELETE to prevent CSRF
		switch r.Method {
		case http.MethodPost, http.MethodPut, http.MethodPatch, http.MethodDelete:
			origin := strings.TrimSpace(r.Header.Get("Origin"))
			if origin != "" {
				if cfg.AllowedOrigin != "" && origin != cfg.AllowedOrigin {
					writeErr(w, http.StatusForbidden, "CSRF Origin check failed")
					return
				}
				if cfg.AllowedOrigin == "" {
					u, err := url.Parse(origin)
					if err != nil || !sameHost(u.Host, r.Host) {
						writeErr(w, http.StatusForbidden, "CSRF Origin mismatch")
						return
					}
				}
			}
		}

		next.ServeHTTP(w, r)
	})
}

func sameHost(originHost, reqHost string) bool {
	if strings.EqualFold(originHost, reqHost) {
		return true
	}
	// Allow localhost / 127.0.0.1 Vite dev proxy differences during local dev
	oh, _, err1 := net.SplitHostPort(originHost)
	if err1 != nil {
		oh = originHost
	}
	rh, _, err2 := net.SplitHostPort(reqHost)
	if err2 != nil {
		rh = reqHost
	}
	if (oh == "localhost" || oh == "127.0.0.1") && (rh == "localhost" || rh == "127.0.0.1") {
		return true
	}
	return strings.EqualFold(oh, rh)
}

// SessionMiddleware attaches *store.User to request context if a valid session cookie is present.
func SessionMiddleware(st *store.Store, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		c, err := r.Cookie(auth.SessionCookie)
		if err == nil && c.Value != "" {
			tokenHash := auth.HashToken(c.Value)
			u, err := st.GetUserBySession(r.Context(), tokenHash, time.Duration(auth.SessionTTLHours)*time.Hour)
			if err == nil && u != nil {
				ctx := context.WithValue(r.Context(), userCtxKey, u)
				r = r.WithContext(ctx)
			}
		}
		next.ServeHTTP(w, r)
	})
}

func RequireAuth(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if CurrentUser(r) == nil {
			writeErr(w, http.StatusUnauthorized, "请先登录")
			return
		}
		next(w, r)
	}
}
