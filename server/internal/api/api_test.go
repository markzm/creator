package api

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"image"
	"image/color"
	"image/png"
	"mime/multipart"
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
	resp, _ := doJSONRequest(t, client, http.MethodPost, srv.URL+"/api/auth/register", map[string]string{
		"email":    "alice@example.com",
		"password": "short",
	}, nil, "")
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("expected 400 for weak password, got %d", resp.StatusCode)
	}

	// Valid registration
	resp, _ = doJSONRequest(t, client, http.MethodPost, srv.URL+"/api/auth/register", map[string]string{
		"email":    "alice@example.com",
		"password": "AlicePass123",
	}, nil, "")
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
	resp, _ = doJSONRequest(t, srvInv.Client(), http.MethodPost, srvInv.URL+"/api/auth/register", map[string]string{
		"email":    "bob@example.com",
		"password": "BobPassword123",
	}, nil, "")
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("expected 400 without invite, got %d", resp.StatusCode)
	}
	// With invite -> 201
	resp, _ = doJSONRequest(t, srvInv.Client(), http.MethodPost, srvInv.URL+"/api/auth/register", map[string]string{
		"email":      "bob@example.com",
		"password":   "BobPassword123",
		"inviteCode": codes[0],
	}, nil, "")
	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("expected 201 with valid invite, got %d", resp.StatusCode)
	}
}

func TestSyncOptimisticLockAndRevisions(t *testing.T) {
	srv, _, _ := setupTestServer(t, config.RegisterModeOpen)
	client := srv.Client()

	resp, _ := doJSONRequest(t, client, http.MethodPost, srv.URL+"/api/auth/register", map[string]string{
		"email":    "sync@example.com",
		"password": "SyncPassword123",
	}, nil, "")
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

	respA, _ := doJSONRequest(t, client, http.MethodPost, srv.URL+"/api/auth/register", map[string]string{
		"email":    "authorA@example.com",
		"password": "PasswordA123",
	}, nil, "")
	cookieA := findSessionCookie(respA)

	respB, _ := doJSONRequest(t, client, http.MethodPost, srv.URL+"/api/auth/register", map[string]string{
		"email":    "authorB@example.com",
		"password": "PasswordB123",
	}, nil, "")
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
	respReg, _ := doJSONRequest(t, client, http.MethodPost, srv.URL+"/api/auth/register", map[string]string{
		"email":    "author_ai@example.com",
		"password": "Password123",
	}, nil, "")
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
	if customAI["apiKey"] != "sk-deepseek-secret-123" {
		t.Fatalf("unexpected decrypted apiKey: %v", customAI["apiKey"])
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
	srv, _, _ := setupTestServer(t, config.RegisterModeOpen)
	client := srv.Client()

	// 1. Register markzm user (SuperAdmin) and a regular creator
	respAdmin, bodyAdmin := doJSONRequest(t, client, http.MethodPost, srv.URL+"/api/auth/register", map[string]string{
		"email":    "markzm@creator.local",
		"password": "Password123",
	}, nil, "")
	if respAdmin.StatusCode != http.StatusCreated {
		t.Fatalf("register markzm failed: %d %v", respAdmin.StatusCode, bodyAdmin)
	}
	var cookieAdmin *http.Cookie
	if len(respAdmin.Cookies()) > 0 {
		cookieAdmin = respAdmin.Cookies()[0]
	}

	respCreator, bodyCreator := doJSONRequest(t, client, http.MethodPost, srv.URL+"/api/auth/register", map[string]string{
		"email":    "creator1@example.com",
		"password": "Password123",
	}, nil, "")
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

	// 4. Markzm posts a comment on the share
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

	// 5. Creator likes markzm's comment
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
		"admins":     []string{"markzm@creator.local"},
	}, cookieCreator, "")
	if respProj.StatusCode != http.StatusCreated {
		t.Fatalf("create cocreation project failed: %d %v", respProj.StatusCode, bodyProj)
	}
	projObj := bodyProj["project"].(map[string]interface{})
	projID := projObj["id"].(string)

	// 7. Markzm (superadmin) manages roles: promotes creator to admin
	respRole, _ := doJSONRequest(t, client, http.MethodPut, srv.URL+"/api/admin/users/"+strconv.FormatInt(creatorID, 10)+"/role", map[string]interface{}{
		"isAdmin": true,
	}, cookieAdmin, "")
	if respRole.StatusCode != http.StatusOK {
		t.Fatalf("markzm set admin role failed: %d", respRole.StatusCode)
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

	// 8. Test Canonization workflow
	// Doujin creator publishes a fan setting for the cocreation project
	respDoujin, bodyDoujin := doJSONRequest(t, client, http.MethodPost, srv.URL+"/api/shares", map[string]interface{}{
		"kind":         "char",
		"title":        "塔之守护者 · 阿尔温",
		"summary":      "星界巨塔守卫队长（同人衍生）",
		"content":      "守护高塔百年的机械人偶骑士",
		"visibility":   "public",
		"canonStatus":  "doujin",
		"cocreationId": projID,
	}, cookieCreator, "")
	if respDoujin.StatusCode != http.StatusCreated {
		t.Fatalf("create doujin failed: %d %v", respDoujin.StatusCode, bodyDoujin)
	}
	doujinObj := bodyDoujin["share"].(map[string]interface{})
	doujinID := doujinObj["id"].(string)

	// Request canonization
	respReqCanon, _ := doJSONRequest(t, client, http.MethodPost, srv.URL+"/api/cocreation/shares/"+doujinID+"/request-canon", nil, cookieCreator, "")
	if respReqCanon.StatusCode != http.StatusOK {
		t.Fatalf("request canon failed: %d", respReqCanon.StatusCode)
	}

	// Project creator approves canonization
	respApproveCanon, _ := doJSONRequest(t, client, http.MethodPost, srv.URL+"/api/cocreation/shares/"+doujinID+"/approve-canon", nil, cookieCreator, "")
	if respApproveCanon.StatusCode != http.StatusOK {
		t.Fatalf("approve canon failed: %d", respApproveCanon.StatusCode)
	}

	// Verify share is now canon
	_, bodyShareCheck := doJSONRequest(t, client, http.MethodGet, srv.URL+"/api/shares/"+doujinID, nil, nil, "")
	shCheck := bodyShareCheck["share"].(map[string]interface{})
	if shCheck["canonStatus"] != "canon" {
		t.Fatalf("expected canonStatus to be 'canon', got %v", shCheck["canonStatus"])
	}
}
