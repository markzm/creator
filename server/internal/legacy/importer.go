package legacy

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"creator/server/internal/auth"
	"creator/server/internal/store"
)

type ImportOptions struct {
	ExportDir      string
	Email          string
	PasswordIfNew  string
	AvatarDestDir  string
}

type ImportResult struct {
	UserID       int64
	Email        string
	CreatedUser  bool
	DocRev       int
	WorldCount   int
	OrgCount     int
	CharCount    int
	SharesImport int
	AvatarURL    string
}

// ImportIntoStore reads an archive directory produced by `legacy-export`, upgrades `db.json`
// into a valid `DocV6` document, restores user profile + avatar + shares, and commits to SQLite.
func ImportIntoStore(ctx context.Context, st *store.Store, opts ImportOptions) (*ImportResult, error) {
	email := strings.ToLower(strings.TrimSpace(opts.Email))
	if err := auth.ValidateEmail(email); err != nil {
		return nil, err
	}

	res := &ImportResult{Email: email}

	// 1. Find or create target user
	user, err := st.GetUserByEmail(ctx, email)
	if err != nil {
		if err != store.ErrUserNotFound {
			return nil, err
		}
		pass := opts.PasswordIfNew
		if pass == "" {
			return nil, fmt.Errorf("user %s does not exist (provide --password to auto-create)", email)
		}
		hash, err := auth.HashPassword(pass)
		if err != nil {
			return nil, err
		}
		user, err = st.CreateUser(ctx, email, hash, "", false)
		if err != nil {
			return nil, fmt.Errorf("create user: %w", err)
		}
		res.CreatedUser = true
	}
	res.UserID = user.ID

	// 2. Restore profile from raw/my_presence.json + avatar.jpg
	var nickname, bio, avatarURL string
	presencePath := filepath.Join(opts.ExportDir, "raw", "my_presence.json")
	if b, err := os.ReadFile(presencePath); err == nil {
		var p userPresenceRow
		if json.Unmarshal(b, &p) == nil {
			nickname = strings.TrimSpace(p.OwnerName)
			bio = strings.TrimSpace(p.Bio)
			if p.Avatar != "" && !strings.HasPrefix(p.Avatar, "img:") {
				avatarURL = p.Avatar
			}
		}
	}

	// Check if avatar.jpg or avatar.png exists in ExportDir
	for _, ext := range []string{".jpg", ".jpeg", ".png"} {
		avSrc := filepath.Join(opts.ExportDir, "avatar"+ext)
		if avBytes, err := os.ReadFile(avSrc); err == nil && len(avBytes) > 0 && opts.AvatarDestDir != "" {
			if err := os.MkdirAll(opts.AvatarDestDir, 0o750); err == nil {
				fileName := fmt.Sprintf("u_%d_legacy%s", user.ID, ext)
				destPath := filepath.Join(opts.AvatarDestDir, fileName)
				if os.WriteFile(destPath, avBytes, 0o640) == nil {
					avatarURL = "/avatars/" + fileName
					res.AvatarURL = avatarURL
				}
			}
			break
		}
	}

	if nickname != "" || bio != "" || avatarURL != "" {
		var nPtr, aPtr, bPtr *string
		if nickname != "" {
			nPtr = &nickname
		}
		if avatarURL != "" {
			aPtr = &avatarURL
		}
		if bio != "" {
			bPtr = &bio
		}
		if updatedUser, err := st.UpdateProfile(ctx, user.ID, nPtr, aPtr, bPtr); err == nil {
			user = updatedUser
		}
	}

	// 3. Upgrade and import db.json (or raw/cc_db_raw.json) into user_docs
	dbPath := filepath.Join(opts.ExportDir, "db.json")
	rawBytes, err := os.ReadFile(dbPath)
	if err != nil {
		rawBytes, err = os.ReadFile(filepath.Join(opts.ExportDir, "raw", "cc_db_raw.json"))
	}
	if err == nil && len(rawBytes) > 0 {
		v6Bytes, wCnt, oCnt, cCnt, err := UpgradeRawJSONToV6(rawBytes)
		if err != nil {
			return nil, fmt.Errorf("upgrade legacy db to DocV6: %w", err)
		}
		curDoc, _ := st.GetDoc(ctx, user.ID)
		baseRev := 0
		if curDoc != nil {
			baseRev = curDoc.Rev
		}
		savedDoc, err := st.PutDoc(ctx, user.ID, baseRev, v6Bytes, "legacy-import")
		if err != nil {
			return nil, fmt.Errorf("save imported DocV6: %w", err)
		}
		res.DocRev = savedDoc.Rev
		res.WorldCount = wCnt
		res.OrgCount = oCnt
		res.CharCount = cCnt
	}

	// 4. Import raw/my_shares.json idempotently
	sharesPath := filepath.Join(opts.ExportDir, "raw", "my_shares.json")
	if b, err := os.ReadFile(sharesPath); err == nil {
		var shares []worldShareRow
		if json.Unmarshal(b, &shares) == nil {
			for idx, s := range shares {
				if strings.TrimSpace(s.Title) == "" {
					continue
				}
				shareID := fmt.Sprintf("sh_leg_%d_%d", user.ID, idx)
				if s.ID != nil && fmt.Sprintf("%v", s.ID) != "" {
					shareID = fmt.Sprintf("sh_leg_%v", s.ID)
				}
				createdAt := time.Now().Unix()
				if t, err := time.Parse(time.RFC3339, s.CreatedAt); err == nil {
					createdAt = t.Unix()
				}
				ownerName := user.Nickname
				if s.OwnerName != "" {
					ownerName = s.OwnerName
				}
				if _, err := st.CreateShareWithMeta(ctx, shareID, user.ID, ownerName, "world", s.Title, s.Summary, s.Content, "", createdAt); err == nil {
					res.SharesImport++
				}
			}
		}
	}

	return res, nil
}

// UpgradeRawJSONToV6 normalizes a v4/v5/v5.1/v5.3/v5.4 backup or raw CC.DB JSON into DocV6 format.
func UpgradeRawJSONToV6(rawBytes []byte) ([]byte, int, int, int, error) {
	var raw map[string]interface{}
	if err := json.Unmarshal(rawBytes, &raw); err != nil {
		return nil, 0, 0, 0, err
	}

	nowMs := time.Now().UnixMilli()
	genID := func(prefix string) string {
		b := make([]byte, 4)
		_, _ = rand.Read(b)
		return prefix + hex.EncodeToString(b)
	}

	normalizeEntityMap := func(key, prefix string, isWorld bool) map[string]interface{} {
		out := make(map[string]interface{})
		m, ok := raw[key].(map[string]interface{})
		if !ok {
			return out
		}
		for k, val := range m {
			em, ok := val.(map[string]interface{})
			if !ok {
				continue
			}
			id := k
			if s, ok := em["id"].(string); ok && s != "" {
				id = s
			} else if id == "" {
				id = genID(prefix)
			}
			name, _ := em["name"].(string)
			if name == "" {
				name = "未命名"
			}
			dataMap, ok := em["data"].(map[string]interface{})
			if !ok {
				dataMap = map[string]interface{}{}
			}
			updatedAt := nowMs
			if u, ok := em["updatedAt"].(float64); ok && u > 0 {
				updatedAt = int64(u)
			}
			createdAt := updatedAt
			if c, ok := em["createdAt"].(float64); ok && c > 0 {
				createdAt = int64(c)
			}

			entity := map[string]interface{}{
				"id":        id,
				"name":      name,
				"data":      dataMap,
				"createdAt": createdAt,
				"updatedAt": updatedAt,
			}
			if isWorld {
				if ci, ok := em["customInsp"].([]interface{}); ok {
					entity["customInsp"] = ci
				} else {
					entity["customInsp"] = []string{}
				}
			}
			if tplID, ok := em["templateId"].(string); ok && tplID != "" {
				entity["templateId"] = tplID
			}
			out[id] = entity
		}
		return out
	}

	worlds := normalizeEntityMap("worlds", "wd_", true)
	orgs := normalizeEntityMap("orgs", "og_", false)
	chars := normalizeEntityMap("chars", "ch_", false)

	templates, ok := raw["templates"].(map[string]interface{})
	if !ok {
		templates = map[string]interface{}{}
	}

	ensureSliceWithID := func(key, prefix string) []interface{} {
		arr, ok := raw[key].([]interface{})
		if !ok {
			return []interface{}{}
		}
		out := make([]interface{}, 0, len(arr))
		for _, item := range arr {
			if im, ok := item.(map[string]interface{}); ok {
				if _, hasID := im["id"]; !hasID {
					im["id"] = genID(prefix)
				}
				if _, hasUp := im["updatedAt"]; !hasUp {
					im["updatedAt"] = nowMs
				}
				out = append(out, im)
			}
		}
		return out
	}

	timeline := ensureSliceWithID("timeline", "tl_")
	plots := ensureSliceWithID("plots", "pl_")
	scenes := ensureSliceWithID("scenes", "sc_")
	glossary := ensureSliceWithID("glossary", "gl_")

	var stats []interface{}
	if rawStats, ok := raw["stats"].([]interface{}); ok {
		for _, stItem := range rawStats {
			if sm, ok := stItem.(map[string]interface{}); ok {
				d, _ := sm["date"].(string)
				if d == "" {
					d, _ = sm["d"].(string)
				}
				c := float64(0)
				if v, ok := sm["chars"].(float64); ok {
					c = v
				} else if v, ok := sm["n"].(float64); ok {
					c = v
				}
				if d != "" {
					stats = append(stats, map[string]interface{}{"date": d, "chars": int(c)})
				}
			}
		}
	}
	if stats == nil {
		stats = []interface{}{}
	}

	ui := map[string]interface{}{
		"activeW":   nil,
		"activeO":   nil,
		"activeC":   nil,
		"activeTpl": "all",
		"nowYear":   302,
	}
	if rawUI, ok := raw["ui"].(map[string]interface{}); ok {
		for k, v := range rawUI {
			ui[k] = v
		}
	} else {
		for _, k := range []string{"activeW", "activeO", "activeC", "activeTpl", "nowYear"} {
			if v, exists := raw[k]; exists && v != nil {
				ui[k] = v
			}
		}
	}

	docV6 := map[string]interface{}{
		"_version":  6,
		"worlds":    worlds,
		"orgs":      orgs,
		"chars":     chars,
		"templates": templates,
		"timeline":  timeline,
		"plots":     plots,
		"scenes":    scenes,
		"glossary":  glossary,
		"stats":     stats,
		"ui":        ui,
	}

	outBytes, err := json.Marshal(docV6)
	return outBytes, len(worlds), len(orgs), len(chars), err
}
