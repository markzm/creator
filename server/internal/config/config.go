package config

import (
	"crypto/rand"
	"encoding/hex"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

type RegisterMode string

const (
	RegisterModeOpen   RegisterMode = "open"
	RegisterModeInvite RegisterMode = "invite"
	RegisterModeClosed RegisterMode = "closed"
)

type Config struct {
	ListenAddr    string
	DataDir       string
	DBPath        string
	AvatarDir     string
	StaticDir     string
	ServeStatic   bool
	RegisterMode  RegisterMode
	SecureCookie  bool
	AllowedOrigin string
	SecretKey     string // Used for stateless HMAC challenge signing

	// SuperAdminEmail (SUPER_ADMIN_EMAIL) is promoted to super admin at startup. Super-admin status
	// is otherwise only granted via the CLI (`creator user promote --super`), never by nickname.
	SuperAdminEmail string
	// AllowedAIHosts (ALLOWED_AI_HOSTS, comma separated) extends the allow-list of hosts that
	// user-supplied AI base URLs may point to.
	AllowedAIHosts []string

	// AI settings
	OpenRouterAPIKey string
	OpenRouterModels []string

	// Optional SMTP settings
	SMTPHost string
	SMTPPort int
	SMTPUser string
	SMTPPass string
	SMTPFrom string
}

func Load() *Config {
	dataDir := envOr("DATA_DIR", "/data/creator/data")
	dbPath := envOr("DB_PATH", filepath.Join(dataDir, "app.db"))
	avatarDir := envOr("AVATAR_DIR", filepath.Join(dataDir, "avatars"))
	staticDir := envOr("STATIC_DIR", "/data/creator/web/dist")

	regMode := RegisterMode(strings.ToLower(envOr("REGISTER_MODE", "open")))
	if regMode != RegisterModeOpen && regMode != RegisterModeInvite && regMode != RegisterModeClosed {
		regMode = RegisterModeOpen
	}

	secret := os.Getenv("SECRET_KEY")
	if secret == "" {
		b := make([]byte, 32)
		_, _ = rand.Read(b)
		secret = hex.EncodeToString(b)
	}

	smtpPort, _ := strconv.Atoi(envOr("SMTP_PORT", "587"))

	modelsStr := envOr("OPENROUTER_FREE_MODELS", envOr("OPENROUTER_MODELS", "openrouter/free,nvidia/nemotron-3-ultra-550b-a55b:free,nvidia/nemotron-3.5-lightning:free,google/gemini-2.0-flash-exp:free,meta-llama/llama-3.3-70b-instruct:free"))
	var models []string
	for _, m := range strings.Split(modelsStr, ",") {
		m = strings.TrimSpace(m)
		if m != "" {
			models = append(models, m)
		}
	}
	if len(models) == 0 {
		models = []string{"openrouter/free"}
	}

	var aiHosts []string
	for _, h := range strings.Split(os.Getenv("ALLOWED_AI_HOSTS"), ",") {
		h = strings.ToLower(strings.TrimSpace(h))
		if h != "" {
			aiHosts = append(aiHosts, h)
		}
	}

	return &Config{
		SuperAdminEmail:  strings.ToLower(strings.TrimSpace(os.Getenv("SUPER_ADMIN_EMAIL"))),
		AllowedAIHosts:   aiHosts,
		ListenAddr:       envOr("LISTEN_ADDR", "0.0.0.0:8080"),
		DataDir:          dataDir,
		DBPath:           dbPath,
		AvatarDir:        avatarDir,
		StaticDir:        staticDir,
		ServeStatic:      envBool("SERVE_STATIC", true),
		RegisterMode:     regMode,
		SecureCookie:     envBool("SECURE_COOKIE", false),
		AllowedOrigin:    os.Getenv("ALLOWED_ORIGIN"),
		SecretKey:        secret,
		OpenRouterAPIKey: os.Getenv("OPENROUTER_API_KEY"),
		OpenRouterModels: models,
		SMTPHost:         os.Getenv("SMTP_HOST"),
		SMTPPort:         smtpPort,
		SMTPUser:         os.Getenv("SMTP_USER"),
		SMTPPass:         os.Getenv("SMTP_PASS"),
		SMTPFrom:         envOr("SMTP_FROM", os.Getenv("SMTP_USER")),
	}
}

func (c *Config) SMTPEnabled() bool {
	return c.SMTPHost != "" && c.SMTPUser != "" && c.SMTPPass != ""
}

func envOr(key, fallback string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return fallback
}

func envBool(key string, fallback bool) bool {
	v := strings.ToLower(strings.TrimSpace(os.Getenv(key)))
	switch v {
	case "1", "true", "yes", "on":
		return true
	case "0", "false", "no", "off":
		return false
	default:
		return fallback
	}
}
