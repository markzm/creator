package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	"creator/server/internal/auth"
	"creator/server/internal/config"
	"creator/server/internal/store"
)

func TestReferenceMaterialsEndpoints(t *testing.T) {
	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "test.db")
	cfg := &config.Config{
		DataDir:      tmpDir,
		DBPath:       dbPath,
		RegisterMode: "open",
		AvatarDir:    filepath.Join(tmpDir, "avatars"),
	}

	st, err := store.Open(dbPath)
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	defer st.Close()

	srv := NewServer(cfg, st)

	// Initially no seed.json -> 204
	req := httptest.NewRequest(http.MethodGet, "/api/reference-materials", nil)
	rec := httptest.NewRecorder()
	srv.ServeHTTP(rec, req)
	if rec.Code != http.StatusNoContent {
		t.Errorf("expected 204 No Content, got %d", rec.Code)
	}

	// Create test seed.json
	sampleJSON := `{"_version":6,"worlds":{"wd_1":{"id":"wd_1","name":"地球","isReference":true}}}`
	_ = os.WriteFile(filepath.Join(tmpDir, "seed.json"), []byte(sampleJSON), 0o644)

	// Fetch -> 200 OK
	req = httptest.NewRequest(http.MethodGet, "/api/reference-materials", nil)
	rec = httptest.NewRecorder()
	srv.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Errorf("expected 200 OK, got %d", rec.Code)
	}

	// Non-admin trying to update -> 401 (unauthorized)
	reqUpdate := httptest.NewRequest(http.MethodPut, "/api/admin/reference-materials", bytes.NewReader([]byte(sampleJSON)))
	recUpdate := httptest.NewRecorder()
	srv.ServeHTTP(recUpdate, reqUpdate)
	if recUpdate.Code != http.StatusUnauthorized {
		t.Errorf("expected 401 Unauthorized for unauthed update, got %d", recUpdate.Code)
	}

	// Create non-admin and admin users
	uRegular, err := st.CreateUser(req.Context(), "user@test.local", "hashed1", "User", false)
	if err != nil {
		t.Fatalf("create user: %v", err)
	}
	uAdmin, err := st.CreateUser(req.Context(), "admin@test.local", "hashed2", "Admin", false)
	if err != nil {
		t.Fatalf("create admin: %v", err)
	}
	_ = st.SetUserAdmin(req.Context(), uAdmin.Email, true)

	// Regular user trying to update -> 403 Forbidden
	tokenRegular := "sess_regular_12345"
	_ = st.CreateSession(req.Context(), auth.HashToken(tokenRegular), uRegular.ID, "ua", "127.0.0.1", 3600*time.Second)
	reqRegular := httptest.NewRequest(http.MethodPut, "/api/admin/reference-materials", bytes.NewReader([]byte(sampleJSON)))
	reqRegular.AddCookie(&http.Cookie{Name: auth.SessionCookie, Value: tokenRegular})
	recRegular := httptest.NewRecorder()
	srv.ServeHTTP(recRegular, reqRegular)
	if recRegular.Code != http.StatusForbidden {
		t.Errorf("expected 403 Forbidden for non-admin update, got %d", recRegular.Code)
	}

	// Admin user updating -> 200 OK
	// The admin "accidentally" posts their whole workspace: a private char, private article and AI prefs.
	updatedJSON := `{"_version":6,
		"worlds":{"wd_astral":{"id":"wd_astral","name":"星渊群岛","isReference":true}},
		"chars":{"ch_secret":{"id":"ch_secret","name":"管理员私有角色","data":{"name":"绝密"}}},
		"articles":[{"id":"art_ref","title":"官方范文","isReference":true},{"id":"art_private","title":"私人日记"}],
		"preferences":{"aiCustomInstruction":"private prompt"},
		"stats":[{"date":"2026-01-01","chars":10}]}`
	tokenAdmin := "sess_admin_12345"
	_ = st.CreateSession(req.Context(), auth.HashToken(tokenAdmin), uAdmin.ID, "ua", "127.0.0.1", 3600*time.Second)
	reqAdmin := httptest.NewRequest(http.MethodPut, "/api/admin/reference-materials", bytes.NewReader([]byte(updatedJSON)))
	reqAdmin.AddCookie(&http.Cookie{Name: auth.SessionCookie, Value: tokenAdmin})
	recAdmin := httptest.NewRecorder()
	srv.ServeHTTP(recAdmin, reqAdmin)
	if recAdmin.Code != http.StatusOK {
		t.Errorf("expected 200 OK for admin update, got %d (body: %s)", recAdmin.Code, recAdmin.Body.String())
	}

	// Verify file was written
	b, _ := os.ReadFile(filepath.Join(tmpDir, "seed.json"))
	var check map[string]interface{}
	_ = json.Unmarshal(b, &check)
	if check["_version"] != float64(6) {
		t.Errorf("expected _version 6 in saved seed.json")
	}
	saved := string(b)
	for _, leak := range []string{"ch_secret", "绝密", "私人日记", "private prompt", "2026-01-01"} {
		if bytes.Contains(b, []byte(leak)) {
			t.Errorf("seed.json must only contain isReference items, but leaked %q: %s", leak, saved)
		}
	}
	if !bytes.Contains(b, []byte("wd_astral")) || !bytes.Contains(b, []byte("art_ref")) {
		t.Errorf("seed.json lost reference items: %s", saved)
	}
	if _, ok := check["preferences"]; ok {
		t.Errorf("preferences must be dropped from seed.json")
	}
}
