package legacy

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

func TestNormalizeUsername(t *testing.T) {
	tests := []struct {
		in   string
		want string
	}{
		{"13800138000", "+86 13800138000"},
		{"  138-0013-8000 ", "+86 13800138000"},
		{"+86 13800138000", "+86 13800138000"},
		{"8613800138000", "+86 13800138000"},
		{"008613800138000", "+86 13800138000"},
		{"author@example.com", "author@example.com"},
	}

	for _, tc := range tests {
		got := NormalizeUsername(tc.in)
		if got != tc.want {
			t.Errorf("NormalizeUsername(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}

func TestRunExportFullFlow(t *testing.T) {
	const (
		testKey   = "wbpk_test_key_123"
		testToken = "jwt_access_token_xyz"
		testUID   = "user_uuid_001"
	)
	fakeAvatarBytes := []byte{0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 'J', 'F', 'I', 'F'}

	mux := http.NewServeMux()

	// 1. Auth SignIn endpoint
	mux.HandleFunc("/.cloud/auth/v1/signin", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		if r.Header.Get(AccessKeyHeader) != testKey {
			http.Error(w, "invalid publishable key", http.StatusForbidden)
			return
		}
		var body map[string]string
		_ = json.NewDecoder(r.Body).Decode(&body)
		if body["username"] != "+86 13912345678" || body["password"] != "secret123" {
			http.Error(w, `{"message":"invalid credentials"}`, http.StatusUnauthorized)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{
			"access_token": "` + testToken + `",
			"refresh_token": "ref_123",
			"expires_in": 3600,
			"sub": "` + testUID + `",
			"name": "暮光造物主"
		}`))
	})

	// 2. Database user_sync endpoint
	mux.HandleFunc("/.cloud/database/rest/user_sync", func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer "+testToken {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		innerDB := map[string]interface{}{
			"version": 5.1,
			"activeW": "w_1",
			"activeO": "o_1",
			"activeC": "ch_1",
			"nowYear": 1024,
			"worlds": map[string]interface{}{
				"w_1": map[string]interface{}{"id": "w_1", "name": "艾尔登法环", "data": map[string]string{"w_name": "艾尔登法环"}},
			},
			"orgs": map[string]interface{}{
				"o_1": map[string]interface{}{"id": "o_1", "name": "黄金律法", "data": map[string]string{"o_name": "黄金律法"}},
			},
			"chars": map[string]interface{}{
				"ch_1": map[string]interface{}{"id": "ch_1", "name": "梅琳娜", "data": map[string]string{"name": "梅琳娜"}},
				"ch_2": map[string]interface{}{"id": "ch_2", "name": "菈妮", "data": map[string]string{"name": "菈妮"}},
			},
			"templates": map[string]interface{}{},
			"timeline":  []interface{}{map[string]interface{}{"year": 100, "name": "破碎战争"}},
			"plots":     []interface{}{},
			"scenes":    []interface{}{},
			"glossary":  []interface{}{},
			"stats":     []interface{}{},
		}
		innerBytes, _ := json.Marshal(innerDB)
		rows := []userSyncRow{
			{
				ID:        1,
				OwnerID:   testUID,
				OwnerName: "暮光造物主",
				Data:      string(innerBytes),
				UpdatedAt: "2026-10-24T12:00:00Z",
			},
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(rows)
	})

	// 3. Database user_presence endpoint
	mux.HandleFunc("/.cloud/database/rest/user_presence", func(w http.ResponseWriter, r *http.Request) {
		rows := []userPresenceRow{
			{
				ID:        10,
				OwnerID:   testUID,
				OwnerName: "暮光造物主",
				Avatar:    "img:users/" + testUID + "/avatars/170000.jpg",
				Bio:       "专注奇幻世界架空",
				Focus:     "正在创作世界观「艾尔登法环」",
				LastSeen:  "2026-10-24T12:05:00Z",
			},
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(rows)
	})

	// 4. Database world_shares endpoint
	mux.HandleFunc("/.cloud/database/rest/world_shares", func(w http.ResponseWriter, r *http.Request) {
		rows := []worldShareRow{
			{
				ID:        "sh_1",
				OwnerID:   testUID,
				OwnerName: "暮光造物主",
				Title:     "艾尔登法环设定集",
				Summary:   "交界地编年史",
				Content:   "黄金树耸立于交界地中央……",
				CreatedAt: "2026-10-24T11:00:00Z",
			},
			{
				ID:        "sh_2",
				OwnerID:   "other_user_999",
				OwnerName: "路人甲",
				Title:     "他人的世界",
				Summary:   "测试过滤",
				Content:   "内容",
				CreatedAt: "2026-10-23T11:00:00Z",
			},
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(rows)
	})

	// 5. Storage sign URL endpoint
	mux.HandleFunc("/.cloud/storage/object/sign/runtime", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`[{"path":"users/` + testUID + `/avatars/170000.jpg","signedURL":"/object/sign/runtime/users/` + testUID + `/avatars/170000.jpg?token=sig123"}]`))
	})

	// 6. Storage download signed URL endpoint
	mux.HandleFunc("/.cloud/storage/object/sign/runtime/users/"+testUID+"/avatars/170000.jpg", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Query().Get("token") != "sig123" {
			http.Error(w, "invalid signature", http.StatusForbidden)
			return
		}
		w.Header().Set("Content-Type", "image/jpeg")
		_, _ = w.Write(fakeAvatarBytes)
	})

	srv := httptest.NewServer(mux)
	defer srv.Close()

	outDir := filepath.Join(t.TempDir(), "export-test")
	manifest, err := RunExport(context.Background(), ExportConfig{
		Endpoint:       srv.URL,
		PublishableKey: testKey,
		Username:       "13912345678",
		Password:       "secret123",
		OutDir:         outDir,
		HTTPClient:     srv.Client(),
	})
	if err != nil {
		t.Fatalf("RunExport failed: %v", err)
	}

	if !manifest.HasSyncDoc {
		t.Fatalf("expected HasSyncDoc=true")
	}
	if manifest.WorldCount != 1 || manifest.OrgCount != 1 || manifest.CharCount != 2 || manifest.TimelineCnt != 1 {
		t.Fatalf("unexpected entity counts: %+v", manifest)
	}
	if manifest.MyShareCount != 1 || manifest.AllShareCnt != 2 {
		t.Fatalf("unexpected share counts: my=%d all=%d", manifest.MyShareCount, manifest.AllShareCnt)
	}
	if manifest.AvatarFile != "avatar.jpg" {
		t.Fatalf("expected avatar.jpg downloaded, got %q", manifest.AvatarFile)
	}

	// Verify db.json exists and has version 5.3 compatible structure
	dbBytes, err := os.ReadFile(filepath.Join(outDir, "db.json"))
	if err != nil {
		t.Fatalf("read db.json: %v", err)
	}
	var dbMap map[string]interface{}
	if err := json.Unmarshal(dbBytes, &dbMap); err != nil {
		t.Fatalf("unmarshal db.json: %v", err)
	}
	if dbMap["version"] != 5.3 {
		t.Errorf("expected db.json version 5.3, got %v", dbMap["version"])
	}

	// Verify avatar.jpg bytes match
	avBytes, err := os.ReadFile(filepath.Join(outDir, "avatar.jpg"))
	if err != nil {
		t.Fatalf("read avatar.jpg: %v", err)
	}
	if string(avBytes) != string(fakeAvatarBytes) {
		t.Errorf("avatar bytes mismatch")
	}
}
