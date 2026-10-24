package legacy

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"creator/server/internal/store"
)

func TestImportIntoStoreFullFlow(t *testing.T) {
	tmpDir := t.TempDir()
	exportDir := filepath.Join(tmpDir, "export")
	rawDir := filepath.Join(exportDir, "raw")
	if err := os.MkdirAll(rawDir, 0o750); err != nil {
		t.Fatal(err)
	}

	// Write mock exported db.json
	dbJSON := `{
		"version": 5.3,
		"worlds": {
			"w_1": {"id": "w_1", "name": "艾瑟兰", "data": {"w_name": "艾瑟兰", "w_core": "魔法衰退"}}
		},
		"orgs": {
			"o_1": {"id": "o_1", "name": "暮光议会", "data": {"o_name": "暮光议会"}}
		},
		"chars": {
			"c_1": {"id": "c_1", "name": "莉莉安", "data": {"name": "莉莉安"}}
		},
		"timeline": [{"name": "雾谷之战", "year": 302}],
		"stats": [{"d": "2026-10-24", "n": 1500}],
		"ui": {"activeW": "w_1", "nowYear": 305}
	}`
	_ = os.WriteFile(filepath.Join(exportDir, "db.json"), []byte(dbJSON), 0o640)
	_ = os.WriteFile(filepath.Join(rawDir, "my_presence.json"), []byte(`{
		"owner_name": "星海造物主",
		"avatar": "img:users/u1/avatars/1.jpg",
		"bio": "世界观设定控"
	}`), 0o640)
	_ = os.WriteFile(filepath.Join(rawDir, "my_shares.json"), []byte(`[
		{"id": "101", "owner_name": "星海造物主", "title": "艾瑟兰世界观", "summary": "首篇分享", "content": "正文内容", "created_at": "2026-10-24T10:00:00Z"}
	]`), 0o640)
	_ = os.WriteFile(filepath.Join(exportDir, "avatar.jpg"), []byte{0xFF, 0xD8, 0xFF, 0xE0}, 0o640)

	st, err := store.Open(filepath.Join(tmpDir, "app.db"))
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	defer st.Close()

	avDir := filepath.Join(tmpDir, "avatars")
	res, err := ImportIntoStore(context.Background(), st, ImportOptions{
		ExportDir:     exportDir,
		Email:         "creator@example.com",
		PasswordIfNew: "CreatorPass123",
		AvatarDestDir: avDir,
	})
	if err != nil {
		t.Fatalf("ImportIntoStore failed: %v", err)
	}

	if !res.CreatedUser || res.WorldCount != 1 || res.OrgCount != 1 || res.CharCount != 1 || res.SharesImport != 1 {
		t.Fatalf("unexpected import result: %+v", res)
	}

	// Verify user profile and doc in SQLite
	u, err := st.GetUserByEmail(context.Background(), "creator@example.com")
	if err != nil || u.Nickname != "星海造物主" || u.Bio != "世界观设定控" {
		t.Fatalf("unexpected user profile: %+v err=%v", u, err)
	}
	doc, err := st.GetDoc(context.Background(), u.ID)
	if err != nil || doc == nil || doc.Rev != 1 {
		t.Fatalf("expected doc rev=1, got %+v err=%v", doc, err)
	}
	revs, err := st.ListRevisions(context.Background(), u.ID)
	if err != nil || len(revs) != 1 {
		t.Fatalf("expected 1 initial revision, got %d", len(revs))
	}

	// Re-run import to verify idempotency
	res2, err := ImportIntoStore(context.Background(), st, ImportOptions{
		ExportDir:     exportDir,
		Email:         "creator@example.com",
		AvatarDestDir: avDir,
	})
	if err != nil || res2.CreatedUser || res2.DocRev != 2 {
		t.Fatalf("expected idempotent second import with rev=2, got %+v err=%v", res2, err)
	}
}
