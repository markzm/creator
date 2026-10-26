package legacy

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

const (
	DefaultEndpoint       = "https://worldbuilding-studio.app.workbuddy.host"
	DefaultPublishableKey = "wbpk_dfTf91HpFpdkFVXmZqLgMk_1zFbEtYdRNt6Tbm5WtDIshZ4QkvQkGSm"
	AccessKeyHeader       = "x-wb-webapp-access-key"
	RuntimeBucket         = "runtime"
)

var digitsOnlyRe = regexp.MustCompile(`\D`)
var cnMobileRe = regexp.MustCompile(`^1\d{10}$`)

// NormalizeUsername converts an 11-digit mainland China phone number into "+86 13xxxxxxxxx"
// exactly matching the WorkBuddy SDK normalizePhone logic, while preserving emails or pre-formatted usernames.
func NormalizeUsername(input string) string {
	trimmed := strings.TrimSpace(input)
	if strings.Contains(trimmed, "@") {
		return trimmed
	}
	digits := digitsOnlyRe.ReplaceAllString(trimmed, "")
	if strings.HasPrefix(digits, "0086") {
		digits = digits[4:]
	} else if strings.HasPrefix(digits, "86") && len(digits) == 13 {
		digits = digits[2:]
	}
	if cnMobileRe.MatchString(digits) {
		return "+86 " + digits
	}
	return trimmed
}

type ExportConfig struct {
	Endpoint       string
	PublishableKey string
	Username       string
	Password       string
	OutDir         string
	HTTPClient     *http.Client
}

type ExportManifest struct {
	ExportedAt   string `json:"exportedAt"`
	Endpoint     string `json:"endpoint"`
	UserID       string `json:"userId"`
	UserName     string `json:"userName,omitempty"`
	HasSyncDoc   bool   `json:"hasSyncDoc"`
	SyncUpdated  string `json:"syncUpdatedAt,omitempty"`
	WorldCount   int    `json:"worldCount"`
	OrgCount     int    `json:"orgCount"`
	CharCount    int    `json:"charCount"`
	TemplateCnt  int    `json:"templateCount"`
	TimelineCnt  int    `json:"timelineCount"`
	PlotVolCnt   int    `json:"plotVolumeCount"`
	SceneCnt     int    `json:"sceneCount"`
	GlossaryCnt  int    `json:"glossaryCount"`
	MyShareCount int    `json:"myShareCount"`
	AllShareCnt  int    `json:"allShareCount"`
	PresenceCnt  int    `json:"presenceCount"`
	AvatarFile   string `json:"avatarFile,omitempty"`
	AvatarRaw    string `json:"avatarRaw,omitempty"`
}

type signInResponse struct {
	AccessToken  string                 `json:"access_token"`
	RefreshToken string                 `json:"refresh_token"`
	ExpiresIn    int                    `json:"expires_in"`
	Sub          string                 `json:"sub"`
	UID          string                 `json:"uid"`
	Name         string                 `json:"name"`
	Phone        string                 `json:"phone_number"`
	Email        string                 `json:"email"`
	Raw          map[string]interface{} `json:"-"`
}

type userSyncRow struct {
	ID        interface{} `json:"id"`
	OwnerID   string      `json:"owner_id"`
	OwnerName string      `json:"owner_name"`
	Data      string      `json:"data"`
	UpdatedAt string      `json:"updated_at"`
	CreatedAt string      `json:"created_at"`
}

type userPresenceRow struct {
	ID             interface{} `json:"id"`
	OwnerID        string      `json:"owner_id"`
	OwnerName      string      `json:"owner_name"`
	Avatar         string      `json:"avatar"`
	Bio            string      `json:"bio"`
	Focus          string      `json:"focus"`
	FocusUpdatedAt string      `json:"focus_updated_at"`
	LastSeen       string      `json:"last_seen"`
	CreatedAt      string      `json:"created_at"`
}

type worldShareRow struct {
	ID        interface{} `json:"id"`
	OwnerID   string      `json:"owner_id"`
	OwnerName string      `json:"owner_name"`
	Title     string      `json:"title"`
	Summary   string      `json:"summary"`
	Content   string      `json:"content"`
	CreatedAt string      `json:"created_at"`
}

type signedURLItem struct {
	Path      string `json:"path"`
	SignedURL string `json:"signedURL"`
	URL       string `json:"url"`
	Signed    string `json:"signed_url"`
	Error     string `json:"error,omitempty"`
}

// RunExport performs a complete read-only export from the legacy WorkBuddy BaaS service.
func RunExport(ctx context.Context, cfg ExportConfig) (*ExportManifest, error) {
	if cfg.Endpoint == "" {
		cfg.Endpoint = DefaultEndpoint
	}
	cfg.Endpoint = strings.TrimRight(cfg.Endpoint, "/")
	if cfg.PublishableKey == "" {
		cfg.PublishableKey = DefaultPublishableKey
	}
	if strings.TrimSpace(cfg.Username) == "" {
		return nil, errors.New("username/phone is required")
	}
	if cfg.Password == "" {
		return nil, errors.New("password is required")
	}
	if cfg.OutDir == "" {
		cfg.OutDir = fmt.Sprintf("legacy-export-%s", time.Now().Format("20060102-150405"))
	}
	client := cfg.HTTPClient
	if client == nil {
		client = &http.Client{Timeout: 30 * time.Second}
	}

	rawDir := filepath.Join(cfg.OutDir, "raw")
	if err := os.MkdirAll(rawDir, 0o750); err != nil {
		return nil, fmt.Errorf("create output directory: %w", err)
	}

	// 1. Sign in with normalized username and password
	normalizedUser := NormalizeUsername(cfg.Username)
	authResp, err := signIn(ctx, client, cfg.Endpoint, cfg.PublishableKey, normalizedUser, cfg.Password)
	if err != nil {
		return nil, fmt.Errorf("sign in failed: %w", err)
	}
	uid := authResp.Sub
	if uid == "" {
		uid = authResp.UID
	}

	// Save redacted auth profile (never write access_token or password to disk)
	redactedUser := map[string]interface{}{
		"sub":            uid,
		"normalizedUser": normalizedUser,
		"name":           authResp.Name,
		"phone":          authResp.Phone,
		"email":          authResp.Email,
		"exportedAt":     time.Now().Format(time.RFC3339),
	}
	if err := writePrettyJSON(filepath.Join(rawDir, "auth_user.json"), redactedUser); err != nil {
		return nil, err
	}

	manifest := &ExportManifest{
		ExportedAt: time.Now().Format(time.RFC3339),
		Endpoint:   cfg.Endpoint,
		UserID:     uid,
		UserName:   authResp.Name,
	}

	// 2. Fetch user_sync
	syncBody, err := getJSON(ctx, client, cfg.Endpoint+"/.cloud/database/rest/user_sync?select=*", cfg.PublishableKey, authResp.AccessToken)
	if err != nil {
		return nil, fmt.Errorf("fetch user_sync: %w", err)
	}
	if err := writeRawPrettyJSON(filepath.Join(rawDir, "user_sync.json"), syncBody); err != nil {
		return nil, err
	}

	var syncRows []userSyncRow
	if err := json.Unmarshal(syncBody, &syncRows); err != nil {
		return nil, fmt.Errorf("decode user_sync: %w", err)
	}

	if len(syncRows) > 0 && strings.TrimSpace(syncRows[0].Data) != "" {
		row := syncRows[0]
		manifest.HasSyncDoc = true
		manifest.SyncUpdated = row.UpdatedAt
		if manifest.UserName == "" && row.OwnerName != "" {
			manifest.UserName = row.OwnerName
		}
		if uid == "" && row.OwnerID != "" {
			uid = row.OwnerID
			manifest.UserID = uid
		}

		// Save exact inner CC.DB JSON
		if err := writeRawPrettyJSON(filepath.Join(rawDir, "cc_db_raw.json"), []byte(row.Data)); err != nil {
			return nil, fmt.Errorf("write cc_db_raw.json: %w", err)
		}

		// Build standard v5.3/v5.4 backup db.json compatible with both legacy "Restore" and v6 importer
		backupDoc, stats, err := buildCompatibleBackup([]byte(row.Data))
		if err != nil {
			return nil, fmt.Errorf("parse synced CC.DB JSON: %w", err)
		}
		manifest.WorldCount = stats.worlds
		manifest.OrgCount = stats.orgs
		manifest.CharCount = stats.chars
		manifest.TemplateCnt = stats.templates
		manifest.TimelineCnt = stats.timeline
		manifest.PlotVolCnt = stats.plots
		manifest.SceneCnt = stats.scenes
		manifest.GlossaryCnt = stats.glossary

		if err := writePrettyJSON(filepath.Join(cfg.OutDir, "db.json"), backupDoc); err != nil {
			return nil, fmt.Errorf("write db.json: %w", err)
		}
	}

	// 3. Fetch user_presence
	presenceBody, err := getJSON(ctx, client, cfg.Endpoint+"/.cloud/database/rest/user_presence?select=*&order=last_seen.desc", cfg.PublishableKey, authResp.AccessToken)
	if err != nil {
		return nil, fmt.Errorf("fetch user_presence: %w", err)
	}
	if err := writeRawPrettyJSON(filepath.Join(rawDir, "user_presence.json"), presenceBody); err != nil {
		return nil, err
	}

	var presenceRows []userPresenceRow
	if err := json.Unmarshal(presenceBody, &presenceRows); err == nil {
		manifest.PresenceCnt = len(presenceRows)
		var myPresence *userPresenceRow
		for i := range presenceRows {
			p := &presenceRows[i]
			if (uid != "" && p.OwnerID == uid) || (manifest.UserName != "" && p.OwnerName == manifest.UserName) {
				myPresence = p
				break
			}
		}
		// Fallback: if there is only 1 presence row and RLS scoped it or single-user instance
		if myPresence == nil && len(presenceRows) == 1 {
			myPresence = &presenceRows[0]
		}
		if myPresence != nil {
			if manifest.UserName == "" && myPresence.OwnerName != "" {
				manifest.UserName = myPresence.OwnerName
			}
			manifest.AvatarRaw = myPresence.Avatar
			if err := writePrettyJSON(filepath.Join(rawDir, "my_presence.json"), myPresence); err != nil {
				return nil, err
			}

			// 4. If avatar starts with "img:", sign URL and download image bytes
			if strings.HasPrefix(myPresence.Avatar, "img:") {
				objPath := strings.TrimPrefix(myPresence.Avatar, "img:")
				avatarBytes, ext, err := downloadSignedAvatar(ctx, client, cfg.Endpoint, cfg.PublishableKey, authResp.AccessToken, objPath)
				if err != nil {
					// Record warning in manifest but do not abort the whole export
					manifest.AvatarFile = "ERROR: " + err.Error()
				} else {
					avName := "avatar" + ext
					avPath := filepath.Join(cfg.OutDir, avName)
					if err := os.WriteFile(avPath, avatarBytes, 0o640); err != nil {
						return nil, fmt.Errorf("save avatar file: %w", err)
					}
					manifest.AvatarFile = avName
				}
			}
		}
	}

	// 5. Fetch world_shares
	sharesBody, err := getJSON(ctx, client, cfg.Endpoint+"/.cloud/database/rest/world_shares?select=*&order=created_at.desc", cfg.PublishableKey, authResp.AccessToken)
	if err != nil {
		return nil, fmt.Errorf("fetch world_shares: %w", err)
	}
	if err := writeRawPrettyJSON(filepath.Join(rawDir, "world_shares.json"), sharesBody); err != nil {
		return nil, err
	}

	var shareRows []worldShareRow
	if err := json.Unmarshal(sharesBody, &shareRows); err == nil {
		manifest.AllShareCnt = len(shareRows)
		var myShares []worldShareRow
		for _, s := range shareRows {
			if (uid != "" && s.OwnerID == uid) || (s.OwnerID == "" && manifest.UserName != "" && s.OwnerName == manifest.UserName) {
				myShares = append(myShares, s)
			}
		}
		manifest.MyShareCount = len(myShares)
		if err := writePrettyJSON(filepath.Join(rawDir, "my_shares.json"), myShares); err != nil {
			return nil, err
		}
	}

	// 6. Write manifest.json
	if err := writePrettyJSON(filepath.Join(cfg.OutDir, "manifest.json"), manifest); err != nil {
		return nil, err
	}

	return manifest, nil
}

func signIn(ctx context.Context, client *http.Client, endpoint, pubKey, username, password string) (*signInResponse, error) {
	payload := map[string]string{
		"username": username,
		"password": password,
	}
	b, _ := json.Marshal(payload)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint+"/.cloud/auth/v1/signin", bytes.NewReader(b))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set(AccessKeyHeader, pubKey)

	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("HTTP %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}

	var parsed signInResponse
	if err := json.Unmarshal(body, &parsed); err != nil {
		return nil, fmt.Errorf("invalid signin response JSON: %w", err)
	}
	if parsed.AccessToken == "" {
		return nil, errors.New("signin response did not contain access_token")
	}
	return &parsed, nil
}

func getJSON(ctx context.Context, client *http.Client, fullURL, pubKey, accessToken string) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, fullURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set(AccessKeyHeader, pubKey)
	if accessToken != "" {
		req.Header.Set("Authorization", "Bearer "+accessToken)
	}

	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("HTTP %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}
	return body, nil
}

func downloadSignedAvatar(ctx context.Context, client *http.Client, endpoint, pubKey, accessToken, objPath string) ([]byte, string, error) {
	cleanPath := strings.TrimPrefix(objPath, "/")
	signReqBody, _ := json.Marshal(map[string]interface{}{
		"expiresIn": 3600,
		"paths":     []string{cleanPath},
	})

	signURL := fmt.Sprintf("%s/.cloud/storage/object/sign/%s", endpoint, RuntimeBucket)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, signURL, bytes.NewReader(signReqBody))
	if err != nil {
		return nil, "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set(AccessKeyHeader, pubKey)
	if accessToken != "" {
		req.Header.Set("Authorization", "Bearer "+accessToken)
	}

	resp, err := client.Do(req)
	if err != nil {
		return nil, "", err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, "", err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, "", fmt.Errorf("sign URL HTTP %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}

	var items []signedURLItem
	if err := json.Unmarshal(body, &items); err != nil {
		var single signedURLItem
		if err2 := json.Unmarshal(body, &single); err2 != nil {
			return nil, "", fmt.Errorf("decode signed URL response: %w", err)
		}
		items = []signedURLItem{single}
	}
	if len(items) == 0 {
		return nil, "", errors.New("empty signed URL list")
	}

	rawSigned := items[0].SignedURL
	if rawSigned == "" {
		rawSigned = items[0].URL
	}
	if rawSigned == "" {
		rawSigned = items[0].Signed
	}
	if rawSigned == "" {
		return nil, "", fmt.Errorf("missing signedURL in response: %s", string(body))
	}

	var downloadURL string
	if strings.HasPrefix(rawSigned, "http://") || strings.HasPrefix(rawSigned, "https://") {
		downloadURL = rawSigned
	} else if strings.HasPrefix(rawSigned, "/.cloud/storage/") {
		downloadURL = endpoint + rawSigned
	} else {
		if !strings.HasPrefix(rawSigned, "/") {
			rawSigned = "/" + rawSigned
		}
		downloadURL = endpoint + "/.cloud/storage" + rawSigned
	}

	dlReq, err := http.NewRequestWithContext(ctx, http.MethodGet, downloadURL, nil)
	if err != nil {
		return nil, "", err
	}
	dlReq.Header.Set(AccessKeyHeader, pubKey)

	dlResp, err := client.Do(dlReq)
	if err != nil {
		return nil, "", err
	}
	defer dlResp.Body.Close()

	imgBytes, err := io.ReadAll(dlResp.Body)
	if err != nil {
		return nil, "", err
	}
	if dlResp.StatusCode < 200 || dlResp.StatusCode >= 300 {
		return nil, "", fmt.Errorf("download avatar HTTP %d", dlResp.StatusCode)
	}

	ext := filepath.Ext(cleanPath)
	if ext == "" {
		ext = ".jpg"
	}
	return imgBytes, ext, nil
}

type docCounts struct {
	worlds    int
	orgs      int
	chars     int
	templates int
	timeline  int
	plots     int
	scenes    int
	glossary  int
}

func buildCompatibleBackup(rawDB []byte) (map[string]interface{}, docCounts, error) {
	var raw map[string]interface{}
	if err := json.Unmarshal(rawDB, &raw); err != nil {
		return nil, docCounts{}, err
	}

	ensureMap := func(k string) map[string]interface{} {
		if v, ok := raw[k].(map[string]interface{}); ok && v != nil {
			return v
		}
		return map[string]interface{}{}
	}
	ensureSlice := func(k string) []interface{} {
		if v, ok := raw[k].([]interface{}); ok && v != nil {
			return v
		}
		return []interface{}{}
	}

	worlds := ensureMap("worlds")
	orgs := ensureMap("orgs")
	chars := ensureMap("chars")
	templates := ensureMap("templates")
	timeline := ensureSlice("timeline")
	plots := ensureSlice("plots")
	scenes := ensureSlice("scenes")
	glossary := ensureSlice("glossary")
	stats := ensureSlice("stats")

	counts := docCounts{
		worlds:    len(worlds),
		orgs:      len(orgs),
		chars:     len(chars),
		templates: len(templates),
		timeline:  len(timeline),
		plots:     len(plots),
		scenes:    len(scenes),
		glossary:  len(glossary),
	}

	// Matches legacy/index.html L2680 CC.backup() format so it can be restored directly in v5.4 or imported in v6
	backup := map[string]interface{}{
		"version":   5.3,
		"ts":        time.Now().UnixMilli(),
		"worlds":    worlds,
		"orgs":      orgs,
		"chars":     chars,
		"templates": templates,
		"timeline":  timeline,
		"plots":     plots,
		"scenes":    scenes,
		"glossary":  glossary,
		"stats":     stats,
		"ui": map[string]interface{}{
			"activeW":   raw["activeW"],
			"activeO":   raw["activeO"],
			"activeC":   raw["activeC"],
			"activeTpl": raw["activeTpl"],
			"nowYear":   raw["nowYear"],
		},
	}
	return backup, counts, nil
}

func writePrettyJSON(path string, v interface{}) error {
	b, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, append(b, '\n'), 0o640)
}

func writeRawPrettyJSON(path string, raw []byte) error {
	var v interface{}
	if err := json.Unmarshal(raw, &v); err != nil {
		return os.WriteFile(path, raw, 0o640)
	}
	return writePrettyJSON(path, v)
}
