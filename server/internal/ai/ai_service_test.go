package ai

import (
	"testing"
)

func TestEncryptDecryptUserConfig(t *testing.T) {
	secret := "test-secret-key-12345"
	original := `{"provider":"deepseek","apiKey":"sk-test-123","model":"deepseek-chat"}`

	enc, err := EncryptUserConfig(original, secret)
	if err != nil {
		t.Fatalf("EncryptUserConfig failed: %v", err)
	}
	if enc == "" || enc == original {
		t.Fatalf("unexpected encrypted string: %s", enc)
	}

	dec, err := DecryptUserConfig(enc, secret)
	if err != nil {
		t.Fatalf("DecryptUserConfig failed: %v", err)
	}
	if dec != original {
		t.Errorf("decrypted mismatch: got %s, want %s", dec, original)
	}

	// Tampered secret should fail
	if _, err := DecryptUserConfig(enc, "wrong-secret"); err == nil {
		t.Errorf("expected error with wrong secret, got nil")
	}
}

func TestBuildPrompts(t *testing.T) {
	req := GenerateRequest{
		Task:       "field_gen",
		FieldID:    "w_power_system",
		FieldLabel: "力量体系",
		EntityKind: "world",
		EntityData: map[string]string{
			"w_name": "星渊群岛",
		},
		Prompt: "带点克苏鲁与蒸汽朋克风味",
		Preferences: &StudioPreferences{
			PreferredGenre: "奇幻蒸汽朋克",
			WritingTone:    "冷峻细腻",
		},
	}

	sys, usr := buildPrompts(req)
	if sys == "" || usr == "" {
		t.Fatalf("prompts should not be empty")
	}
	if !contains(sys, "奇幻蒸汽朋克") {
		t.Errorf("sys prompt should contain preferred genre")
	}
	if !contains(usr, "星渊群岛") || !contains(usr, "力量体系") {
		t.Errorf("usr prompt should contain entity context and field label")
	}
}

func contains(s, substr string) bool {
	return len(s) >= len(substr) && (s == substr || len(substr) == 0 || (len(s) > 0 && len(substr) > 0 && indexOf(s, substr) >= 0))
}

func indexOf(s, substr string) int {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return i
		}
	}
	return -1
}
