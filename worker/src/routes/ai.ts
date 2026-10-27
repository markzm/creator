import { Hono } from 'hono';
import { decryptUserConfig, getCurrentUser } from '../auth';
import type { Env } from '../types';

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
    if (u.protocol !== 'https:') return false;
    const hostname = u.hostname.toLowerCase();

    const allowed = [...DEFAULT_ALLOWED_HOSTS];
    if (envAllowed) {
      for (const h of envAllowed.split(',')) {
        const trimmed = h.trim().toLowerCase();
        if (trimmed) allowed.push(trimmed);
      }
    }

    return allowed.some((ah) => hostname === ah || hostname.endsWith('.' + ah));
  } catch {
    return false;
  }
}

// GET /api/ai/status
aiRouter.get('/status', (c) => {
  const publicReady = Boolean(c.env.OPENROUTER_API_KEY && c.env.OPENROUTER_API_KEY.trim());
  return c.json({
    publicReady,
    freeModels: ['openrouter/free'],
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

// POST /api/ai/test
aiRouter.post('/test', async (c) => {
  const user = await getCurrentUser(c);
  if (!user) {
    return c.json({ error: '请先登录' }, 401);
  }

  const body = await c.req.json().catch(() => null);
  if (!body || !body.baseUrl || !body.apiKey) {
    return c.json({ error: '缺少 baseUrl 或 apiKey' }, 400);
  }

  const baseUrl = body.baseUrl.trim();
  if (!isHostAllowed(baseUrl, c.env.ALLOWED_AI_HOSTS)) {
    return c.json({ error: '不支持的 AI 接口地址：仅允许 https 访问受信任的 AI 服务商域名' }, 400);
  }

  const model = body.model || 'deepseek-chat';
  const endpoint = baseUrl.replace(/\/+$/, '') + '/chat/completions';

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${body.apiKey.trim()}`
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'Hi' }],
        max_tokens: 5
      })
    });

    if (!res.ok) {
      const errText = await res.text();
      return c.json({ ok: false, message: `服务商返回错误 (HTTP ${res.status}): ${errText.slice(0, 100)}` }, 400);
    }

    return c.json({ ok: true, message: 'AI 服务商接口连接成功！' });
  } catch (e: any) {
    return c.json({ ok: false, message: `连接超时或网络异常: ${e?.message || '未知错误'}` }, 500);
  }
});

// POST /api/ai/generate
aiRouter.post('/generate', async (c) => {
  const user = await getCurrentUser(c);
  if (!user) {
    return c.json({ error: '请先登录' }, 401);
  }

  const body = await c.req.json().catch(() => null);
  if (!body || !body.task) {
    return c.json({ error: '请求格式错误' }, 400);
  }

  let customAi = body.customAi;
  const secretKey = c.env.SECRET_KEY || 'creator-secret-change-in-wrangler-secrets';

  // Fallback to cloud saved config
  if ((!customAi || !customAi.apiKey) && user.ai_config_enc) {
    try {
      const dec = await decryptUserConfig(user.ai_config_enc, secretKey);
      if (dec) {
        const parsed = JSON.parse(dec);
        if (parsed.apiKey) {
          customAi = parsed;
        }
      }
    } catch {
      // ignore
    }
  }

  if (!customAi || !customAi.apiKey) {
    return c.json({ error: '请先在个人中心配置您的 AI Key，或在弹窗中临时填写' }, 400);
  }

  const baseUrl = (customAi.baseUrl || 'https://api.deepseek.com/v1').trim();
  if (!isHostAllowed(baseUrl, c.env.ALLOWED_AI_HOSTS)) {
    return c.json({ error: '不支持的 AI 接口地址：仅允许 https 访问受信任的 AI 服务商域名' }, 400);
  }

  const model = customAi.model || 'deepseek-chat';
  const endpoint = baseUrl.replace(/\/+$/, '') + '/chat/completions';

  const systemPrompt = '你是一位严谨的世界观架构师与小说设定助理，请直接输出设定正文，不要寒暄，不要发散。';
  const userPrompt = body.prompt || `请根据以下信息补全设定：${JSON.stringify(body.entityData || {})}`;

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${customAi.apiKey.trim()}`
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.7
      })
    });

    if (!res.ok) {
      const errText = await res.text();
      return c.json({ error: `AI 服务商调用失败 (${res.status}): ${errText.slice(0, 150)}` }, 500);
    }

    const json: any = await res.json();
    const content = json?.choices?.[0]?.message?.content || '';

    return c.json({
      content,
      model,
      usedAi: 'custom'
    });
  } catch (e: any) {
    return c.json({ error: `AI 请求超时或连接失败: ${e?.message || '未知错误'}` }, 500);
  }
});

// POST /api/ai/paint
aiRouter.post('/paint', async (c) => {
  const user = await getCurrentUser(c);
  if (!user) {
    return c.json({ error: '请先登录' }, 401);
  }

  const body = await c.req.json().catch(() => ({}));
  const prompt = body.prompt || body.charName || 'anime character portrait, masterpiece';
  const style = body.style || 'anime';

  // High quality pollinations.ai anime endpoint
  const seed = Math.floor(Math.random() * 1000000);
  const encodedPrompt = encodeURIComponent(`${prompt}, ${style} style, high resolution, detailed anime visual`);
  const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?model=flux-anime&width=768&height=1024&nologo=true&enhance=true&seed=${seed}`;

  return c.json({
    imageUrl,
    prompt,
    style,
    usedModel: 'flux-anime'
  });
});
