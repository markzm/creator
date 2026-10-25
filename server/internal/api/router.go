package api

import (
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"creator/server/internal/ai"
	"creator/server/internal/auth"
	"creator/server/internal/config"
	"creator/server/internal/mail"
	"creator/server/internal/store"
)

type Server struct {
	cfg       *config.Config
	store     *store.Store
	guard     *auth.Guard
	challenge *auth.ChallengeManager
	mailer    *mail.Sender
	aiService *ai.AIService
}

func NewServer(cfg *config.Config, st *store.Store) http.Handler {
	srv := &Server{
		cfg:       cfg,
		store:     st,
		guard:     auth.NewGuard(),
		challenge: auth.NewChallengeManager(cfg.SecretKey),
		mailer:    mail.NewSender(cfg),
		aiService: ai.NewService(cfg),
	}

	mux := http.NewServeMux()

	// Health check
	mux.HandleFunc("/api/healthz", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"status":       "ok",
			"registerMode": cfg.RegisterMode,
		})
	})

	// Initial seed data & reference materials
	mux.HandleFunc("/api/seed", srv.handleGetReferenceMaterials)
	mux.HandleFunc("/api/reference-materials", srv.handleGetReferenceMaterials)
	mux.HandleFunc("/api/admin/reference-materials", srv.handleUpdateReferenceMaterials)

	// Auth endpoints
	mux.HandleFunc("/api/auth/challenge", srv.handleAuthChallenge)
	mux.HandleFunc("/api/auth/register", srv.handleRegister)
	mux.HandleFunc("/api/auth/login", srv.handleLogin)
	mux.HandleFunc("/api/auth/logout", srv.handleLogout)
	mux.HandleFunc("/api/auth/forgot", srv.handleForgotPassword)
	mux.HandleFunc("/api/auth/reset", srv.handleResetPassword)

	// User profile & avatar
	mux.HandleFunc("/api/me", srv.handleMe)
	mux.HandleFunc("/api/me/avatar", srv.handleMeAvatar)

	// Cloud Sync & Revisions
	mux.HandleFunc("/api/sync", srv.handleSync)
	mux.HandleFunc("/api/sync/revisions", srv.handleRevisions)
	mux.HandleFunc("/api/sync/revisions/", srv.handleRevisions)

	// Presence, Lobby & World Shares
	mux.HandleFunc("/api/presence", srv.handlePresence)
	mux.HandleFunc("/api/lobby/users", srv.handleLobbyUsers)
	mux.HandleFunc("/api/shares", srv.handleShares)
	mux.HandleFunc("/api/shares/", srv.handleShares)
	mux.HandleFunc("/api/stats/global", srv.handleGlobalStats)

	// AI generation & config
	mux.HandleFunc("/api/ai/status", srv.handleAIStatus)
	mux.HandleFunc("/api/ai/generate", srv.handleAIGenerate)
	mux.HandleFunc("/api/ai/test", srv.handleAITest)
	mux.HandleFunc("/api/me/ai-config", srv.handleUserAIConfig)

	// Serve avatars directly when accessed via Go server
	mux.HandleFunc("/avatars/", func(w http.ResponseWriter, r *http.Request) {
		name := filepath.Base(strings.TrimPrefix(r.URL.Path, "/avatars/"))
		if name == "" || name == "." || name == ".." {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Cache-Control", "public, max-age=86400")
		http.ServeFile(w, r, filepath.Join(cfg.AvatarDir, name))
	})

	// Static SPA fallback when SERVE_STATIC=true
	if cfg.ServeStatic && cfg.StaticDir != "" {
		mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
			if strings.HasPrefix(r.URL.Path, "/api/") {
				writeErr(w, http.StatusNotFound, "API endpoint not found")
				return
			}
			cleanPath := filepath.Clean(strings.TrimPrefix(r.URL.Path, "/"))
			if cleanPath == "." || cleanPath == "" {
				cleanPath = "index.html"
			}
			fullPath := filepath.Join(cfg.StaticDir, cleanPath)
			if fi, err := os.Stat(fullPath); err == nil && !fi.IsDir() {
				if strings.HasPrefix(cleanPath, "assets/") {
					w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
				} else if cleanPath == "index.html" {
					w.Header().Set("Cache-Control", "no-cache")
				}
				http.ServeFile(w, r, fullPath)
				return
			}
			// History mode fallback to index.html
			indexFile := filepath.Join(cfg.StaticDir, "index.html")
			if _, err := os.Stat(indexFile); err == nil {
				w.Header().Set("Cache-Control", "no-cache")
				http.ServeFile(w, r, indexFile)
				return
			}
			http.NotFound(w, r)
		})
	}

	var handler http.Handler = mux
	handler = SessionMiddleware(st, handler)
	handler = SecurityHeadersAndCSRF(cfg, handler)
	return handler
}
