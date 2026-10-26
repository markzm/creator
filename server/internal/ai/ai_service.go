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
	"log"
	"net"
	"net/http"
	"net/url"
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
	Model    string `json:"model"` // e.g. "deepseek-chat", "deepseek-reasoner"
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

// ErrInvalidBaseURL is returned when a user-supplied AI endpoint is not on the allow-list or
// points at a private / loopback / link-local address (SSRF protection).
var ErrInvalidBaseURL = errors.New("不支持的 AI 接口地址：仅允许 https 访问受信任的 AI 服务商域名")

// defaultAllowedAIHosts are the OpenAI-compatible providers offered as presets in the UI.
var defaultAllowedAIHosts = []string{
	"api.deepseek.com",
	"api.siliconflow.cn",
	"openrouter.ai",
	"api.openai.com",
}

func NewService(cfg *config.Config) *AIService {
	svc := &AIService{cfg: cfg}
	svc.httpClient = &http.Client{
		Timeout: 90 * time.Second,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= 3 {
				return errors.New("too many redirects")
			}
			// A trusted host must not be able to bounce us to an internal address.
			if _, err := svc.ValidateBaseURL(req.URL.String()); err != nil {
				return err
			}
			return nil
		},
	}
	return svc
}

func (s *AIService) allowedHosts() []string {
	hosts := append([]string{}, defaultAllowedAIHosts...)
	if s.cfg != nil {
		hosts = append(hosts, s.cfg.AllowedAIHosts...)
	}
	return hosts
}

// ValidateBaseURL checks a user-supplied base URL and returns it normalised (no trailing slash).
// Rules: https only, no userinfo, hostname (not IP literal) on the allow-list, and - when the
// name resolves - no private, loopback or link-local addresses.
func (s *AIService) ValidateBaseURL(raw string) (string, error) {
	return ValidateBaseURLWith(raw, s.allowedHosts())
}

func ValidateBaseURLWith(raw string, allowed []string) (string, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return "", ErrInvalidBaseURL
	}
	u, err := url.Parse(raw)
	if err != nil || u.Scheme != "https" || u.User != nil || u.Hostname() == "" {
		return "", ErrInvalidBaseURL
	}
	host := strings.ToLower(u.Hostname())
	if net.ParseIP(host) != nil || host == "localhost" ||
		strings.HasSuffix(host, ".local") || strings.HasSuffix(host, ".internal") || strings.HasSuffix(host, ".localhost") {
		return "", ErrInvalidBaseURL
	}
	ok := false
	for _, a := range allowed {
		a = strings.ToLower(strings.TrimSpace(a))
		if a == "" {
			continue
		}
		if host == a || strings.HasSuffix(host, "."+a) {
			ok = true
			break
		}
	}
	if !ok {
		return "", ErrInvalidBaseURL
	}
	// Defense in depth against DNS tricks on an allow-listed name.
	if ips, err := net.LookupIP(host); err == nil {
		for _, ip := range ips {
			if ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() || ip.IsUnspecified() {
				return "", ErrInvalidBaseURL
			}
		}
	}
	return strings.TrimRight(u.String(), "/"), nil
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

func isRefusalOrInterrogation(text string) bool {
	lower := strings.ToLower(text)
	triggers := []string{
		"我无法直接为你生成",
		"我无法直接",
		"我无法为你生成",
		"我无法生成",
		"仅凭一个",
		"很难判断",
		"贸然生成",
		"产生冲突",
		"你可以告诉我更多",
		"告诉我更多关于它的细节",
		"有了这些信息，我就能",
		"有了这些信息",
		"核心目标是什么",
		"无法直接判断",
		"你可以告诉我",
		"为了让“",
		"为了让【",
	}
	for _, t := range triggers {
		if strings.Contains(lower, t) {
			return true
		}
	}
	trimmed := strings.TrimSpace(text)
	if strings.HasSuffix(trimmed, "？") || strings.HasSuffix(trimmed, "?") {
		return true
	}
	if strings.Count(text, "？") >= 2 || strings.Count(text, "?") >= 2 {
		return true
	}
	return false
}

func (s *AIService) Generate(ctx context.Context, req GenerateRequest) (*GenerateResponse, error) {
	systemPrompt, userPrompt := buildPrompts(req)

	// If custom AI is configured and has an API Key, use it directly
	if req.CustomAI != nil && strings.TrimSpace(req.CustomAI.APIKey) != "" {
		baseURL := strings.TrimRight(strings.TrimSpace(req.CustomAI.BaseURL), "/")
		if baseURL == "" {
			baseURL = "https://api.deepseek.com/v1"
		}
		validated, err := s.ValidateBaseURL(baseURL)
		if err != nil {
			return nil, fmt.Errorf("个人外部 AI 配置无效: %w", err)
		}
		baseURL = validated
		model := strings.TrimSpace(req.CustomAI.Model)
		if model == "" {
			model = "deepseek-chat"
		}
		content, err := s.callOpenAICompatible(ctx, baseURL, req.CustomAI.APIKey, model, systemPrompt, userPrompt)
		if err != nil {
			return nil, fmt.Errorf("个人外部 AI 调用失败: %w", err)
		}
		if isRefusalOrInterrogation(content) {
			retryPrompt := fmt.Sprintf("【系统严厉指令】：刚才的回复违反规则！绝对禁止反问或提问！不要问‘核心目标是什么’或‘更多细节’！立刻依据名称直接输出【%s】的【%s】设定正文！只输出最终设定结果：", req.EntityKind, req.FieldLabel)
			retryContent, retryErr := s.callOpenAICompatible(ctx, baseURL, req.CustomAI.APIKey, model, systemPrompt, retryPrompt)
			if retryErr == nil && strings.TrimSpace(retryContent) != "" && !isRefusalOrInterrogation(retryContent) {
				content = retryContent
			}
		}
		return &GenerateResponse{
			Content: strings.TrimSpace(content),
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
			if isRefusalOrInterrogation(content) {
				retryPrompt := fmt.Sprintf("【系统严厉指令】：刚才的回复违反规则！绝对禁止反问或提问！不要索要更多细节！立刻依据名称直接输出【%s】的【%s】设定正文！只输出最终设定结果：", req.EntityKind, req.FieldLabel)
				retryContent, retryErr := s.callOpenRouter(ctx, m, systemPrompt, retryPrompt)
				if retryErr == nil && strings.TrimSpace(retryContent) != "" && !isRefusalOrInterrogation(retryContent) {
					return &GenerateResponse{
						Content: strings.TrimSpace(retryContent),
						Model:   m,
						UsedAI:  "public",
					}, nil
				}
				lastErr = fmt.Errorf("model %s gave conversational refusal", m)
				continue
			}
			return &GenerateResponse{
				Content: strings.TrimSpace(content),
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
	validated, err := s.ValidateBaseURL(baseURL)
	if err != nil {
		return "", err
	}
	baseURL = validated
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
		log.Printf("[ai] upstream %s returned %d: %.300s", req.URL.Host, resp.StatusCode, string(respBytes))
		return "", fmt.Errorf("upstream status %d", resp.StatusCode)
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
		log.Printf("[ai] upstream %s returned %d: %.300s", req.URL.Host, resp.StatusCode, string(respBytes))
		return "", fmt.Errorf("upstream status %d", resp.StatusCode)
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

	systemPrompt = fmt.Sprintf(`你是一个专业、严谨且富有极致想象力的世界观与小说设定生成引擎（Database Field Generator）。
你的职责是直接产出高品质的设定数据填入设定集数据库，你不是日常闲聊助手。

【绝对禁止规则（违者判定为系统故障）】：
1. 绝对禁止向用户提问、反问、确认意图或索要更多细节！
2. 绝对禁止输出诸如"我无法直接为你生成"、"很难判断它的性质"、"你可以告诉我更多细节吗"等推脱、反问或聊天性言论！
3. 绝对禁止输出任何问候开场白（如"好的"、"没问题"、"为您生成如下"）、礼貌用语、后续探讨问答或带有问号的疑问句！
4. 绝对禁止输出反问清单（例如："- 它的核心目标是什么？"、"- 成员构成是怎样的？"）！

【核心执行法则】：
无论创作者给出的已有信息有多么简略（哪怕仅有一个名称，如“黎明之环”），你也必须依据经典小说的优秀范式与成熟架构，果断、自信、富有创意地直接构想出最贴合、最惊艳的设定成果！
当前主打流派：【%s】，文风倾向：【%s】。%s
【输出格式要求】：只输出最终的设定内容本身，纯文本正文，不带任何废话、反问或多余对话。`, genre, tone, extra)

	switch req.Task {
	case "field_gen":
		var sb strings.Builder
		entityKindName := "实体"
		switch req.EntityKind {
		case "world":
			entityKindName = "世界观"
		case "org":
			entityKindName = "组织势力"
		case "char":
			entityKindName = "角色人物"
		}

		sb.WriteString(fmt.Sprintf("请为当前的【%s】直接创作字段【%s】的具体设定值。\n", entityKindName, req.FieldLabel))

		// Field specific heuristics & length constraints
		fID := strings.ToLower(req.FieldID)
		fLabel := req.FieldLabel

		if fID == "o_type" || strings.Contains(fLabel, "类型") || fID == "w_type" {
			if req.EntityKind == "org" {
				sb.WriteString("【字段定性指引】：此字段为组织类型/定位标签。请直接给出一个极具质感的组织类型称谓（字数控制在 2~12 字以内，例如：圣光隐秘救赎结社 / 浮空舰队探险商会 / 遗物收容调查局 / 异端探索学术联盟 / 皇家炼金学者评议会 / 影匿刺客密契同盟）。直接输出答案，绝不反问！\n")
			} else if req.EntityKind == "world" {
				sb.WriteString("【字段定性指引】：此字段为世界类型/形态标签。请直接给出一个 2~12 字的世界形态定性（例如：破碎浮空群岛 / 蒸汽魔导星球 / 溃烂纪废土界域 / 位面晶壁系）。直接输出答案，绝不反问！\n")
			} else {
				sb.WriteString("【字段定性指引】：此字段为分类标签。请直接输出 2~12 字的核心定性词，直接输出答案，绝不反问！\n")
			}
		} else if strings.Contains(fID, "magic") || strings.Contains(fLabel, "魔力") || strings.Contains(fLabel, "战力") {
			sb.WriteString("【字段定性指引】：请直接输出体系层级定性（例如：高魔·以太泛滥 / 衰退微魔 / 严谨硬科幻法则 / 畸变圣血高危），字数 4~16 字。\n")
		} else if strings.Contains(fID, "slogan") || strings.Contains(fID, "creed") || strings.Contains(fLabel, "格言") || strings.Contains(fLabel, "口号") || strings.Contains(fLabel, "箴言") {
			sb.WriteString("【字段定性指引】：请直接输出一至两句铿锵有力、蕴含哲理与张力的格言口号（例如：「于长夜之中执掌黎明，唯光芒破晓诸界。」）。\n")
		} else if fID == "c_gender" || fLabel == "性别" || fID == "c_age" || fLabel == "年龄" || fID == "c_race" || fLabel == "种族" {
			sb.WriteString("【字段定性指引】：请直接输出简明属性词（如：女 / 20岁 / 半血星灵 / 纯血人类），字数 1~10 字。\n")
		} else if strings.Contains(fID, "desc") || strings.Contains(fID, "history") || strings.Contains(fID, "story") || strings.Contains(fID, "core") || strings.Contains(fLabel, "描述") || strings.Contains(fLabel, "历史") || strings.Contains(fLabel, "背景") || strings.Contains(fLabel, "宗旨") {
			sb.WriteString("【字段定性指引】：请直接输出一段 80~250 字左右生动细腻、逻辑自洽的设定文本，直接切入核心，严禁反问。\n")
		}

		if len(req.EntityData) > 0 {
			sb.WriteString("【已有参考属性】：\n")
			for k, v := range req.EntityData {
				if strings.TrimSpace(v) != "" {
					sb.WriteString(fmt.Sprintf("- %s: %s\n", k, v))
				}
			}
		}
		if req.Context != "" {
			sb.WriteString("【关联宏观背景】：\n" + req.Context + "\n")
		}
		if req.CurrentText != "" {
			sb.WriteString(fmt.Sprintf("【已有文本草稿】：%s\n", req.CurrentText))
		}
		if req.Prompt != "" {
			sb.WriteString(fmt.Sprintf("【用户灵感或微调要求】：%s\n", req.Prompt))
		}

		sb.WriteString("【强制执行要求】：直接输出字段内容！绝对不要输出任何问句、反问、确认或建议，禁止说‘我无法生成’，只输出设定内容！")
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

type AnimePaintRequest struct {
	Prompt         string        `json:"prompt"`
	NegativePrompt string        `json:"negativePrompt,omitempty"`
	Style          string        `json:"style"`       // e.g. "anime_classic", "makoto_shinkai", "cyberpunk_anime", "gothic_anime", "chibi_anime", "otome_anime"
	AspectRatio    string        `json:"aspectRatio"` // "1:1" | "9:16" | "3:4"
	CharName       string        `json:"charName,omitempty"`
	Features       string        `json:"features,omitempty"`
	CustomAI       *UserAIConfig `json:"customAi,omitempty"`
}

type AnimePaintResponse struct {
	ImageURL    string `json:"imageUrl"`
	Prompt      string `json:"prompt"`
	Style       string `json:"style"`
	UsedModel   string `json:"usedModel"`
	FallbackSVG string `json:"fallbackSvg,omitempty"`
}

func (s *AIService) PaintAnimeArt(ctx context.Context, req *AnimePaintRequest) (*AnimePaintResponse, error) {
	styleMod := "masterpiece, best quality, ultra-detailed anime illustration, exquisite facial features, vibrant expressive eyes, clean sharp lineart"
	switch req.Style {
	case "makoto_shinkai":
		styleMod += ", Makoto Shinkai aesthetic, cinematic sky, gorgeous volumetric sunset lighting, dramatic clouds, starry sparkle"
	case "cyberpunk_anime":
		styleMod += ", futuristic cyberpunk anime style, neon lighting, holographic UI, glowing circuitry, high-tech jacket"
	case "gothic_anime":
		styleMod += ", elegant dark gothic anime style, antique lace, dramatic shadows, mysterious crimson accents, Victorian atmosphere"
	case "chibi_anime":
		styleMod += ", cute chibi anime style, adorable proportions, sparkling big eyes, kawaii pastel palette, soft gradient background"
	case "otome_anime":
		styleMod += ", delicate otome romance anime style, soft watercolor texture, blooming petals, dreamy romantic glow, handsome refined aura"
	case "pixel_anime":
		styleMod += ", high-detail 16-bit pixel anime art style, retro JRPG aesthetic, crisp pixel lineart"
	default:
		styleMod += ", modern Japanese anime style, Kyoto Animation studio aesthetic, vibrant cel shading"
	}

	finalPrompt := styleMod
	if strings.TrimSpace(req.CharName) != "" {
		finalPrompt += ", character: " + strings.TrimSpace(req.CharName)
	}
	if strings.TrimSpace(req.Features) != "" {
		finalPrompt += ", " + strings.TrimSpace(req.Features)
	}
	if strings.TrimSpace(req.Prompt) != "" {
		finalPrompt += ", " + strings.TrimSpace(req.Prompt)
	}

	w := 512
	h := 512
	switch req.AspectRatio {
	case "9:16":
		w = 576
		h = 1024
	case "3:4":
		w = 576
		h = 768
	}

	// 1. If custom AI has an image generation API endpoint configured
	if req.CustomAI != nil && req.CustomAI.APIKey != "" && strings.TrimSpace(req.CustomAI.BaseURL) != "" {
		customURL, err := s.ValidateBaseURL(req.CustomAI.BaseURL)
		if err != nil {
			return nil, err
		}
		if !strings.HasSuffix(customURL, "/images/generations") {
			customURL += "/images/generations"
		}
		imgReqBody := map[string]interface{}{
			"prompt": finalPrompt,
			"n":      1,
			"size":   fmt.Sprintf("%dx%d", w, h),
		}
		if req.CustomAI.Model != "" {
			imgReqBody["model"] = req.CustomAI.Model
		}
		jsonBytes, _ := json.Marshal(imgReqBody)
		httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, customURL, bytes.NewReader(jsonBytes))
		if err == nil {
			httpReq.Header.Set("Content-Type", "application/json")
			httpReq.Header.Set("Authorization", "Bearer "+req.CustomAI.APIKey)
			resp, err := s.httpClient.Do(httpReq)
			if err == nil {
				defer resp.Body.Close()
			}
			if err == nil && resp.StatusCode == http.StatusOK {
				var customResp struct {
					Data []struct {
						URL     string `json:"url"`
						B64JSON string `json:"b64_json"`
					} `json:"data"`
				}
				if err := json.NewDecoder(resp.Body).Decode(&customResp); err == nil && len(customResp.Data) > 0 {
					imgURL := customResp.Data[0].URL
					if imgURL == "" && customResp.Data[0].B64JSON != "" {
						imgURL = "data:image/png;base64," + customResp.Data[0].B64JSON
					}
					if imgURL != "" {
						return &AnimePaintResponse{
							ImageURL:  imgURL,
							Prompt:    finalPrompt,
							Style:     req.Style,
							UsedModel: req.CustomAI.Model,
						}, nil
					}
				}
			}
		}
	}

	// 2. Pollinations AI high-quality anime model
	seed := time.Now().UnixNano() % 1000000
	encodedPrompt := url.QueryEscape(finalPrompt)
	imageURL := fmt.Sprintf("https://image.pollinations.ai/prompt/%s?model=flux-anime&width=%d&height=%d&nologo=true&enhance=true&seed=%d", encodedPrompt, w, h, seed)

	return &AnimePaintResponse{
		ImageURL:  imageURL,
		Prompt:    finalPrompt,
		Style:     req.Style,
		UsedModel: "flux-anime",
	}, nil
}
