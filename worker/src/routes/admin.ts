import { Hono } from 'hono';
import { getCurrentUser } from '../auth';
import type { Env, UserRow } from '../types';
import { toAuthUser } from '../types';

export const adminRouter = new Hono<{ Bindings: Env }>();

// GET /api/admin/users
adminRouter.get('/users', async (c) => {
  const user = await getCurrentUser(c);
  if (!user) {
    return c.json({ error: '请先登录' }, 401);
  }
  if (!user.is_admin) {
    return c.json({ error: '只有管理员可访问管理面板' }, 403);
  }

  const { results } = await c.env.DB.prepare(`
    SELECT * FROM users ORDER BY id ASC
  `).all<UserRow>();

  const users = (results || []).map(toAuthUser);
  return c.json({ users });
});

type AdminCheckResult =
  | { ok: false; status: number; error: string }
  | { ok: true; user: UserRow; target: UserRow };

async function checkAdminHierarchy(c: any, targetId: number): Promise<AdminCheckResult> {
  const user = await getCurrentUser(c);
  if (!user) {
    return { ok: false, status: 401, error: '请先登录' };
  }
  if (!user.is_admin) {
    return { ok: false, status: 403, error: '只有管理员可访问管理面板' };
  }
  if (user.id === targetId) {
    return { ok: false, status: 400, error: '不能对自己执行管理操作' };
  }

  const target = (await c.env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(targetId).first()) as UserRow | null;
  if (!target) {
    return { ok: false, status: 404, error: '用户不存在' };
  }
  if (target.is_super_admin) {
    return { ok: false, status: 403, error: '不能对超级管理员执行管理操作' };
  }
  if (target.is_admin && !user.is_super_admin) {
    return { ok: false, status: 403, error: '只有超级管理员可以处置其他管理员' };
  }

  return { ok: true, user, target };
}

// PUT /api/admin/users/:id/role
adminRouter.put('/users/:id/role', async (c) => {
  const targetId = parseInt(c.req.param('id'), 10);
  const check = await checkAdminHierarchy(c, targetId);
  if (!check.ok) return c.json({ error: check.error }, check.status as any);

  if (!check.user.is_super_admin) {
    return c.json({ error: '权限不足：只有超级管理员才能增减管理员' }, 403);
  }

  const body = await c.req.json().catch(() => ({}));
  const isAdmin = body.isAdmin ? 1 : 0;
  const now = Math.floor(Date.now() / 1000);

  await c.env.DB.prepare('UPDATE users SET is_admin = ?, updated_at = ? WHERE id = ?').bind(isAdmin, now, targetId).run();
  return c.json({ ok: true });
});

// POST /api/admin/users/:id/mute
adminRouter.post('/users/:id/mute', async (c) => {
  const targetId = parseInt(c.req.param('id'), 10);
  const check = await checkAdminHierarchy(c, targetId);
  if (!check.ok) return c.json({ error: check.error }, check.status as any);

  const body = await c.req.json().catch(() => ({}));
  const isMuted = body.isMuted ? 1 : 0;
  const reason = (body.reason || '').slice(0, 200);
  const now = Math.floor(Date.now() / 1000);

  await c.env.DB.prepare(`
    UPDATE users SET is_muted = ?, muted_reason = ?, updated_at = ? WHERE id = ?
  `).bind(isMuted, reason, now, targetId).run();

  return c.json({ ok: true });
});

// POST /api/admin/users/:id/status
adminRouter.post('/users/:id/status', async (c) => {
  const targetId = parseInt(c.req.param('id'), 10);
  const check = await checkAdminHierarchy(c, targetId);
  if (!check.ok) return c.json({ error: check.error }, check.status as any);

  const body = await c.req.json().catch(() => ({}));
  const isDisabled = body.isDisabled ? 1 : 0;
  const now = Math.floor(Date.now() / 1000);

  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE users SET is_disabled = ?, updated_at = ? WHERE id = ?').bind(isDisabled, now, targetId),
    c.env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(targetId)
  ]);

  return c.json({ ok: true });
});

// POST /api/admin/users/:id/lift
adminRouter.post('/users/:id/lift', async (c) => {
  const targetId = parseInt(c.req.param('id'), 10);
  const check = await checkAdminHierarchy(c, targetId);
  if (!check.ok) return c.json({ error: check.error }, check.status as any);

  const now = Math.floor(Date.now() / 1000);
  await c.env.DB.prepare(`
    UPDATE users SET is_muted = 0, muted_reason = '', is_disabled = 0, updated_at = ? WHERE id = ?
  `).bind(now, targetId).run();

  return c.json({ ok: true });
});
