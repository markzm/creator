import { Hono, type Context } from 'hono';
import { getCurrentUser } from '../auth';
import type { Env } from '../types';

export const referenceRouter = new Hono<{ Bindings: Env }>();

const DEFAULT_REFERENCE = {
  _version: 6,
  worlds: {},
  orgs: {},
  chars: {},
  rules: {}
};

async function getStoredReference(c: Context<{ Bindings: Env }>): Promise<any> {
  const row = await c.env.DB.prepare(
    "SELECT value FROM site_settings WHERE key = 'seed_json'"
  ).first<{ value: string }>();

  if (row && row.value) {
    try {
      return JSON.parse(row.value);
    } catch {
      // ignore
    }
  }

  if (c.env.AVATARS) {
    const r2Obj = await c.env.AVATARS.get('seed.json');
    if (r2Obj) {
      const text = await r2Obj.text();
      try {
        return JSON.parse(text);
      } catch {
        // ignore
      }
    }
  }

  return DEFAULT_REFERENCE;
}

// GET /api/seed and /api/reference-materials
referenceRouter.get('/seed', async (c) => {
  const ref = await getStoredReference(c);
  return c.json(ref);
});

referenceRouter.get('/reference-materials', async (c) => {
  const ref = await getStoredReference(c);
  return c.json(ref);
});

// PUT /api/admin/reference-materials
referenceRouter.put('/admin/reference-materials', async (c) => {
  const user = await getCurrentUser(c);
  if (!user) {
    return c.json({ error: '请先登录' }, 401);
  }
  if (!user.is_admin) {
    return c.json({ error: '权限不足：只有网站管理员才能修改全站官方公共参考素材' }, 403);
  }

  const body = await c.req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return c.json({ error: '素材格式必须是合法的 JSON 设定集' }, 400);
  }

  const rawJSON = JSON.stringify(body);
  const now = Math.floor(Date.now() / 1000);

  await c.env.DB.prepare(`
    INSERT INTO site_settings (key, value, updated_at)
    VALUES ('seed_json', ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).bind(rawJSON, now).run();

  if (c.env.AVATARS) {
    await c.env.AVATARS.put('seed.json', rawJSON, {
      httpMetadata: { contentType: 'application/json' }
    });
  }

  return c.json({
    status: 'ok',
    message: '全站官方公共参考素材已成功更新'
  });
});

// POST /api/admin/reference-materials/item
referenceRouter.post('/admin/reference-materials/item', async (c) => {
  const user = await getCurrentUser(c);
  if (!user || !user.is_admin) {
    return c.json({ error: '权限不足' }, 403);
  }

  const body = await c.req.json().catch(() => null);
  if (!body || !body.kind || !body.item || !body.item.id) {
    return c.json({ error: '请求参数不完整' }, 400);
  }

  const doc = await getStoredReference(c);
  const kind = body.kind; // 'worlds' | 'orgs' | 'chars' | 'rules'
  if (!doc[kind]) doc[kind] = {};
  doc[kind][body.item.id] = body.item;

  const rawJSON = JSON.stringify(doc);
  const now = Math.floor(Date.now() / 1000);

  await c.env.DB.prepare(`
    INSERT INTO site_settings (key, value, updated_at)
    VALUES ('seed_json', ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).bind(rawJSON, now).run();

  return c.json({ ok: true, message: '添加素材成功' });
});

// DELETE /api/admin/reference-materials/item
referenceRouter.delete('/admin/reference-materials/item', async (c) => {
  const user = await getCurrentUser(c);
  if (!user || !user.is_admin) {
    return c.json({ error: '权限不足' }, 403);
  }

  const kind = c.req.query('kind') || '';
  const id = c.req.query('id') || '';
  if (!kind || !id) {
    return c.json({ error: '缺少 kind 或 id 参数' }, 400);
  }

  const doc = await getStoredReference(c);
  if (doc[kind] && doc[kind][id]) {
    delete doc[kind][id];
    const rawJSON = JSON.stringify(doc);
    const now = Math.floor(Date.now() / 1000);
    await c.env.DB.prepare(`
      INSERT INTO site_settings (key, value, updated_at)
      VALUES ('seed_json', ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).bind(rawJSON, now).run();
  }

  return c.json({ ok: true, message: '删除素材成功' });
});
