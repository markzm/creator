import { Hono } from 'hono';
import { decryptUserConfig, encryptUserConfig, getCurrentUser } from '../auth';
import type { Env, UserRow } from '../types';
import { toAuthUser } from '../types';

export const meRouter = new Hono<{ Bindings: Env }>();

function isAllowedAvatarValue(userId: number, val: string): boolean {
  const v = val.trim();
  if (!v) return true;
  const ownPattern = new RegExp(`^/avatars/u_${userId}_\\d+\\.(jpg|jpeg|png)$`);
  if (ownPattern.test(v)) return true;
  if (/[\/:<>"'`\\]/.test(v)) return false;
  return Array.from(v).length <= 4;
}

// GET /api/me
meRouter.get('/', async (c) => {
  const user = await getCurrentUser(c);
  if (!user) {
    return c.json({ error: '请先登录' }, 401);
  }
  return c.json({ user: toAuthUser(user) });
});

// PATCH /api/me
meRouter.patch('/', async (c) => {
  const user = await getCurrentUser(c);
  if (!user) {
    return c.json({ error: '请先登录' }, 401);
  }

  const body = await c.req.json().catch(() => null);
  if (!body) {
    return c.json({ error: '请求格式错误' }, 400);
  }

  let nickname = user.nickname;
  let avatarUrl = user.avatar_url;
  let bio = user.bio;

  if (typeof body.name === 'string') {
    const n = body.name.trim();
    if (n) nickname = n.slice(0, 50);
  }

  if (typeof body.avatar === 'string') {
    if (!isAllowedAvatarValue(user.id, body.avatar)) {
      return c.json({ error: '头像只能是表情符号或通过上传接口获得的头像地址' }, 400);
    }
    avatarUrl = body.avatar.trim();
  }

  if (typeof body.bio === 'string') {
    bio = body.bio.trim().slice(0, 300);
  }

  const now = Math.floor(Date.now() / 1000);
  await c.env.DB.prepare(`
    UPDATE users SET nickname = ?, avatar_url = ?, bio = ?, updated_at = ?
    WHERE id = ?
  `).bind(nickname, avatarUrl, bio, now, user.id).run();

  const updated = await c.env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(user.id).first<UserRow>();
  return c.json({ user: toAuthUser(updated!) });
});

// POST /api/me/avatar
meRouter.post('/avatar', async (c) => {
  const user = await getCurrentUser(c);
  if (!user) {
    return c.json({ error: '请先登录' }, 401);
  }

  const formData = await c.req.formData().catch(() => null);
  if (!formData) {
    return c.json({ error: '未找到表单数据' }, 400);
  }

  const rawFile = formData.get('avatar');
  if (!rawFile || typeof rawFile === 'string') {
    return c.json({ error: '未找到上传文件字段 avatar' }, 400);
  }
  const file = rawFile as unknown as { size: number; arrayBuffer(): Promise<ArrayBuffer> };

  if (file.size > 2 * 1024 * 1024) {
    return c.json({ error: '头像图片不能超过 2MB' }, 400);
  }

  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  if (bytes.length < 16) {
    return c.json({ error: '读取图片内容失败' }, 400);
  }

  const isJPEG = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const isPNG = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  if (!isJPEG && !isPNG) {
    return c.json({ error: '仅支持 JPEG 或 PNG 格式图片' }, 400);
  }

  const ext = isPNG ? 'png' : 'jpg';
  const fileName = `u_${user.id}_${Date.now()}.${ext}`;

  if (c.env.AVATARS) {
    await c.env.AVATARS.put(fileName, arrayBuffer, {
      httpMetadata: {
        contentType: isPNG ? 'image/png' : 'image/jpeg'
      }
    });
  }

  const newUrl = `/avatars/${fileName}`;
  const now = Math.floor(Date.now() / 1000);
  await c.env.DB.prepare(`
    UPDATE users SET avatar_url = ?, updated_at = ? WHERE id = ?
  `).bind(newUrl, now, user.id).run();

  const updated = await c.env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(user.id).first<UserRow>();
  return c.json({
    avatar: newUrl,
    user: toAuthUser(updated!)
  });
});

// GET /api/me/ai-config
meRouter.get('/ai-config', async (c) => {
  const user = await getCurrentUser(c);
  if (!user) {
    return c.json({ error: '请先登录' }, 401);
  }

  let customAi: any = null;
  const secretKey = c.env.SECRET_KEY || 'creator-secret-change-in-wrangler-secrets';

  if (user.ai_config_enc) {
    try {
      const decStr = await decryptUserConfig(user.ai_config_enc, secretKey);
      if (decStr) {
        const parsed = JSON.parse(decStr);
        const hasKey = Boolean(parsed.apiKey && parsed.apiKey.trim());
        let masked = '';
        if (hasKey) {
          const k = parsed.apiKey.trim();
          masked = k.length > 8 ? '••••••••' + k.slice(-4) : '••••••••';
        }
        customAi = {
          provider: parsed.provider || 'custom',
          baseUrl: parsed.baseUrl || '',
          model: parsed.model || '',
          hasKey,
          apiKeyMasked: masked
        };
      }
    } catch {
      // ignore decryption failure
    }
  }

  let preferences: any = null;
  if (user.custom_prefs_json) {
    try {
      preferences = JSON.parse(user.custom_prefs_json);
    } catch {
      // ignore
    }
  }

  return c.json({ customAi, preferences });
});

// PUT /api/me/ai-config
meRouter.put('/ai-config', async (c) => {
  const user = await getCurrentUser(c);
  if (!user) {
    return c.json({ error: '请先登录' }, 401);
  }

  const body = await c.req.json().catch(() => null);
  if (!body) {
    return c.json({ error: '请求格式错误' }, 400);
  }

  const secretKey = c.env.SECRET_KEY || 'creator-secret-change-in-wrangler-secrets';
  let encAi = user.ai_config_enc || '';

  if (body.clearKey) {
    encAi = '';
  } else if (body.customAi) {
    let existingKey = '';
    if (user.ai_config_enc) {
      try {
        const dec = await decryptUserConfig(user.ai_config_enc, secretKey);
        if (dec) {
          const old = JSON.parse(dec);
          existingKey = old.apiKey || '';
        }
      } catch {
        // ignore
      }
    }

    const payload = {
      provider: body.customAi.provider || 'custom',
      baseUrl: body.customAi.baseUrl || '',
      model: body.customAi.model || '',
      apiKey: body.customAi.apiKey ? body.customAi.apiKey.trim() : existingKey
    };
    encAi = await encryptUserConfig(JSON.stringify(payload), secretKey);
  }

  let prefsJson = user.custom_prefs_json || '{}';
  if (body.preferences !== undefined) {
    prefsJson = JSON.stringify(body.preferences);
  }

  const now = Math.floor(Date.now() / 1000);
  await c.env.DB.prepare(`
    UPDATE users SET ai_config_enc = ?, custom_prefs_json = ?, updated_at = ?
    WHERE id = ?
  `).bind(encAi, prefsJson, now, user.id).run();

  return c.json({ ok: true });
});
