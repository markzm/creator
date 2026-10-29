import { Hono } from 'hono';
import { decryptUserConfig, getCurrentUser } from '../auth';
import type { Env } from '../types';
import { AIError, buildCreativePrompts, limitedJSON, reserveAI, setting, validateGeneration, validateOutput } from '../ai-guards';

export const aiRouter = new Hono<{ Bindings: Env }>();

const DEFAULT_ALLOWED_HOSTS = [
  'api.deepseek.com',
  'api.siliconflow.cn',
  'openrouter.ai',
  'api.openai.com'
];

function isHostAllowed(urlStr: string, envAllowed?: string): boolean {
  try {
    const u = new URL(urlStr);
    if (u.protocol !== 'https:' || u.username || u.password || u.search || u.hash || (u.port && u.port !== '443')) return false;
    const hostname = u.hostname.toLowerCase();

    const allowed = [...DEFAULT_ALLOWED_HOSTS];
    if (envAllowed) {
      for (const h of envAllowed.split(',')) {
        const trimmed = h.trim().toLowerCase();
        if (trimmed) allowed.push(trimmed);
      }
    }

    return allowed.some((ah) => hostname === ah);
  } catch {
    return false;
  }
}

aiRouter.onError((error, c) => {
  if (error instanceof AIError) {
    if (error.retryAfter) c.header('Retry-After', String(error.retryAfter));
    return c.json({ error: error.message, retryAfter: error.retryAfter || undefined }, error.status as any);
  }
  console.error('ai_request_failed', { type: error.name });
  return c.json({ error: 'AI 配额或服务暂不可用，请稍后重试' }, 503);
});

async function callModel(baseUrl: string, key: string, payload: unknown, timeout: number) {
  try {
    const response = await fetch(baseUrl.replace(/\/+$/, '') + '/chat/completions', {
      method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(timeout * 1000),
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify(payload)
    });
    if (!response.ok) throw new AIError(`AI 服务商暂时无法完成请求（HTTP ${response.status}）`, 502);
    // Bound even a malicious/misconfigured compatible provider's response.
    return await limitedJSON(response, 512 * 1024);
  } catch (error) {
    if (error instanceof AIError) throw error;
    throw new AIError('AI 请求超时或连接失败，请稍后重试', 504);
  }
}

// GET /api/ai/status
aiRouter.get('/status', (c) => {
  const publicReady = Boolean(c.env.OPENROUTER_API_KEY && c.env.OPENROUTER_API_KEY.trim());
  return c.json({
    publicReady,
    freeModels: ['openrouter/free'],
    limits: { publicMinute: setting(c.env.AI_PUBLIC_MINUTE, 5, 100), publicDaily: setting(c.env.AI_PUBLIC_DAILY, 50, 10000),
      customMinute: setting(c.env.AI_CUSTOM_MINUTE, 30, 100), concurrent: 1, resetTimezone: 'Asia/Shanghai' },
    presets: [
      {
        id: 'deepseek',
        name: 'DeepSeek 官方 API',
        baseUrl: 'https://api.deepseek.com/v1',
        model: 'deepseek-chat',
        hint: '推荐：速度快、文学创作与中文能力极强'
      },
      {
        id: 'siliconflow',
        name: 'SiliconFlow 硅基流动',
        baseUrl: 'https://api.siliconflow.cn/v1',
        model: 'deepseek-ai/DeepSeek-V3',
        hint: '国内高速中转，支持 DeepSeek-V3/R1 系列'
      },
      {
        id: 'openrouter',
        name: 'OpenRouter 个人 Key',
        baseUrl: 'https://openrouter.ai/api/v1',
        model: 'deepseek/deepseek-chat',
        hint: '支持全球顶尖大模型聚合调用'
      }
    ]
  });
});

// POST /api/ai/test -- same durable lease, separate three-per-minute quota.
aiRouter.post('/test', async (c) => {
  const user = await getCurrentUser(c);
  if (!user) return c.json({ error: '请先登录' }, 401);
  const body = await limitedJSON(c.req.raw, setting(c.env.AI_MAX_INPUT_BYTES, 128 * 1024));
  if (typeof body.baseUrl !== 'string' || typeof body.apiKey !== 'string' || !body.apiKey.trim() ||
    (body.model !== undefined && typeof body.model !== 'string')) throw new AIError('AI 配置格式不正确');
  if (!isHostAllowed(body.baseUrl, c.env.ALLOWED_AI_HOSTS)) throw new AIError('AI 接口仅允许受信任的 HTTPS 服务地址');
  const quota = await reserveAI(c, user.id, 'test');
  try {
    await callModel(body.baseUrl, body.apiKey.trim(), {
      model: body.model || 'deepseek-chat', messages: [{ role: 'user', content: 'Hi' }], max_tokens: 5
    }, quota.timeout);
    return c.json({ ok: true, message: 'AI 服务商接口连接成功' });
  } finally { await quota.release(); }
});

aiRouter.post('/generate', async (c) => {
  const user = await getCurrentUser(c);
  if (!user) return c.json({ error: '请先登录' }, 401);
  const body = await limitedJSON(c.req.raw, setting(c.env.AI_MAX_INPUT_BYTES, 128 * 1024));
  validateGeneration(body);
  let config: { baseUrl: string; apiKey: string; model: string };
  if (body.provider === 'public') {
    if (!c.env.OPENROUTER_API_KEY?.trim()) throw new AIError('公共 AI 暂未配置，请使用个人 AI 服务');
    if (body.publicModel && body.publicModel !== 'openrouter/free') throw new AIError('公共 AI 模型不在允许列表内');
    config = { baseUrl: 'https://openrouter.ai/api/v1', apiKey: c.env.OPENROUTER_API_KEY.trim(), model: 'openrouter/free' };
  } else {
    let custom = body.customAi;
    if ((!custom || !custom.apiKey) && user.ai_config_enc) {
      const decrypted = await decryptUserConfig(user.ai_config_enc, c.env.SECRET_KEY || 'creator-secret-change-in-wrangler-secrets');
      try { custom = decrypted ? JSON.parse(decrypted) : null; } catch { custom = null; }
    }
    if (!custom || typeof custom.apiKey !== 'string' || !custom.apiKey.trim() ||
      typeof custom.baseUrl !== 'string' || (custom.model !== undefined && typeof custom.model !== 'string')) {
      throw new AIError('请先配置有效的个人 AI 服务，不会自动改用公共额度');
    }
    config = { baseUrl: custom.baseUrl.trim(), apiKey: custom.apiKey.trim(), model: custom.model || 'deepseek-chat' };
  }
  if (!isHostAllowed(config.baseUrl, c.env.ALLOWED_AI_HOSTS)) throw new AIError('AI 接口仅允许受信任的 HTTPS 服务地址');
  const prompts = buildCreativePrompts(body);
  const quota = await reserveAI(c, user.id, body.provider);
  const started = Date.now();
  try {
    const result = await callModel(config.baseUrl, config.apiKey, {
      model: config.model,
      messages: [{ role: 'system', content: prompts.system }, { role: 'user', content: prompts.user }],
      temperature: 0.7, max_tokens: setting(c.env.AI_MAX_OUTPUT_TOKENS, 4096)
    }, quota.timeout);
    const content = validateOutput(result?.choices?.[0]?.message?.content, [config.apiKey, c.env.SECRET_KEY || '', c.env.OPENROUTER_API_KEY || '', prompts.system]);
    console.log('ai_completed', { userId: user.id, provider: body.provider,
      durationMs: Date.now() - started, tokens: Number.isFinite(result.usage?.total_tokens) ? result.usage.total_tokens : undefined });
    return c.json({ content, model: config.model, usedAi: body.provider, contextTruncated: prompts.truncated, remainingToday: quota.remaining });
  } finally { await quota.release(); }
});

// The existing painting link endpoint is also authenticated, bounded and rate limited.
aiRouter.post('/paint', async (c) => {
  const user = await getCurrentUser(c);
  if (!user) return c.json({ error: '请先登录' }, 401);
  const body = await limitedJSON(c.req.raw, setting(c.env.AI_MAX_INPUT_BYTES, 128 * 1024));
  const prompt = body.prompt || body.charName || 'anime character portrait';
  const style = body.style || 'anime';
  if (typeof prompt !== 'string' || typeof style !== 'string' || prompt.length > 8000 || style.length > 100) throw new AIError('绘图提示词格式不正确');
  validateGeneration({ task: 'field_gen', provider: 'public', prompt });
  const quota = await reserveAI(c, user.id, 'public');
  try {
    const seed = Math.floor(Math.random() * 1000000);
    const encoded = encodeURIComponent(`${prompt}, ${style} style, high resolution, detailed anime visual`);
    return c.json({ imageUrl: `https://image.pollinations.ai/prompt/${encoded}?model=flux-anime&width=768&height=1024&nologo=true&enhance=true&seed=${seed}`,
      prompt, style, usedModel: 'flux-anime' });
  } finally { await quota.release(); }
});
