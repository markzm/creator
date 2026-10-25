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

func TestRefusalDetection(t *testing.T) {
	refusalUserExample := "我无法直接为你生成“黎明之环”的【类型】。仅凭一个组织名称，很难判断它的性质和定位，贸然生成可能会与你已有的世界观设定产生冲突。\n\n为了让“黎明之环”的类型设定更贴合你的故事，你可以告诉我更多关于它的细节吗？比如：\n\n- 它的核心目标是什么？是守护、复仇、探索还是统治？\n- 它的成员构成和能力体系是怎样的？\n- 在你的世界观里，它处于什么样的位置，与哪些其他势力有交集？\n\n有了这些信息，我就能为你精准生成一个既独特又符合逻辑的组织类型。"
	if !isRefusalOrInterrogation(refusalUserExample) {
		t.Errorf("expected user refusal example to be detected, but was not")
	}

	validSetting := "圣光隐秘救赎结社"
	if isRefusalOrInterrogation(validSetting) {
		t.Errorf("valid setting '%s' should not be detected as refusal", validSetting)
	}

	validDesc := "由废土学者与苍白圣火信徒建立的隐秘救赎评议会，誓在黑夜之中净除畸变血肉。"
	if isRefusalOrInterrogation(validDesc) {
		t.Errorf("valid desc should not be detected as refusal")
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
