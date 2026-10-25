package ai

import (
	"bytes"
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"creator/server/internal/config"
)

type AIService struct {
	cfg        *config.Config
	httpClient *http.Client
}

type UserAIConfig struct {
	Provider string `json:"provider"` // "public" | "deepseek" | "siliconflow" | "openrouter" | "custom"
	BaseURL  string `json:"baseUrl"`  // e.g. "https://api.deepseek.com/v1"
	APIKey   string `json:"apiKey"`
	Model    string `json:"model"`    // e.g. "deepseek-chat", "deepseek-reasoner"
}

type StudioPreferences struct {
	PreferredGenre      string `json:"preferredGenre"`      // e.g. "奇幻", "科幻", "赛博朋克"
	WritingTone         string `json:"writingTone"`         // e.g. "细腻生动", "史诗厚重", "轻快幽默"
	DefaultPerspective  string `json:"defaultPerspective"`  // e.g. "第三人称", "第一人称"
	AICustomInstruction string `json:"aiCustomInstruction"` // Custom extra prompt
}

type GenerateRequest struct {
	Task        string             `json:"task"` // "field_gen" | "entity_gen" | "article_write" | "article_continue" | "article_summary"
	FieldID     string             `json:"fieldId,omitempty"`
	FieldLabel  string             `json:"fieldLabel,omitempty"`
	EntityKind  string             `json:"entityKind,omitempty"` // "world" | "org" | "char"
	EntityData  map[string]string  `json:"entityData,omitempty"`
	CurrentText string             `json:"currentText,omitempty"`
	Prompt      string             `json:"prompt,omitempty"`
	Context     string             `json:"context,omitempty"`
	CustomAI    *UserAIConfig      `json:"customAi,omitempty"`
	Preferences *StudioPreferences `json:"preferences,omitempty"`
}

type GenerateResponse struct {
	Content string `json:"content"`
	Model   string `json:"model"`
	UsedAI  string `json:"usedAi"` // "public" or "custom"
}

func NewService(cfg *config.Config) *AIService {
	return &AIService{
		cfg: cfg,
		httpClient: &http.Client{
			Timeout: 90 * time.Second,
		},
	}
}

// OpenRouter / OpenAI compatible chat request payload
type chatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type chatCompletionReq struct {
	Model       string        `json:"model"`
	Messages    []chatMessage `json:"messages"`
	Temperature float64       `json:"temperature,omitempty"`
	MaxTokens   int           `json:"max_tokens,omitempty"`
}

type chatCompletionResp struct {
	Choices []struct {
		Message struct {
			Content string `json:"content"`
		} `json:"message"`
	} `json:"choices"`
	Error *struct {
		Message string `json:"message"`
		Code    any    `json:"code"`
	} `json:"error,omitempty"`
}

func (s *AIService) PublicAIReady() bool {
	return strings.TrimSpace(s.cfg.OpenRouterAPIKey) != ""
}

func (s *AIService) GetPublicFreeModels() []string {
	if len(s.cfg.OpenRouterModels) > 0 {
		return s.cfg.OpenRouterModels
	}
	return []string{"openrouter/free"}
}

func (s *AIService) Generate(ctx context.Context, req GenerateRequest) (*GenerateResponse, error) {
	systemPrompt, userPrompt := buildPrompts(req)

	// If custom AI is configured and has an API Key, use it directly
	if req.CustomAI != nil && strings.TrimSpace(req.CustomAI.APIKey) != "" {
		baseURL := strings.TrimRight(strings.TrimSpace(req.CustomAI.BaseURL), "/")
		if baseURL == "" {
			baseURL = "https://api.deepseek.com/v1"
		}
		model := strings.TrimSpace(req.CustomAI.Model)
		if model == "" {
			model = "deepseek-chat"
		}
		content, err := s.callOpenAICompatible(ctx, baseURL, req.CustomAI.APIKey, model, systemPrompt, userPrompt)
		if err != nil {
			return nil, fmt.Errorf("个人外部 AI 调用失败: %w", err)
		}
		return &GenerateResponse{
			Content: content,
			Model:   model,
			UsedAI:  "custom",
		}, nil
	}

	// Otherwise, fallback to server's OpenRouter public free models
	if !s.PublicAIReady() {
		return nil, errors.New("公共免费 AI 暂未配置，请在「个人主页」配置个人 DeepSeek / OpenRouter API Key")
	}

	models := s.GetPublicFreeModels()
	var lastErr error
	for _, m := range models {
		content, err := s.callOpenRouter(ctx, m, systemPrompt, userPrompt)
		if err == nil && strings.TrimSpace(content) != "" {
			return &GenerateResponse{
				Content: content,
				Model:   m,
				UsedAI:  "public",
			}, nil
		}
		lastErr = err
	}

	return nil, fmt.Errorf("公共免费 AI 模型暂时繁忙，请重试或在个人设置中配置个人 API Key (%v)", lastErr)
}

func (s *AIService) TestConnection(ctx context.Context, cfg UserAIConfig) (string, error) {
	baseURL := strings.TrimRight(strings.TrimSpace(cfg.BaseURL), "/")
	if baseURL == "" {
		baseURL = "https://api.deepseek.com/v1"
	}
	apiKey := strings.TrimSpace(cfg.APIKey)
	if apiKey == "" {
		return "", errors.New("API Key 不能为空")
	}
	model := strings.TrimSpace(cfg.Model)
	if model == "" {
		model = "deepseek-chat"
	}

	sys := "You are a helpful assistant. Reply with only 'OK' if you receive this."
	usr := "Ping test."
	start := time.Now()
	res, err := s.callOpenAICompatible(ctx, baseURL, apiKey, model, sys, usr)
	if err != nil {
		return "", err
	}
	duration := time.Since(start).Milliseconds()
	return fmt.Sprintf("连接成功！模型响应: %s (耗时 %dms)", strings.TrimSpace(res), duration), nil
}

func (s *AIService) callOpenRouter(ctx context.Context, model, systemPrompt, userPrompt string) (string, error) {
	url := "https://openrouter.ai/api/v1/chat/completions"
	payload := chatCompletionReq{
		Model: model,
		Messages: []chatMessage{
			{Role: "system", Content: systemPrompt},
			{Role: "user", Content: userPrompt},
		},
		Temperature: 0.8,
		MaxTokens:   2000,
	}
	bodyBytes, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(bodyBytes))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+s.cfg.OpenRouterAPIKey)
	req.Header.Set("HTTP-Referer", "https://abc.lidan.cc")
	req.Header.Set("X-Title", "Creator Studio v6")

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	respBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("status %d: %s", resp.StatusCode, string(respBytes))
	}

	var chatResp chatCompletionResp
	if err := json.Unmarshal(respBytes, &chatResp); err != nil {
		return "", err
	}
	if chatResp.Error != nil && chatResp.Error.Message != "" {
		return "", errors.New(chatResp.Error.Message)
	}
	if len(chatResp.Choices) == 0 {
		return "", errors.New("empty response from model")
	}

	return strings.TrimSpace(chatResp.Choices[0].Message.Content), nil
}

func (s *AIService) callOpenAICompatible(ctx context.Context, baseURL, apiKey, model, systemPrompt, userPrompt string) (string, error) {
	url := baseURL + "/chat/completions"
	payload := chatCompletionReq{
		Model: model,
		Messages: []chatMessage{
			{Role: "system", Content: systemPrompt},
			{Role: "user", Content: userPrompt},
		},
		Temperature: 0.8,
		MaxTokens:   3000,
	}
	bodyBytes, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(bodyBytes))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+apiKey)

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	respBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("status %d: %s", resp.StatusCode, string(respBytes))
	}

	var chatResp chatCompletionResp
	if err := json.Unmarshal(respBytes, &chatResp); err != nil {
		return "", err
	}
	if chatResp.Error != nil && chatResp.Error.Message != "" {
		return "", errors.New(chatResp.Error.Message)
	}
	if len(chatResp.Choices) == 0 {
		return "", errors.New("empty response from model")
	}

	return strings.TrimSpace(chatResp.Choices[0].Message.Content), nil
}

func buildPrompts(req GenerateRequest) (systemPrompt, userPrompt string) {
	genre := "通俗小说/架空奇幻"
	tone := "生动细腻、逻辑自洽"
	extra := ""
	if req.Preferences != nil {
		if req.Preferences.PreferredGenre != "" {
			genre = req.Preferences.PreferredGenre
		}
		if req.Preferences.WritingTone != "" {
			tone = req.Preferences.WritingTone
		}
		if req.Preferences.AICustomInstruction != "" {
			extra = "\n用户自定义偏好指令：" + req.Preferences.AICustomInstruction
		}
	}

	systemPrompt = fmt.Sprintf(`你是一位殿堂级的世界观架构师与小说创作大师。
你擅长为创作者构建富有张力、细节丰富且逻辑自洽的世界观、组织、角色与小说故事。
当前设定的主打流派为：【%s】，文风倾向：【%s】。
请始终保持专业、富有创造力、文学质感，避免陈词滥调与机械化口吻。%s`, genre, tone, extra)

	switch req.Task {
	case "field_gen":
		var sb strings.Builder
		sb.WriteString(fmt.Sprintf("请为当前的【%s】设定生成字段【%s】的内容。\n", req.EntityKind, req.FieldLabel))
		if len(req.EntityData) > 0 {
			sb.WriteString("【当前已有上下文信息】：\n")
			for k, v := range req.EntityData {
				if strings.TrimSpace(v) != "" {
					sb.WriteString(fmt.Sprintf("- %s: %s\n", k, v))
				}
			}
		}
		if req.CurrentText != "" {
			sb.WriteString(fmt.Sprintf("【字段已有草稿/前文】：%s\n", req.CurrentText))
		}
		if req.Prompt != "" {
			sb.WriteString(fmt.Sprintf("【创作者的灵感或要求】：%s\n", req.Prompt))
		}
		sb.WriteString("要求：直接输出该字段的生成内容，不要附加多余的寒暄开场白或解释。")
		userPrompt = sb.String()

	case "entity_gen":
		userPrompt = fmt.Sprintf(`请为我构思一套完整的【%s】设定卡片。
创作者主题/灵感意向：%s
请输出包含核心属性（名称、定位、核心特征、背景故事、能力或关键设定）的生动描写，分条列出，直接给创作者可填入设定集的干货内容。`, req.EntityKind, req.Prompt)

	case "article_write":
		var sb strings.Builder
		sb.WriteString("请基于以下设定背景，撰写一篇精彩的小说正文或故事片段。\n")
		if req.Context != "" {
			sb.WriteString("【绑定世界观与角色设定背景】：\n" + req.Context + "\n\n")
		}
		sb.WriteString("【本篇写作主题/剧情要求】：\n" + req.Prompt + "\n")
		sb.WriteString("要求：文笔优美，人物性格符合设定，情节紧凑，直接输出小说正文。")
		userPrompt = sb.String()

	case "article_continue":
		var sb strings.Builder
		sb.WriteString("请续写以下小说内容。\n")
		if req.Context != "" {
			sb.WriteString("【绑定设定背景】：\n" + req.Context + "\n\n")
		}
		sb.WriteString("【已写正文前文】：\n" + req.CurrentText + "\n\n")
		if req.Prompt != "" {
			sb.WriteString("【后续剧情走向指示】：\n" + req.Prompt + "\n\n")
		}
		sb.WriteString("要求：紧接前文语境，自然流畅展开情节，直接输出续写的正文内容。")
		userPrompt = sb.String()

	case "article_summary":
		userPrompt = fmt.Sprintf(`请阅读以下文章正文，提取精炼的摘要：
1. 一句话核心梗概（40字以内）；
2. 关键剧情点提炼（3~5条简短要点）。

【正文内容】：
%s`, req.CurrentText)

	default:
		userPrompt = req.Prompt
	}

	return systemPrompt, userPrompt
}

// EncryptUserConfig encrypts raw JSON with AES-256-GCM using key derived from secretKey
func EncryptUserConfig(rawJSON string, secretKey string) (string, error) {
	if strings.TrimSpace(rawJSON) == "" {
		return "", nil
	}
	hash := sha256.Sum256([]byte(secretKey))
	block, err := aes.NewCipher(hash[:])
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", err
	}
	sealed := gcm.Seal(nonce, nonce, []byte(rawJSON), nil)
	return base64.StdEncoding.EncodeToString(sealed), nil
}

// DecryptUserConfig decrypts base64 ciphertext with AES-256-GCM
func DecryptUserConfig(enc string, secretKey string) (string, error) {
	enc = strings.TrimSpace(enc)
	if enc == "" {
		return "", nil
	}
	ciphertext, err := base64.StdEncoding.DecodeString(enc)
	if err != nil {
		return "", err
	}
	hash := sha256.Sum256([]byte(secretKey))
	block, err := aes.NewCipher(hash[:])
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	if len(ciphertext) < gcm.NonceSize() {
		return "", errors.New("ciphertext too short")
	}
	nonce := ciphertext[:gcm.NonceSize()]
	actualCiphertext := ciphertext[gcm.NonceSize():]
	plain, err := gcm.Open(nil, nonce, actualCiphertext, nil)
	if err != nil {
		return "", err
	}
	return string(plain), nil
}
