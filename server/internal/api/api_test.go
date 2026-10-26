package api

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"image"
	"image/color"
	"image/png"
	"io"
	"mime/multipart"
	"net"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

	"creator/server/internal/config"
	"creator/server/internal/legacy"
	"creator/server/internal/store"
)

func setupTestServer(t *testing.T, regMode config.RegisterMode) (*httptest.Server, *store.Store, *config.Config) {
	t.Helper()
	tmpDir := t.TempDir()
	cfg := &config.Config{
		ListenAddr:   "127.0.0.1:0",
		DataDir:      tmpDir,
		DBPath:       filepath.Join(tmpDir, "test.db"),
		AvatarDir:    filepath.Join(tmpDir, "avatars"),
		ServeStatic:  false,
		RegisterMode: regMode,
		SecureCookie: false,
		SecretKey:    "test-secret-key-999",
	}
	st, err := store.Open(cfg.DBPath)
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	t.Cleanup(func() { _ = st.Close() })

	srv := httptest.NewServer(NewServer(cfg, st))
	t.Cleanup(srv.Close)
	return srv, st, cfg
}

func doJSONRequest(t *testing.T, client *http.Client, method, url string, body interface{}, cookie *http.Cookie, customOrigin string) (*http.Response, map[string]interface{}) {
	t.Helper()
	var rBody *bytes.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		rBody = bytes.NewReader(b)
	} else {
		rBody = bytes.NewReader(nil)
	}
	req, err := http.NewRequest(method, url, rBody)
	if err != nil {
		t.Fatalf("new req: %v", err)
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if cookie != nil {
		req.AddCookie(cookie)
	}
	if customOrigin != "" {
		req.Header.Set("Origin", customOrigin)
	}
	resp, err := client.Do(req)
	if err != nil {
		t.Fatalf("do req: %v", err)
	}
	defer resp.Body.Close()

	var parsed map[string]interface{}
	_ = json.NewDecoder(resp.Body).Decode(&parsed)
	return resp, parsed
}

func findSessionCookie(resp *http.Response) *http.Cookie {
	for _, c := range resp.Cookies() {
		if c.Name == "creator_sid" && c.Value != "" {
			return c
		}
	}
	return nil
}

func TestAuthOpenInviteClosedAndSecurity(t *testing.T) {
	// 1. Test OPEN mode + weak password rejection + login brute-force lockout + CSRF protection
	srv, _, _ := setupTestServer(t, config.RegisterModeOpen)
	client := srv.Client()

	// Weak password (< 8 or no digits)
	resp, _ := doJSONRequest(t, client, http.MethodPost, srv.URL+"/api/auth/register", withChallenge(t, client, srv.URL, map[string]string{"email": "alice@example.com", "password": "short"}), nil, "")
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("expected 400 for weak password, got %d", resp.StatusCode)
	}

	// Valid registration
	resp, _ = doJSONRequest(t, client, http.MethodPost, srv.URL+"/api/auth/register", withChallenge(t, client, srv.URL, map[string]string{"email": "alice@example.com", "password": "AlicePass123"}), nil, "")
	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("expected 201 for valid registration, got %d", resp.StatusCode)
	}
	aliceCookie := findSessionCookie(resp)
	if aliceCookie == nil {
		t.Fatalf("expected session cookie on register")
	}

	// CSRF cross-origin rejection
	resp, _ = doJSONRequest(t, client, http.MethodPatch, srv.URL+"/api/me", map[string]string{
		"name": "Hacker",
	}, aliceCookie, "https://evil-attacker.example.com")
	if resp.StatusCode != http.StatusForbidden {
		t.Fatalf("expected 403 for cross-origin CSRF request, got %d", resp.StatusCode)
	}

	// Brute-force login lockout after 5 wrong attempts
	for i := 0; i < 5; i++ {
		r, _ := doJSONRequest(t, client, http.MethodPost, srv.URL+"/api/auth/login", map[string]string{
			"email":    "alice@example.com",
			"password": "WrongPassword999",
		}, nil, "")
		if r.StatusCode != http.StatusUnauthorized {
			t.Fatalf("attempt %d: expected 401, got %d", i+1, r.StatusCode)
		}
	}
	// 6th attempt even with right password should be locked (429)
	resp, _ = doJSONRequest(t, client, http.MethodPost, srv.URL+"/api/auth/login", map[string]string{
		"email":    "alice@example.com",
		"password": "AlicePass123",
	}, nil, "")
	if resp.StatusCode != http.StatusTooManyRequests {
		t.Fatalf("expected 429 lockout on 6th attempt, got %d", resp.StatusCode)
	}

	// 2. Test INVITE mode
	srvInv, stInv, _ := setupTestServer(t, config.RegisterModeInvite)
	codes, err := stInv.CreateInvites(context.Background(), 1, 1)
	if err != nil || len(codes) != 1 {
		t.Fatalf("create invite: %v", err)
	}
	// Without invite -> 400
	resp, _ = doJSONRequest(t, srvInv.Client(), http.MethodPost, srvInv.URL+"/api/auth/register", withChallenge(t, srvInv.Client(), srvInv.URL, map[string]string{"email": "bob@example.com", "password": "BobPassword123"}), nil, "")
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("expected 400 without invite, got %d", resp.StatusCode)
	}
	// With invite -> 201
	resp, _ = doJSONRequest(t, srvInv.Client(), http.MethodPost, srvInv.URL+"/api/auth/register", withChallenge(t, srvInv.Client(), srvInv.URL, map[string]string{
		"email":      "bob@example.com",
		"password":   "BobPassword123",
		"inviteCode": codes[0],
	}), nil, "")
	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("expected 201 with valid invite, got %d", resp.StatusCode)
	}
}

func TestSyncOptimisticLockAndRevisions(t *testing.T) {
	srv, _, _ := setupTestServer(t, config.RegisterModeOpen)
	client := srv.Client()

	resp, _ := doJSONRequest(t, client, http.MethodPost, srv.URL+"/api/auth/register", withChallenge(t, client, srv.URL, map[string]string{"email": "sync@example.com", "password": "SyncPassword123"}), nil, "")
	cookie := findSessionCookie(resp)

	// 1. Initial GET /api/sync -> 204 No Content
	resp, _ = doJSONRequest(t, client, http.MethodGet, srv.URL+"/api/sync", nil, cookie, "")
	if resp.StatusCode != http.StatusNoContent {
		t.Fatalf("expected 204 for empty doc, got %d", resp.StatusCode)
	}

	// 2. First PUT with baseRev=0 -> rev=1
	docV6 := map[string]interface{}{
		"_version":  6,
		"worlds":    map[string]interface{}{"w1": map[string]interface{}{"id": "w1", "name": "World 1"}},
		"orgs":      map[string]interface{}{},
		"chars":     map[string]interface{}{},
		"templates": map[string]interface{}{},
		"timeline":  []interface{}{},
		"plots":     []interface{}{},
		"scenes":    []interface{}{},
		"glossary":  []interface{}{},
		"stats":     []interface{}{},
		"ui":        map[string]interface{}{"activeW": "w1"},
	}
	resp, body := doJSONRequest(t, client, http.MethodPut, srv.URL+"/api/sync", map[string]interface{}{
		"baseRev": 0,
		"data":    docV6,
	}, cookie, "")
	if resp.StatusCode != http.StatusOK || int(body["rev"].(float64)) != 1 {
		t.Fatalf("expected 200 rev=1, got status=%d body=%v", resp.StatusCode, body)
	}

	// 3. Second PUT with baseRev=1 -> rev=2
	docV6["worlds"].(map[string]interface{})["w2"] = map[string]interface{}{"id": "w2", "name": "World 2"}
	resp, body = doJSONRequest(t, client, http.MethodPut, srv.URL+"/api/sync", map[string]interface{}{
		"baseRev": 1,
		"data":    docV6,
	}, cookie, "")
	if resp.StatusCode != http.StatusOK || int(body["rev"].(float64)) != 2 {
		t.Fatalf("expected 200 rev=2, got status=%d body=%v", resp.StatusCode, body)
	}

	// 4. Stale PUT with baseRev=1 -> 409 Conflict with serverRev=2 and serverData attached
	resp, body = doJSONRequest(t, client, http.MethodPut, srv.URL+"/api/sync", map[string]interface{}{
		"baseRev": 1,
		"data":    docV6,
	}, cookie, "")
	if resp.StatusCode != http.StatusConflict {
		t.Fatalf("expected 409 Conflict for stale baseRev, got %d", resp.StatusCode)
	}
	if int(body["serverRev"].(float64)) != 2 || body["serverData"] == nil {
		t.Fatalf("expected serverRev=2 and serverData in 409 response, got %v", body)
	}

	// 5. Check revisions list
	resp, body = doJSONRequest(t, client, http.MethodGet, srv.URL+"/api/sync/revisions", nil, cookie, "")
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 on revisions list, got %d", resp.StatusCode)
	}
	revs := body["revisions"].([]interface{})
	if len(revs) != 1 {
		t.Fatalf("expected 1 throttled revision snapshot within 10m window, got %d", len(revs))
	}
	revID := int64(revs[0].(map[string]interface{})["id"].(float64))
	resp, _ = doJSONRequest(t, client, http.MethodGet, fmt.Sprintf("%s/api/sync/revisions/%d", srv.URL, revID), nil, cookie, "")
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 for revision detail, got %d", resp.StatusCode)
	}
}

func TestAvatarUploadSharesAndBackup(t *testing.T) {
	srv, st, cfg := setupTestServer(t, config.RegisterModeOpen)
	client := srv.Client()

	respA, _ := doJSONRequest(t, client, http.MethodPost, srv.URL+"/api/auth/register", withChallenge(t, client, srv.URL, map[string]string{"email": "authorA@example.com", "password": "PasswordA123"}), nil, "")
	cookieA := findSessionCookie(respA)

	respB, _ := doJSONRequest(t, client, http.MethodPost, srv.URL+"/api/auth/register", withChallenge(t, client, srv.URL, map[string]string{"email": "authorB@example.com", "password": "PasswordB123"}), nil, "")
	cookieB := findSessionCookie(respB)

	// 1. Upload invalid non-image bytes -> 400
	var badBuf bytes.Buffer
	mwBad := multipart.NewWriter(&badBuf)
	fwBad, _ := mwBad.CreateFormFile("avatar", "evil.php")
	_, _ = fwBad.Write([]byte("<?php echo 'hacked'; ?>"))
	_ = mwBad.Close()
	reqBad, _ := http.NewRequest(http.MethodPost, srv.URL+"/api/me/avatar", &badBuf)
	reqBad.Header.Set("Content-Type", mwBad.FormDataContentType())
	reqBad.AddCookie(cookieA)
	resBad, _ := client.Do(reqBad)
	resBad.Body.Close()
	if resBad.StatusCode != http.StatusBadRequest {
		t.Fatalf("expected 400 for non-image magic bytes, got %d", resBad.StatusCode)
	}

	// 2. Upload valid PNG -> converted to JPEG 200
	img := image.NewRGBA(image.Rect(0, 0, 32, 32))
	img.Set(5, 5, color.RGBA{R: 99, G: 102, B: 241, A: 255})
	var pngBytes bytes.Buffer
	_ = png.Encode(&pngBytes, img)

	var goodBuf bytes.Buffer
	mwGood := multipart.NewWriter(&goodBuf)
	fwGood, _ := mwGood.CreateFormFile("avatar", "avatar.png")
	_, _ = fwGood.Write(pngBytes.Bytes())
	_ = mwGood.Close()
	reqGood, _ := http.NewRequest(http.MethodPost, srv.URL+"/api/me/avatar", &goodBuf)
	reqGood.Header.Set("Content-Type", mwGood.FormDataContentType())
	reqGood.AddCookie(cookieA)
	resGood, _ := client.Do(reqGood)
	var avBody map[string]interface{}
	_ = json.NewDecoder(resGood.Body).Decode(&avBody)
	resGood.Body.Close()
	if resGood.StatusCode != http.StatusOK || !strings.HasPrefix(avBody["avatar"].(string), "/avatars/u_") {
		t.Fatalf("expected 200 and /avatars/u_ url, got status=%d body=%v", resGood.StatusCode, avBody)
	}

	// 3. Create share as User A
	respShare, shBody := doJSONRequest(t, client, http.MethodPost, srv.URL+"/api/shares", map[string]string{
		"kind":    "world",
		"title":   "艾瑟兰编年史",
		"summary": "魔法消退纪元",
		"content": "详细世界观正文",
	}, cookieA, "")
	if respShare.StatusCode != http.StatusCreated {
		t.Fatalf("create share failed: %d", respShare.StatusCode)
	}
	shareID := shBody["share"].(map[string]interface{})["id"].(string)

	// 4. User B cannot delete User A's share (403)
	respDelB, _ := doJSONRequest(t, client, http.MethodDelete, srv.URL+"/api/shares/"+shareID, nil, cookieB, "")
	if respDelB.StatusCode != http.StatusForbidden {
		t.Fatalf("expected 403 when user B deletes user A share, got %d", respDelB.StatusCode)
	}

	// 5. Filter `?owner=me` for User B returns 0 shares, for User A returns 1 share
	_, listB := doJSONRequest(t, client, http.MethodGet, srv.URL+"/api/shares?owner=me", nil, cookieB, "")
	if len(listB["shares"].([]interface{})) != 0 {
		t.Fatalf("expected 0 own shares for user B")
	}
	_, listA := doJSONRequest(t, client, http.MethodGet, srv.URL+"/api/shares?owner=me", nil, cookieA, "")
	if len(listA["shares"].([]interface{})) != 1 {
		t.Fatalf("expected 1 own share for user A")
	}

	// 6. User A deletes own share -> 200
	respDelA, _ := doJSONRequest(t, client, http.MethodDelete, srv.URL+"/api/shares/"+shareID, nil, cookieA, "")
	if respDelA.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 when author deletes share, got %d", respDelA.StatusCode)
	}

	// 7. Test online SQLite VACUUM INTO backup archive
	archivePath, err := st.BackupToArchive(context.Background(), cfg.AvatarDir, filepath.Join(t.TempDir(), "backups"), 14)
	if err != nil || archivePath == "" {
		t.Fatalf("BackupToArchive failed: %v", err)
	}

	// 8. Test Legacy Import into store (T12)
	_, wCnt, oCnt, cCnt, err := legacy.UpgradeRawJSONToV6([]byte(`{"version":5.3,"worlds":{"w1":{"name":"W"}},"orgs":{},"chars":{"c1":{"name":"C"}}}`))
	if err != nil || wCnt != 1 || oCnt != 0 || cCnt != 1 {
		t.Fatalf("UpgradeRawJSONToV6 failed: err=%v w=%d o=%d c=%d", err, wCnt, oCnt, cCnt)
	}
}

func TestAIStatusAndAnonymousLobbyAndVisibility(t *testing.T) {
	srv, _, cfg := setupTestServer(t, config.RegisterModeOpen)
	cfg.OpenRouterAPIKey = "sk-test-fake-key"
	client := &http.Client{Timeout: 5 * time.Second}

	// 1. Check AI status
	respStatus, stBody := doJSONRequest(t, client, http.MethodGet, srv.URL+"/api/ai/status", nil, nil, "")
	if respStatus.StatusCode != http.StatusOK {
		t.Fatalf("ai status failed: %d", respStatus.StatusCode)
	}
	if stBody["publicReady"] != true {
		t.Fatalf("expected publicReady to be true")
	}

	// 2. Check anonymous access to global stats and lobby users
	respGlob, globBody := doJSONRequest(t, client, http.MethodGet, srv.URL+"/api/stats/global", nil, nil, "")
	if respGlob.StatusCode != http.StatusOK {
		t.Fatalf("global stats failed: %d", respGlob.StatusCode)
	}
	if _, ok := globBody["kindCounts"]; !ok {
		t.Fatalf("missing kindCounts in global stats")
	}

	respLobby, _ := doJSONRequest(t, client, http.MethodGet, srv.URL+"/api/lobby/users", nil, nil, "")
	if respLobby.StatusCode != http.StatusOK {
		t.Fatalf("anonymous lobby users failed: %d", respLobby.StatusCode)
	}

	// 3. Register a user and publish a private article and a public world share
	respReg, _ := doJSONRequest(t, client, http.MethodPost, srv.URL+"/api/auth/register", withChallenge(t, client, srv.URL, map[string]string{"email": "author_ai@example.com", "password": "Password123"}), nil, "")
	if respReg.StatusCode != http.StatusCreated {
		t.Fatalf("register failed: %d", respReg.StatusCode)
	}
	cookieA := findSessionCookie(respReg)
	if cookieA == nil {
		t.Fatalf("missing session cookie")
	}

	// 3a. Save encrypted AI config
	respCfgPut, _ := doJSONRequest(t, client, http.MethodPut, srv.URL+"/api/me/ai-config", map[string]interface{}{
		"customAi": map[string]string{
			"provider": "deepseek",
			"baseUrl":  "https://api.deepseek.com/v1",
			"apiKey":   "sk-deepseek-secret-123",
			"model":    "deepseek-chat",
		},
		"preferences": map[string]string{
			"preferredGenre": "科幻赛博",
			"writingTone":    "细腻冷峻",
		},
	}, cookieA, "")
	if respCfgPut.StatusCode != http.StatusOK {
		t.Fatalf("save ai config failed: %d", respCfgPut.StatusCode)
	}

	respCfgGet, getCfgBody := doJSONRequest(t, client, http.MethodGet, srv.URL+"/api/me/ai-config", nil, cookieA, "")
	if respCfgGet.StatusCode != http.StatusOK {
		t.Fatalf("get ai config failed: %d", respCfgGet.StatusCode)
	}
	customAI := getCfgBody["customAi"].(map[string]interface{})
	if customAI["hasKey"] != true || customAI["apiKey"] != nil {
		t.Fatalf("expected hasKey=true and no raw apiKey in response, got %v", customAI)
	}

	// 3b. Publish a private article
	_, artBody := doJSONRequest(t, client, http.MethodPost, srv.URL+"/api/shares", map[string]interface{}{
		"kind":       "article",
		"title":      "私有小说第一章",
		"summary":    "不公开测试",
		"content":    "小说正文内容...",
		"visibility": "private",
	}, cookieA, "")
	artID := artBody["share"].(map[string]interface{})["id"].(string)

	// 3c. Publish a public world
	_, worldBody := doJSONRequest(t, client, http.MethodPost, srv.URL+"/api/shares", map[string]interface{}{
		"kind":       "world",
		"title":      "公开星渊世界",
		"summary":    "全站可见",
		"content":    "公开世界观正文...",
		"visibility": "public",
	}, cookieA, "")
	worldID := worldBody["share"].(map[string]interface{})["id"].(string)

	// 4. Anonymous GET /api/shares should return public world but NOT private article
	_, anonShares := doJSONRequest(t, client, http.MethodGet, srv.URL+"/api/shares", nil, nil, "")
	items := anonShares["shares"].([]interface{})
	var foundPrivate, foundPublic bool
	for _, it := range items {
		m := it.(map[string]interface{})
		if m["id"] == artID {
			foundPrivate = true
		}
		if m["id"] == worldID {
			foundPublic = true
		}
	}
	if foundPrivate {
		t.Fatalf("anonymous user should NOT see private article")
	}
	if !foundPublic {
		t.Fatalf("anonymous user should see public world")
	}

	// 5. Author updates article visibility from 'private' to 'public'
	respPatch, _ := doJSONRequest(t, client, http.MethodPatch, srv.URL+"/api/shares/"+artID, map[string]interface{}{
		"visibility": "public",
	}, cookieA, "")
	if respPatch.StatusCode != http.StatusOK {
		t.Fatalf("patch share visibility failed: %d", respPatch.StatusCode)
	}

	// Now anonymous user can see the article
	_, anonShares2 := doJSONRequest(t, client, http.MethodGet, srv.URL+"/api/shares?kind=article", nil, nil, "")
	items2 := anonShares2["shares"].([]interface{})
	if len(items2) != 1 {
		t.Fatalf("expected 1 public article, got %d", len(items2))
	}
}

func TestV66CocreationDiscussionsAndAdmin(t *testing.T) {
	srv, st, _ := setupTestServer(t, config.RegisterModeOpen)
	client := srv.Client()

	// 1. Register the site owner and promote via the store (what SUPER_ADMIN_EMAIL / CLI do), plus a regular creator
	respAdmin, bodyAdmin := doJSONRequest(t, client, http.MethodPost, srv.URL+"/api/auth/register", withChallenge(t, client, srv.URL, map[string]string{"email": "owner@creator.local", "password": "Password123"}), nil, "")
	if respAdmin.StatusCode != http.StatusCreated {
		t.Fatalf("register owner failed: %d %v", respAdmin.StatusCode, bodyAdmin)
	}
	if err := st.SetUserSuperAdmin(context.Background(), "owner@creator.local", true); err != nil {
		t.Fatalf("promote super admin: %v", err)
	}
	var cookieAdmin *http.Cookie
	if len(respAdmin.Cookies()) > 0 {
		cookieAdmin = respAdmin.Cookies()[0]
	}

	respCreator, bodyCreator := doJSONRequest(t, client, http.MethodPost, srv.URL+"/api/auth/register", withChallenge(t, client, srv.URL, map[string]string{"email": "creator1@example.com", "password": "Password123"}), nil, "")
	if respCreator.StatusCode != http.StatusCreated {
		t.Fatalf("register creator1 failed: %d %v", respCreator.StatusCode, bodyCreator)
	}
	var cookieCreator *http.Cookie
	if len(respCreator.Cookies()) > 0 {
		cookieCreator = respCreator.Cookies()[0]
	}
	creatorUser := bodyCreator["user"].(map[string]interface{})
	creatorID := int64(creatorUser["id"].(float64))

	// 2. Test Anime Paint Endpoint
	respPaint, bodyPaint := doJSONRequest(t, client, http.MethodPost, srv.URL+"/api/ai/paint", map[string]interface{}{
		"prompt":      "银发蓝眸少女，星轨测绘法师",
		"style":       "makoto_shinkai",
		"aspectRatio": "1:1",
		"charName":    "林汐",
	}, cookieCreator, "")
	if respPaint.StatusCode != http.StatusOK {
		t.Fatalf("anime paint failed: %d %v", respPaint.StatusCode, bodyPaint)
	}
	if bodyPaint["imageUrl"] == nil || bodyPaint["imageUrl"] == "" {
		t.Fatalf("expected non-empty imageUrl in anime paint response")
	}

	// 3. Creator publishes a public world setting
	respShare, bodyShare := doJSONRequest(t, client, http.MethodPost, srv.URL+"/api/shares", map[string]interface{}{
		"kind":        "world",
		"title":       "星界巨塔",
		"summary":     "浮空群岛中央的古代灯塔",
		"content":     "黑曜石垒砌的高塔，塔顶旋转着白色星云。",
		"visibility":  "public",
		"canonStatus": "canon",
	}, cookieCreator, "")
	if respShare.StatusCode != http.StatusCreated {
		t.Fatalf("create share failed: %d %v", respShare.StatusCode, bodyShare)
	}
	shareObj := bodyShare["share"].(map[string]interface{})
	shareID := shareObj["id"].(string)

	// 4. Site owner posts a comment on the share
	respComment, bodyComment := doJSONRequest(t, client, http.MethodPost, srv.URL+"/api/shares/"+shareID+"/comments", map[string]interface{}{
		"content": "设定非常惊艳，期待后续展开！",
	}, cookieAdmin, "")
	if respComment.StatusCode != http.StatusCreated {
		t.Fatalf("post comment failed: %d %v", respComment.StatusCode, bodyComment)
	}
	commentObj := bodyComment["comment"].(map[string]interface{})
	commentID := int64(commentObj["id"].(float64))

	// Creator should now have a notification
	time.Sleep(50 * time.Millisecond)
	respNotif, bodyNotif := doJSONRequest(t, client, http.MethodGet, srv.URL+"/api/notifications", nil, cookieCreator, "")
	if respNotif.StatusCode != http.StatusOK {
		t.Fatalf("get notifications failed: %d", respNotif.StatusCode)
	}
	notifs := bodyNotif["notifications"].([]interface{})
	if len(notifs) == 0 {
		t.Fatalf("expected at least 1 notification, got 0")
	}

	// 5. Creator likes the owner's comment
	respLike, bodyLike := doJSONRequest(t, client, http.MethodPost, srv.URL+"/api/comments/"+strconv.FormatInt(commentID, 10)+"/like", nil, cookieCreator, "")
	if respLike.StatusCode != http.StatusOK {
		t.Fatalf("like comment failed: %d %v", respLike.StatusCode, bodyLike)
	}
	if bodyLike["liked"] != true {
		t.Fatalf("expected liked=true")
	}

	// 6. Test Co-creation project initiation
	respProj, bodyProj := doJSONRequest(t, client, http.MethodPost, srv.URL+"/api/cocreation/projects", map[string]interface{}{
		"worldId":    shareID,
		"worldTitle": "星界巨塔",
		"summary":    "官方与同人共创世界观企划",
		"admins":     []string{"owner@creator.local"},
	}, cookieCreator, "")
	if respProj.StatusCode != http.StatusCreated {
		t.Fatalf("create cocreation project failed: %d %v", respProj.StatusCode, bodyProj)
	}
	projObj := bodyProj["project"].(map[string]interface{})
	projID := projObj["id"].(string)

	// 7. Super admin manages roles: promotes creator to admin
	respRole, _ := doJSONRequest(t, client, http.MethodPut, srv.URL+"/api/admin/users/"+strconv.FormatInt(creatorID, 10)+"/role", map[string]interface{}{
		"isAdmin": true,
	}, cookieAdmin, "")
	if respRole.StatusCode != http.StatusOK {
		t.Fatalf("super admin set admin role failed: %d", respRole.StatusCode)
	}

	// Verify creator is now admin in /api/admin/users
	_, bodyUsers := doJSONRequest(t, client, http.MethodGet, srv.URL+"/api/admin/users", nil, cookieAdmin, "")
	usersList := bodyUsers["users"].([]interface{})
	var foundCreator map[string]interface{}
	for _, u := range usersList {
		umap := u.(map[string]interface{})
		if int64(umap["id"].(float64)) == creatorID {
			foundCreator = umap
			break
		}
	}
	if foundCreator == nil || foundCreator["isAdmin"] != true {
		t.Fatalf("expected creator to be admin, got %v", foundCreator)
	}

	// 8. Test Canonization workflow with a third user (a fan who is NOT part of the project)
	respFan, bodyFan := doJSONRequest(t, client, http.MethodPost, srv.URL+"/api/auth/register", withChallenge(t, client, srv.URL, map[string]string{"email": "fan@example.com", "password": "Password123"}), nil, "")
	if respFan.StatusCode != http.StatusCreated {
		t.Fatalf("register fan failed: %d %v", respFan.StatusCode, bodyFan)
	}
	cookieFan := respFan.Cookies()[0]

	// The fan tries to declare the share canon; the server must downgrade it to doujin.
	respDoujin, bodyDoujin := doJSONRequest(t, client, http.MethodPost, srv.URL+"/api/shares", map[string]interface{}{
		"kind":         "char",
		"title":        "塔之守护者 · 阿尔温",
		"summary":      "星界巨塔守卫队长（同人衍生）",
		"content":      "守护高塔百年的机械人偶骑士",
		"visibility":   "public",
		"canonStatus":  "canon",
		"cocreationId": projID,
	}, cookieFan, "")
	if respDoujin.StatusCode != http.StatusCreated {
		t.Fatalf("create doujin failed: %d %v", respDoujin.StatusCode, bodyDoujin)
	}
	doujinObj := bodyDoujin["share"].(map[string]interface{})
	doujinID := doujinObj["id"].(string)
	if doujinObj["canonStatus"] != "doujin" {
		t.Fatalf("expected server to force doujin for non-member, got %v", doujinObj["canonStatus"])
	}

	// The project owner publishing inside their own project is canon directly.
	_, bodyOwnerShare := doJSONRequest(t, client, http.MethodPost, srv.URL+"/api/shares", map[string]interface{}{
		"kind": "org", "title": "巨塔守卫队", "content": "官方设定", "visibility": "public", "cocreationId": projID,
	}, cookieCreator, "")
	if bodyOwnerShare["share"].(map[string]interface{})["canonStatus"] != "canon" {
		t.Fatalf("expected owner share to be canon")
	}

	// Request canonization
	respReqCanon, _ := doJSONRequest(t, client, http.MethodPost, srv.URL+"/api/cocreation/shares/"+doujinID+"/request-canon", nil, cookieFan, "")
	if respReqCanon.StatusCode != http.StatusOK {
		t.Fatalf("request canon failed: %d", respReqCanon.StatusCode)
	}

	// The fan cannot approve their own request
	respSelfApprove, _ := doJSONRequest(t, client, http.MethodPost, srv.URL+"/api/cocreation/shares/"+doujinID+"/approve-canon", nil, cookieFan, "")
	if respSelfApprove.StatusCode != http.StatusForbidden {
		t.Fatalf("expected 403 for self-approval, got %d", respSelfApprove.StatusCode)
	}

	// Project owner approves canonization
	respApproveCanon, _ := doJSONRequest(t, client, http.MethodPost, srv.URL+"/api/cocreation/shares/"+doujinID+"/approve-canon", nil, cookieCreator, "")
	if respApproveCanon.StatusCode != http.StatusOK {
		t.Fatalf("approve canon failed: %d", respApproveCanon.StatusCode)
	}

	// Re-publishing the share (same id) must NOT reset the review state
	_, bodyRepub := doJSONRequest(t, client, http.MethodPost, srv.URL+"/api/shares", map[string]interface{}{
		"id": doujinID, "kind": "char", "title": "塔之守护者 · 阿尔温（修订）", "content": "修订版", "visibility": "public", "cocreationId": projID,
	}, cookieFan, "")
	if bodyRepub["share"].(map[string]interface{})["canonStatus"] != "canon" {
		t.Fatalf("expected canon state preserved on re-publish, got %v", bodyRepub["share"])
	}

	// Verify share is now canon
	_, bodyShareCheck := doJSONRequest(t, client, http.MethodGet, srv.URL+"/api/shares/"+doujinID, nil, nil, "")
	shCheck := bodyShareCheck["share"].(map[string]interface{})
	if shCheck["canonStatus"] != "canon" {
		t.Fatalf("expected canonStatus to be 'canon', got %v", shCheck["canonStatus"])
	}
}

func registerUser(t *testing.T, srv *httptest.Server, email string) (*http.Cookie, int64) {
	t.Helper()
	resp, body := doJSONRequest(t, srv.Client(), http.MethodPost, srv.URL+"/api/auth/register", withChallenge(t, srv.Client(), srv.URL, map[string]string{
		"email":    email,
		"password": "Password123",
	}), nil, "")
	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("register %s failed: %d %v", email, resp.StatusCode, body)
	}
	id := int64(body["user"].(map[string]interface{})["id"].(float64))
	return resp.Cookies()[0], id
}

func TestNoNicknameEscalation(t *testing.T) {
	srv, _, _ := setupTestServer(t, config.RegisterModeOpen)
	client := srv.Client()
	// First registered user (id=1) must NOT be auto-admin, and the magic nickname must do nothing.
	cookieA, _ := registerUser(t, srv, "markzm@evil.example")
	_, me := doJSONRequest(t, client, http.MethodGet, srv.URL+"/api/me", nil, cookieA, "")
	u := me["user"].(map[string]interface{})
	if u["isAdmin"] == true || u["isSuperAdmin"] == true {
		t.Fatalf("expected no admin flags for first user / markzm-like email, got %v", u)
	}
	resp, _ := doJSONRequest(t, client, http.MethodPatch, srv.URL+"/api/me", map[string]string{"name": "markzm"}, cookieA, "")
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("patch name: %d", resp.StatusCode)
	}
	_, me2 := doJSONRequest(t, client, http.MethodGet, srv.URL+"/api/me", nil, cookieA, "")
	u2 := me2["user"].(map[string]interface{})
	if u2["isAdmin"] == true || u2["isSuperAdmin"] == true {
		t.Fatalf("nickname 'markzm' must not grant admin, got %v", u2)
	}
	_, idB := registerUser(t, srv, "b@example.com")
	respRole, _ := doJSONRequest(t, client, http.MethodPut, srv.URL+"/api/admin/users/"+strconv.FormatInt(idB, 10)+"/role", map[string]bool{"isAdmin": true}, cookieA, "")
	if respRole.StatusCode != http.StatusForbidden {
		t.Fatalf("expected 403 for role change by non-admin, got %d", respRole.StatusCode)
	}
}

func TestShareOwnershipGuard(t *testing.T) {
	srv, _, _ := setupTestServer(t, config.RegisterModeOpen)
	client := srv.Client()
	cookieA, _ := registerUser(t, srv, "a@example.com")
	cookieB, _ := registerUser(t, srv, "b2@example.com")

	_, bodyA := doJSONRequest(t, client, http.MethodPost, srv.URL+"/api/shares", map[string]interface{}{
		"kind": "world", "title": "A 的世界", "content": "原文", "visibility": "public",
	}, cookieA, "")
	shareID := bodyA["share"].(map[string]interface{})["id"].(string)

	respB, _ := doJSONRequest(t, client, http.MethodPost, srv.URL+"/api/shares", map[string]interface{}{
		"id": shareID, "kind": "world", "title": "被篡改", "content": "恶意内容", "visibility": "private",
	}, cookieB, "")
	if respB.StatusCode != http.StatusForbidden {
		t.Fatalf("expected 403 when overwriting another user's share, got %d", respB.StatusCode)
	}
	_, detail := doJSONRequest(t, client, http.MethodGet, srv.URL+"/api/shares/"+shareID, nil, nil, "")
	sh := detail["share"].(map[string]interface{})
	if sh["title"] != "A 的世界" || sh["visibility"] != "public" {
		t.Fatalf("share was modified by a non-owner: %v", sh)
	}

	respA, _ := doJSONRequest(t, client, http.MethodPost, srv.URL+"/api/shares", map[string]interface{}{
		"id": shareID, "kind": "world", "title": "A 的世界 v2", "content": "修订", "visibility": "public",
	}, cookieA, "")
	if respA.StatusCode != http.StatusCreated {
		t.Fatalf("owner re-publish should succeed, got %d", respA.StatusCode)
	}
}

func TestAIEndpointsRequireAuthAndRejectPrivateHosts(t *testing.T) {
	srv, _, _ := setupTestServer(t, config.RegisterModeOpen)
	client := srv.Client()

	for _, path := range []string{"/api/ai/generate", "/api/ai/paint", "/api/ai/test"} {
		resp, _ := doJSONRequest(t, client, http.MethodPost, srv.URL+path, map[string]interface{}{"prompt": "x"}, nil, "")
		if resp.StatusCode != http.StatusUnauthorized {
			t.Fatalf("%s: expected 401 for anonymous call, got %d", path, resp.StatusCode)
		}
	}

	cookie, _ := registerUser(t, srv, "ai@example.com")
	for _, bad := range []string{"http://169.254.169.254/latest", "https://127.0.0.1:8080/v1", "https://localhost/v1", "https://evil.example.com/v1", "https://user:pw@api.deepseek.com/v1"} {
		resp, body := doJSONRequest(t, client, http.MethodPost, srv.URL+"/api/ai/generate", map[string]interface{}{
			"task": "field_gen", "fieldLabel": "性格",
			"customAi": map[string]string{"provider": "custom", "baseUrl": bad, "apiKey": "sk-x", "model": "m"},
		}, cookie, "")
		if resp.StatusCode != http.StatusBadRequest {
			t.Fatalf("generate with baseUrl %s: expected 400, got %d %v", bad, resp.StatusCode, body)
		}
		respT, _ := doJSONRequest(t, client, http.MethodPost, srv.URL+"/api/ai/test", map[string]string{
			"provider": "custom", "baseUrl": bad, "apiKey": "sk-x", "model": "m",
		}, cookie, "")
		if respT.StatusCode != http.StatusBadRequest {
			t.Fatalf("test with baseUrl %s: expected 400, got %d", bad, respT.StatusCode)
		}
	}
}

func TestCreatorProfileListsPublicShares(t *testing.T) {
	srv, _, _ := setupTestServer(t, config.RegisterModeOpen)
	client := srv.Client()
	cookie, uid := registerUser(t, srv, "profile@example.com")
	doJSONRequest(t, client, http.MethodPost, srv.URL+"/api/shares", map[string]interface{}{
		"kind": "char", "title": "公开角色", "content": "x", "visibility": "public",
	}, cookie, "")
	doJSONRequest(t, client, http.MethodPost, srv.URL+"/api/shares", map[string]interface{}{
		"kind": "char", "title": "私密角色", "content": "y", "visibility": "private",
	}, cookie, "")
	resp, body := doJSONRequest(t, client, http.MethodGet, srv.URL+"/api/lobby/creator-profile?user_id="+strconv.FormatInt(uid, 10), nil, nil, "")
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("profile: %d %v", resp.StatusCode, body)
	}
	shares, _ := body["publishedShares"].([]interface{})
	if len(shares) != 1 {
		t.Fatalf("expected exactly 1 public share in profile, got %d (%v)", len(shares), body["publishedShares"])
	}
	if shares[0].(map[string]interface{})["title"] != "公开角色" {
		t.Fatalf("unexpected share in profile: %v", shares[0])
	}
}

// withChallenge fetches the arithmetic registration challenge, solves it and adds the answer to a
// registration payload (open registration requires it).
func withChallenge(t *testing.T, client *http.Client, baseURL string, payload map[string]string) map[string]string {
	t.Helper()
	_, ch := doJSONRequest(t, client, http.MethodGet, baseURL+"/api/auth/challenge", nil, nil, "")
	q, _ := ch["question"].(string)
	tok, _ := ch["token"].(string)
	var a, b int
	if _, err := fmt.Sscanf(q, "%d + %d = ?", &a, &b); err != nil {
		t.Fatalf("unexpected challenge question %q", q)
	}
	out := map[string]string{"challengeToken": tok, "challengeAnswer": strconv.Itoa(a + b)}
	for k, v := range payload {
		out[k] = v
	}
	return out
}

func TestRegisterRequiresChallengeInOpenMode(t *testing.T) {
	srv, _, _ := setupTestServer(t, config.RegisterModeOpen)
	client := srv.Client()
	resp, body := doJSONRequest(t, client, http.MethodPost, srv.URL+"/api/auth/register", map[string]string{
		"email": "nochallenge@example.com", "password": "Password123",
	}, nil, "")
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("expected 400 without challenge, got %d %v", resp.StatusCode, body)
	}
	resp2, _ := doJSONRequest(t, client, http.MethodPost, srv.URL+"/api/auth/register", withChallenge(t, client, srv.URL, map[string]string{
		"email": "withchallenge@example.com", "password": "Password123",
	}), nil, "")
	if resp2.StatusCode != http.StatusCreated {
		t.Fatalf("expected 201 with challenge, got %d", resp2.StatusCode)
	}
}

func TestClientIPIgnoresSpoofedXFF(t *testing.T) {
	cfg := &config.Config{}
	mk := func(remote, xff string) *http.Request {
		r := httptest.NewRequest(http.MethodGet, "/", nil)
		r.RemoteAddr = remote
		if xff != "" {
			r.Header.Set("X-Forwarded-For", xff)
		}
		return r
	}
	// No trusted proxies: headers are ignored.
	if ip := ClientIP(cfg, mk("203.0.113.9:1234", "127.0.0.1")); ip != "203.0.113.9" {
		t.Fatalf("untrusted peer must not spoof, got %s", ip)
	}
	// Loopback proxy trusted: take right-most non-trusted hop.
	_, lo, _ := net.ParseCIDR("127.0.0.0/8")
	cfg.TrustedProxies = append(cfg.TrustedProxies, lo)
	if ip := ClientIP(cfg, mk("127.0.0.1:80", "1.1.1.1, 198.51.100.7")); ip != "198.51.100.7" {
		t.Fatalf("expected right-most client hop, got %s", ip)
	}
	if ip := ClientIP(cfg, mk("127.0.0.1:80", "198.51.100.7, 127.0.0.1")); ip != "198.51.100.7" {
		t.Fatalf("trusted hops must be skipped, got %s", ip)
	}
	if ip := ClientIP(cfg, mk("127.0.0.1:80", "")); ip != "127.0.0.1" {
		t.Fatalf("fallback to remote, got %s", ip)
	}
}

func TestMigrationsIdempotentOnReopen(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "reopen.db")
	st, err := store.Open(path)
	if err != nil {
		t.Fatalf("open 1: %v", err)
	}
	_ = st.Close()
	st2, err := store.Open(path)
	if err != nil {
		t.Fatalf("open 2 (migrations must be idempotent): %v", err)
	}
	defer st2.Close()
	var n int
	if err := st2.ReadDB.QueryRow(`SELECT COUNT(*) FROM schema_migrations`).Scan(&n); err != nil || n < 4 {
		t.Fatalf("expected >=4 recorded migrations, got %d (%v)", n, err)
	}
}

func TestAdminHierarchyAndAvatarValidation(t *testing.T) {
	srv, st, _ := setupTestServer(t, config.RegisterModeOpen)
	client := srv.Client()
	cookieSuper, superID := registerUser(t, srv, "super@example.com")
	_ = st.SetUserSuperAdmin(context.Background(), "super@example.com", true)
	cookieAdmin, adminID := registerUser(t, srv, "admin@example.com")
	_ = st.SetUserAdmin(context.Background(), "admin@example.com", true)
	cookieUser, userID := registerUser(t, srv, "user@example.com")

	// A regular admin cannot disable the super admin or another admin
	resp, _ := doJSONRequest(t, client, http.MethodPost, srv.URL+"/api/admin/users/"+strconv.FormatInt(superID, 10)+"/status", map[string]bool{"isDisabled": true}, cookieAdmin, "")
	if resp.StatusCode != http.StatusForbidden {
		t.Fatalf("admin disabling super admin: expected 403, got %d", resp.StatusCode)
	}
	resp, _ = doJSONRequest(t, client, http.MethodPost, srv.URL+"/api/admin/users/"+strconv.FormatInt(adminID, 10)+"/mute", map[string]interface{}{"isMuted": true}, cookieAdmin, "")
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("admin acting on self: expected 400, got %d", resp.StatusCode)
	}
	// Super admin can act on an admin; admin can act on a user
	resp, _ = doJSONRequest(t, client, http.MethodPost, srv.URL+"/api/admin/users/"+strconv.FormatInt(adminID, 10)+"/mute", map[string]interface{}{"isMuted": true, "reason": "test"}, cookieSuper, "")
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("super admin muting admin: expected 200, got %d", resp.StatusCode)
	}
	resp, _ = doJSONRequest(t, client, http.MethodPost, srv.URL+"/api/admin/users/"+strconv.FormatInt(userID, 10)+"/mute", map[string]interface{}{"isMuted": true}, cookieAdmin, "")
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("admin muting user: expected 200, got %d", resp.StatusCode)
	}
	// Muted user cannot publish publicly nor flip to public, but may keep a private draft
	resp, _ = doJSONRequest(t, client, http.MethodPost, srv.URL+"/api/shares", map[string]interface{}{"kind": "char", "title": "x", "content": "y", "visibility": "public"}, cookieUser, "")
	if resp.StatusCode != http.StatusForbidden {
		t.Fatalf("muted public publish: expected 403, got %d", resp.StatusCode)
	}
	respPriv, bodyPriv := doJSONRequest(t, client, http.MethodPost, srv.URL+"/api/shares", map[string]interface{}{"kind": "char", "title": "x", "content": "y", "visibility": "private"}, cookieUser, "")
	if respPriv.StatusCode != http.StatusCreated {
		t.Fatalf("muted private draft: expected 201, got %d", respPriv.StatusCode)
	}
	privID := bodyPriv["share"].(map[string]interface{})["id"].(string)
	resp, _ = doJSONRequest(t, client, http.MethodPatch, srv.URL+"/api/shares/"+privID, map[string]string{"visibility": "public"}, cookieUser, "")
	if resp.StatusCode != http.StatusForbidden {
		t.Fatalf("muted flip to public: expected 403, got %d", resp.StatusCode)
	}
	// Unknown user -> 404
	resp, _ = doJSONRequest(t, client, http.MethodPost, srv.URL+"/api/admin/users/99999/lift", nil, cookieSuper, "")
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("unknown user: expected 404, got %d", resp.StatusCode)
	}

	// Avatar: arbitrary paths rejected, emoji and own upload path accepted
	for _, bad := range []string{"/avatars/u_7_1.jpg", "https://evil.example/x.png", "javascript:alert(1)"} {
		resp, _ = doJSONRequest(t, client, http.MethodPatch, srv.URL+"/api/me", map[string]string{"avatar": bad}, cookieSuper, "")
		if resp.StatusCode != http.StatusBadRequest {
			t.Fatalf("avatar %q: expected 400, got %d", bad, resp.StatusCode)
		}
	}
	for _, ok := range []string{"🧙", "", fmt.Sprintf("/avatars/u_%d_12345.jpg", superID)} {
		resp, _ = doJSONRequest(t, client, http.MethodPatch, srv.URL+"/api/me", map[string]string{"avatar": ok}, cookieSuper, "")
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("avatar %q: expected 200, got %d", ok, resp.StatusCode)
		}
	}
}

func TestCommentsVisibilityParentAndCascade(t *testing.T) {
	srv, _, _ := setupTestServer(t, config.RegisterModeOpen)
	client := srv.Client()
	cookieA, _ := registerUser(t, srv, "ca@example.com")
	cookieB, _ := registerUser(t, srv, "cb@example.com")

	_, bodyPriv := doJSONRequest(t, client, http.MethodPost, srv.URL+"/api/shares", map[string]interface{}{"kind": "world", "title": "私有", "content": "x", "visibility": "private"}, cookieA, "")
	privID := bodyPriv["share"].(map[string]interface{})["id"].(string)
	_, bodyPub := doJSONRequest(t, client, http.MethodPost, srv.URL+"/api/shares", map[string]interface{}{"kind": "world", "title": "公开", "content": "x", "visibility": "public"}, cookieA, "")
	pubID := bodyPub["share"].(map[string]interface{})["id"].(string)

	// Private share: anonymous and other users cannot read or post comments
	resp, _ := doJSONRequest(t, client, http.MethodGet, srv.URL+"/api/shares/"+privID+"/comments", nil, nil, "")
	if resp.StatusCode != http.StatusForbidden {
		t.Fatalf("anon comments on private: expected 403, got %d", resp.StatusCode)
	}
	resp, _ = doJSONRequest(t, client, http.MethodPost, srv.URL+"/api/shares/"+privID+"/comments", map[string]string{"content": "hi"}, cookieB, "")
	if resp.StatusCode != http.StatusForbidden {
		t.Fatalf("B comments on private: expected 403, got %d", resp.StatusCode)
	}
	resp, _ = doJSONRequest(t, client, http.MethodGet, srv.URL+"/api/shares/nope/comments", nil, nil, "")
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("comments on missing share: expected 404, got %d", resp.StatusCode)
	}

	// Empty comment list serialises as [] not null
	rawResp, err := client.Get(srv.URL + "/api/shares/" + pubID + "/comments")
	if err != nil {
		t.Fatal(err)
	}
	raw, _ := io.ReadAll(rawResp.Body)
	rawResp.Body.Close()
	if !strings.Contains(string(raw), `"comments":[]`) {
		t.Fatalf("expected empty array, got %s", raw)
	}

	// Reply parent must belong to the same share and be a root comment
	_, bodyC := doJSONRequest(t, client, http.MethodPost, srv.URL+"/api/shares/"+pubID+"/comments", map[string]interface{}{"content": "root"}, cookieB, "")
	rootID := int64(bodyC["comment"].(map[string]interface{})["id"].(float64))
	_, bodyR := doJSONRequest(t, client, http.MethodPost, srv.URL+"/api/shares/"+pubID+"/comments", map[string]interface{}{"content": "reply", "parentId": rootID}, cookieA, "")
	replyID := int64(bodyR["comment"].(map[string]interface{})["id"].(float64))
	resp, _ = doJSONRequest(t, client, http.MethodPost, srv.URL+"/api/shares/"+pubID+"/comments", map[string]interface{}{"content": "nested", "parentId": replyID}, cookieB, "")
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("reply to a reply: expected 400, got %d", resp.StatusCode)
	}
	resp, _ = doJSONRequest(t, client, http.MethodPost, srv.URL+"/api/shares/"+privID+"/comments", map[string]interface{}{"content": "cross", "parentId": rootID}, cookieA, "")
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("parent from another share: expected 400, got %d", resp.StatusCode)
	}

	// Like toggling is idempotent on the counter and notifies once
	for i := 0; i < 3; i++ {
		doJSONRequest(t, client, http.MethodPost, srv.URL+"/api/comments/"+strconv.FormatInt(rootID, 10)+"/like", nil, cookieA, "")
	}
	_, bodyLike := doJSONRequest(t, client, http.MethodPost, srv.URL+"/api/comments/"+strconv.FormatInt(rootID, 10)+"/like", nil, cookieA, "")
	if bodyLike["liked"] != false || bodyLike["likeCount"].(float64) != 0 {
		t.Fatalf("after 4 toggles expected unliked/0, got %v", bodyLike)
	}
	_, bodyN := doJSONRequest(t, client, http.MethodGet, srv.URL+"/api/notifications", nil, cookieB, "")
	likeNotifs := 0
	for _, n := range bodyN["notifications"].([]interface{}) {
		if n.(map[string]interface{})["type"] == "comment_liked" {
			likeNotifs++
		}
	}
	if likeNotifs != 1 {
		t.Fatalf("expected exactly 1 deduped like notification, got %d", likeNotifs)
	}
	resp, _ = doJSONRequest(t, client, http.MethodPost, srv.URL+"/api/comments/999999/like", nil, cookieA, "")
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("like missing comment: expected 404, got %d", resp.StatusCode)
	}

	// Single mark-read
	nid := int64(bodyN["notifications"].([]interface{})[0].(map[string]interface{})["id"].(float64))
	doJSONRequest(t, client, http.MethodPost, srv.URL+"/api/notifications/"+strconv.FormatInt(nid, 10)+"/read", nil, cookieB, "")
	_, bodyN2 := doJSONRequest(t, client, http.MethodGet, srv.URL+"/api/notifications", nil, cookieB, "")
	if bodyN2["unreadCount"].(float64) != float64(len(bodyN2["notifications"].([]interface{}))-1) {
		t.Fatalf("expected exactly one notification marked read, got %v", bodyN2["unreadCount"])
	}

	// Deleting the share cascades comments and notifications
	resp, _ = doJSONRequest(t, client, http.MethodDelete, srv.URL+"/api/shares/"+pubID, nil, cookieA, "")
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("delete share: %d", resp.StatusCode)
	}
	_, bodyN3 := doJSONRequest(t, client, http.MethodGet, srv.URL+"/api/notifications", nil, cookieB, "")
	for _, n := range bodyN3["notifications"].([]interface{}) {
		if n.(map[string]interface{})["targetId"] == pubID {
			t.Fatalf("notification for deleted share still present: %v", n)
		}
	}
}

func TestFeedCursorNoDuplicatesAndPatchFields(t *testing.T) {
	srv, st, _ := setupTestServer(t, config.RegisterModeOpen)
	client := srv.Client()
	cookie, uid := registerUser(t, srv, "feed@example.com")
	// 45 shares, several sharing the same created_at second
	for i := 0; i < 45; i++ {
		createdAt := int64(1_700_000_000 + i/3)
		if _, err := st.UpsertShareMeta(context.Background(), "", uid, "feed", "world", fmt.Sprintf("S%02d", i), "", "content", "", "public", "", "", 0, "canon", "", false, "", createdAt); err != nil {
			t.Fatalf("seed share %d: %v", i, err)
		}
	}
	seen := map[string]bool{}
	var before int64
	beforeID := ""
	pages := 0
	for {
		url := fmt.Sprintf("%s/api/shares?limit=20", srv.URL)
		if before > 0 {
			url += fmt.Sprintf("&before=%d&beforeId=%s", before, beforeID)
		}
		_, body := doJSONRequest(t, client, http.MethodGet, url, nil, nil, "")
		shares := body["shares"].([]interface{})
		if len(shares) == 0 {
			break
		}
		pages++
		for _, raw := range shares {
			sh := raw.(map[string]interface{})
			id := sh["id"].(string)
			if seen[id] {
				t.Fatalf("duplicate share %s across pages", id)
			}
			seen[id] = true
			if c, _ := sh["content"].(string); c != "" {
				t.Fatalf("feed must omit content, got %q", c)
			}
			before = int64(sh["createdAt"].(float64))
			beforeID = id
		}
		if pages > 10 {
			t.Fatalf("pagination never terminated")
		}
	}
	if len(seen) != 45 {
		t.Fatalf("expected 45 unique shares across pages, got %d", len(seen))
	}

	// PATCH title/summary/tags/content applies; keyword search escapes wildcards
	var anyID string
	for id := range seen {
		anyID = id
		break
	}
	resp, _ := doJSONRequest(t, client, http.MethodPatch, srv.URL+"/api/shares/"+anyID, map[string]string{"title": "Renamed_%", "summary": "sum", "tags": "t1", "content": "new body"}, cookie, "")
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("patch fields: %d", resp.StatusCode)
	}
	_, detail := doJSONRequest(t, client, http.MethodGet, srv.URL+"/api/shares/"+anyID, nil, nil, "")
	sh := detail["share"].(map[string]interface{})
	if sh["title"] != "Renamed_%" || sh["content"] != "new body" || sh["wordCount"].(float64) != 8 {
		t.Fatalf("patch not applied: %v", sh)
	}
	_, found := doJSONRequest(t, client, http.MethodGet, srv.URL+"/api/shares?q=%25", nil, nil, "")
	if n := len(found["shares"].([]interface{})); n != 1 {
		t.Fatalf("LIKE wildcard must be escaped: expected 1 match for %%, got %d", n)
	}
}

func TestAIConfigPartialUpdateAndMask(t *testing.T) {
	srv, _, _ := setupTestServer(t, config.RegisterModeOpen)
	client := srv.Client()
	cookie, _ := registerUser(t, srv, "cfg@example.com")
	resp, _ := doJSONRequest(t, client, http.MethodPut, srv.URL+"/api/me/ai-config", map[string]interface{}{
		"customAi": map[string]string{"provider": "deepseek", "baseUrl": "https://api.deepseek.com/v1", "apiKey": "sk-secret-1234567890", "model": "deepseek-chat"},
	}, cookie, "")
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("save key: %d", resp.StatusCode)
	}
	// Saving only preferences must keep the key
	resp, _ = doJSONRequest(t, client, http.MethodPut, srv.URL+"/api/me/ai-config", map[string]interface{}{
		"preferences": map[string]string{"preferredGenre": "科幻"},
	}, cookie, "")
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("save prefs: %d", resp.StatusCode)
	}
	_, body := doJSONRequest(t, client, http.MethodGet, srv.URL+"/api/me/ai-config", nil, cookie, "")
	custom, _ := body["customAi"].(map[string]interface{})
	if custom == nil || custom["hasKey"] != true {
		t.Fatalf("key was wiped by a preferences-only save: %v", body)
	}
	if _, leaked := custom["apiKey"]; leaked {
		t.Fatalf("raw apiKey must never be returned: %v", custom)
	}
	if masked, _ := custom["apiKeyMasked"].(string); strings.Contains(masked, "secret") {
		t.Fatalf("mask too weak: %s", masked)
	}
	if body["preferences"].(map[string]interface{})["preferredGenre"] != "科幻" {
		t.Fatalf("preferences not saved: %v", body)
	}
	// Private base URL rejected on save
	resp, _ = doJSONRequest(t, client, http.MethodPut, srv.URL+"/api/me/ai-config", map[string]interface{}{
		"customAi": map[string]string{"provider": "custom", "baseUrl": "https://10.0.0.1/v1", "apiKey": "sk-x", "model": "m"},
	}, cookie, "")
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("private baseUrl on save: expected 400, got %d", resp.StatusCode)
	}
	// clearKey removes it
	doJSONRequest(t, client, http.MethodPut, srv.URL+"/api/me/ai-config", map[string]interface{}{"clearKey": true}, cookie, "")
	_, body2 := doJSONRequest(t, client, http.MethodGet, srv.URL+"/api/me/ai-config", nil, cookie, "")
	if body2["customAi"] != nil {
		t.Fatalf("expected key cleared, got %v", body2["customAi"])
	}
}

func TestCocreationProjectLifecycle(t *testing.T) {
	srv, _, _ := setupTestServer(t, config.RegisterModeOpen)
	client := srv.Client()
	cookieOwner, _ := registerUser(t, srv, "owner2@example.com")
	cookieMember, memberID := registerUser(t, srv, "member@example.com")
	cookieFan, _ := registerUser(t, srv, "fan2@example.com")

	_, bodyProj := doJSONRequest(t, client, http.MethodPost, srv.URL+"/api/cocreation/projects", map[string]interface{}{
		"worldId": "wd_1", "worldTitle": "星海", "summary": "s", "admins": []string{"member@example.com", "ghost@example.com"},
	}, cookieOwner, "")
	proj := bodyProj["project"].(map[string]interface{})
	projID := proj["id"].(string)
	if len(bodyProj["unresolved"].([]interface{})) != 1 {
		t.Fatalf("expected 1 unresolved email, got %v", bodyProj["unresolved"])
	}
	members := proj["members"].([]interface{})
	if len(members) != 2 {
		t.Fatalf("expected owner + 1 admin member, got %v", members)
	}

	// Member publishes canon directly; fan publishes doujin
	_, bodyM := doJSONRequest(t, client, http.MethodPost, srv.URL+"/api/shares", map[string]interface{}{"kind": "org", "title": "官方组织", "content": "x", "visibility": "public", "cocreationId": projID}, cookieMember, "")
	if bodyM["share"].(map[string]interface{})["canonStatus"] != "canon" {
		t.Fatalf("member should publish canon")
	}
	_, bodyF := doJSONRequest(t, client, http.MethodPost, srv.URL+"/api/shares", map[string]interface{}{"kind": "char", "title": "同人角色", "content": "x", "visibility": "public", "cocreationId": projID}, cookieFan, "")
	fanShare := bodyF["share"].(map[string]interface{})
	fanID := fanShare["id"].(string)
	if fanShare["canonStatus"] != "doujin" || fanShare["canonReview"] != "none" {
		t.Fatalf("fan share should be doujin/none, got %v", fanShare)
	}

	// Owner closes doujin requests -> request rejected with 400; reopen -> ok
	doJSONRequest(t, client, http.MethodPatch, srv.URL+"/api/cocreation/projects/"+projID, map[string]interface{}{"isOpenDoujin": false}, cookieOwner, "")
	resp, _ := doJSONRequest(t, client, http.MethodPost, srv.URL+"/api/cocreation/shares/"+fanID+"/request-canon", nil, cookieFan, "")
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("request on closed project: expected 400, got %d", resp.StatusCode)
	}
	resp, _ = doJSONRequest(t, client, http.MethodPatch, srv.URL+"/api/cocreation/projects/"+projID, map[string]interface{}{"isOpenDoujin": true}, cookieMember, "")
	if resp.StatusCode != http.StatusForbidden {
		t.Fatalf("non-owner project patch: expected 403, got %d", resp.StatusCode)
	}
	doJSONRequest(t, client, http.MethodPatch, srv.URL+"/api/cocreation/projects/"+projID, map[string]interface{}{"isOpenDoujin": true}, cookieOwner, "")
	resp, _ = doJSONRequest(t, client, http.MethodPost, srv.URL+"/api/cocreation/shares/"+fanID+"/request-canon", nil, cookieFan, "")
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("request canon: %d", resp.StatusCode)
	}
	// Second request while pending -> 400
	resp, _ = doJSONRequest(t, client, http.MethodPost, srv.URL+"/api/cocreation/shares/"+fanID+"/request-canon", nil, cookieFan, "")
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("double request: expected 400, got %d", resp.StatusCode)
	}

	// Queue visible to members only
	resp, _ = doJSONRequest(t, client, http.MethodGet, srv.URL+"/api/cocreation/projects/"+projID+"/queue", nil, cookieFan, "")
	if resp.StatusCode != http.StatusForbidden {
		t.Fatalf("fan queue: expected 403, got %d", resp.StatusCode)
	}
	_, bodyQ := doJSONRequest(t, client, http.MethodGet, srv.URL+"/api/cocreation/projects/"+projID+"/queue", nil, cookieMember, "")
	if len(bodyQ["shares"].([]interface{})) != 1 {
		t.Fatalf("expected 1 pending item, got %v", bodyQ)
	}

	// Member rejects, fan re-requests, owner approves
	resp, _ = doJSONRequest(t, client, http.MethodPost, srv.URL+"/api/cocreation/shares/"+fanID+"/reject-canon", nil, cookieMember, "")
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("member reject: %d", resp.StatusCode)
	}
	_, d1 := doJSONRequest(t, client, http.MethodGet, srv.URL+"/api/shares/"+fanID, nil, nil, "")
	if d1["share"].(map[string]interface{})["canonReview"] != "rejected" {
		t.Fatalf("expected rejected, got %v", d1["share"])
	}
	doJSONRequest(t, client, http.MethodPost, srv.URL+"/api/cocreation/shares/"+fanID+"/request-canon", nil, cookieFan, "")
	resp, _ = doJSONRequest(t, client, http.MethodPost, srv.URL+"/api/cocreation/shares/"+fanID+"/approve-canon", nil, cookieOwner, "")
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("owner approve: %d", resp.StatusCode)
	}
	_, d2 := doJSONRequest(t, client, http.MethodGet, srv.URL+"/api/shares/"+fanID, nil, nil, "")
	sh := d2["share"].(map[string]interface{})
	if sh["canonStatus"] != "canon" || sh["canonReview"] != "approved" {
		t.Fatalf("expected canon/approved, got %v", sh)
	}
	_, bodyQ2 := doJSONRequest(t, client, http.MethodGet, srv.URL+"/api/cocreation/projects/"+projID+"/queue", nil, cookieOwner, "")
	if len(bodyQ2["shares"].([]interface{})) != 0 {
		t.Fatalf("queue should be empty after approval")
	}

	// Owner removes the member; member can no longer review
	resp, _ = doJSONRequest(t, client, http.MethodPut, srv.URL+"/api/cocreation/projects/"+projID+"/admins", map[string]interface{}{"userIds": []int64{}}, cookieOwner, "")
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("set admins: %d", resp.StatusCode)
	}
	_, projAfter := doJSONRequest(t, client, http.MethodGet, srv.URL+"/api/cocreation/projects/"+projID, nil, nil, "")
	if len(projAfter["project"].(map[string]interface{})["members"].([]interface{})) != 1 {
		t.Fatalf("expected only owner left, got %v", projAfter)
	}
	resp, _ = doJSONRequest(t, client, http.MethodGet, srv.URL+"/api/cocreation/projects/"+projID+"/queue", nil, cookieMember, "")
	if resp.StatusCode != http.StatusForbidden {
		t.Fatalf("removed member queue: expected 403, got %d", resp.StatusCode)
	}
	_ = memberID
	// Empty project list for a fresh user serialises as []
	rawResp, _ := client.Get(srv.URL + "/api/cocreation/projects?mine=1")
	rawResp.Body.Close()
	req, _ := http.NewRequest(http.MethodGet, srv.URL+"/api/cocreation/projects?mine=1", nil)
	req.AddCookie(cookieFan)
	r2, _ := client.Do(req)
	raw, _ := io.ReadAll(r2.Body)
	r2.Body.Close()
	if !strings.Contains(string(raw), `"projects":[]`) {
		t.Fatalf("expected empty array for projects, got %s", raw)
	}
}
