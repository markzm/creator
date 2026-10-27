import { Hono } from 'hono';
import { getCurrentUser } from '../auth';
import type { Env } from '../types';

export const cocreationRouter = new Hono<{ Bindings: Env }>();

// GET /api/cocreation/projects
cocreationRouter.get('/projects', async (c) => {
  const user = await getCurrentUser(c);
  const mine = c.req.query('mine') === '1';
  const limit = Math.min(parseInt(c.req.query('limit') || '50', 10) || 50, 100);

  if (mine) {
    if (!user) {
      return c.json({ error: '请先登录' }, 401);
    }
    const { results } = await c.env.DB.prepare(`
      SELECT p.* FROM cocreation_projects p
      JOIN cocreation_members m ON p.id = m.project_id
      WHERE m.user_id = ?
      ORDER BY p.updated_at DESC
      LIMIT ?
    `).bind(user.id, limit).all<any>();

    const projects = (results || []).map(formatProject);
    return c.json({ projects });
  }

  const { results } = await c.env.DB.prepare(`
    SELECT * FROM cocreation_projects
    ORDER BY updated_at DESC
    LIMIT ?
  `).bind(limit).all<any>();

  const projects = (results || []).map(formatProject);
  return c.json({ projects });
});

function formatProject(p: any) {
  let admins: string[] = [];
  try {
    admins = JSON.parse(p.admins_json || '[]');
  } catch {
    // ignore
  }
  return {
    id: p.id,
    worldId: p.world_id,
    worldTitle: p.world_title,
    ownerId: p.owner_id,
    ownerName: p.owner_name,
    admins,
    summary: p.summary,
    isOpenDoujin: Boolean(p.is_open_doujin),
    createdAt: p.created_at,
    updatedAt: p.updated_at
  };
}

// POST /api/cocreation/projects
cocreationRouter.post('/projects', async (c) => {
  const user = await getCurrentUser(c);
  if (!user) {
    return c.json({ error: '请先登录后发起共创企划' }, 401);
  }

  const body = await c.req.json().catch(() => null);
  if (!body || !body.worldTitle || !body.worldTitle.trim()) {
    return c.json({ error: '世界观标题不能为空' }, 400);
  }

  const id = `cc_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const worldId = body.worldId || '';
  const worldTitle = body.worldTitle.trim().slice(0, 150);
  const summary = (body.summary || '').slice(0, 500);
  const now = Math.floor(Date.now() / 1000);

  const rawAdmins: string[] = Array.isArray(body.admins) ? body.admins.slice(0, 20) : [];
  const unresolved: string[] = [];
  const resolvedUserIds: number[] = [user.id];
  const validAdminEmails: string[] = [];

  for (const email of rawAdmins) {
    const e = email.trim().toLowerCase();
    if (!e) continue;
    const found = await c.env.DB.prepare('SELECT id, email FROM users WHERE email = ? COLLATE NOCASE').bind(e).first<{ id: number; email: string }>();
    if (found) {
      if (!resolvedUserIds.includes(found.id)) {
        resolvedUserIds.push(found.id);
        validAdminEmails.push(found.email);
      }
    } else {
      unresolved.push(e);
    }
  }

  await c.env.DB.prepare(`
    INSERT INTO cocreation_projects (
      id, world_id, world_title, owner_id, owner_name, admins_json, summary, is_open_doujin, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, worldId, worldTitle, user.id, user.nickname || '未命名创作者', JSON.stringify(validAdminEmails), summary, 1, now, now).run();

  // Add members
  for (const uid of resolvedUserIds) {
    const role = uid === user.id ? 'owner' : 'admin';
    await c.env.DB.prepare(`
      INSERT OR IGNORE INTO cocreation_members (project_id, user_id, role, created_at)
      VALUES (?, ?, ?, ?)
    `).bind(id, uid, role, now).run();
  }

  const projRow = await c.env.DB.prepare('SELECT * FROM cocreation_projects WHERE id = ?').bind(id).first();
  return c.json({
    project: formatProject(projRow),
    unresolved
  }, 201);
});

// GET /api/cocreation/projects/:id
cocreationRouter.get('/projects/:id', async (c) => {
  const id = c.req.param('id');
  const proj = await c.env.DB.prepare('SELECT * FROM cocreation_projects WHERE id = ?').bind(id).first();
  if (!proj) {
    return c.json({ error: '企划不存在' }, 404);
  }
  return c.json({ project: formatProject(proj) });
});

// PATCH /api/cocreation/projects/:id
cocreationRouter.patch('/projects/:id', async (c) => {
  const user = await getCurrentUser(c);
  if (!user) {
    return c.json({ error: '请先登录' }, 401);
  }

  const id = c.req.param('id');
  const proj = await c.env.DB.prepare('SELECT * FROM cocreation_projects WHERE id = ?').bind(id).first<any>();
  if (!proj) {
    return c.json({ error: '企划不存在' }, 404);
  }

  if (proj.owner_id !== user.id && !user.is_admin) {
    return c.json({ error: '只有企划发起人或超级管理员可以修改' }, 403);
  }

  const body = await c.req.json().catch(() => ({}));
  const now = Math.floor(Date.now() / 1000);

  let summary = proj.summary;
  let isOpenDoujin = proj.is_open_doujin;

  if (typeof body.summary === 'string') {
    summary = body.summary.slice(0, 500);
  }
  if (typeof body.isOpenDoujin === 'boolean') {
    isOpenDoujin = body.isOpenDoujin ? 1 : 0;
  }

  await c.env.DB.prepare(`
    UPDATE cocreation_projects SET summary = ?, is_open_doujin = ?, updated_at = ?
    WHERE id = ?
  `).bind(summary, isOpenDoujin, now, id).run();

  const updated = await c.env.DB.prepare('SELECT * FROM cocreation_projects WHERE id = ?').bind(id).first();
  return c.json({ ok: true, project: formatProject(updated) });
});

// PUT /api/cocreation/projects/:id/admins
cocreationRouter.put('/projects/:id/admins', async (c) => {
  const user = await getCurrentUser(c);
  if (!user) {
    return c.json({ error: '请先登录' }, 401);
  }

  const id = c.req.param('id');
  const proj = await c.env.DB.prepare('SELECT * FROM cocreation_projects WHERE id = ?').bind(id).first<any>();
  if (!proj) {
    return c.json({ error: '企划不存在' }, 404);
  }
  if (proj.owner_id !== user.id && !user.is_admin) {
    return c.json({ error: '只有企划发起人可以增删管理员' }, 403);
  }

  const body = await c.req.json().catch(() => ({}));
  const emails: string[] = Array.isArray(body.emails) ? body.emails : Array.isArray(body.admins) ? body.admins : [];
  const unresolved: string[] = [];
  const validAdminEmails: string[] = [];
  const newAdminUserIds: number[] = [];

  for (const email of emails) {
    const e = email.trim().toLowerCase();
    if (!e) continue;
    const found = await c.env.DB.prepare('SELECT id, email FROM users WHERE email = ? COLLATE NOCASE').bind(e).first<{ id: number; email: string }>();
    if (found) {
      if (found.id !== proj.owner_id && !newAdminUserIds.includes(found.id)) {
        newAdminUserIds.push(found.id);
        validAdminEmails.push(found.email);
      }
    } else {
      unresolved.push(e);
    }
  }

  const now = Math.floor(Date.now() / 1000);
  await c.env.DB.prepare('DELETE FROM cocreation_members WHERE project_id = ? AND role = ?').bind(id, 'admin').run();

  for (const uid of newAdminUserIds) {
    await c.env.DB.prepare(`
      INSERT OR REPLACE INTO cocreation_members (project_id, user_id, role, created_at)
      VALUES (?, ?, ?, ?)
    `).bind(id, uid, 'admin', now).run();
  }

  await c.env.DB.prepare(`
    UPDATE cocreation_projects SET admins_json = ?, updated_at = ? WHERE id = ?
  `).bind(JSON.stringify(validAdminEmails), now, id).run();

  const updated = await c.env.DB.prepare('SELECT * FROM cocreation_projects WHERE id = ?').bind(id).first();
  return c.json({
    ok: true,
    unresolved,
    project: formatProject(updated)
  });
});

// GET /api/cocreation/projects/:id/queue
cocreationRouter.get('/projects/:id/queue', async (c) => {
  const user = await getCurrentUser(c);
  if (!user) {
    return c.json({ error: '请先登录' }, 401);
  }

  const id = c.req.param('id');
  const member = await c.env.DB.prepare(
    'SELECT role FROM cocreation_members WHERE project_id = ? AND user_id = ?'
  ).bind(id, user.id).first();

  if (!member && !user.is_admin) {
    return c.json({ error: '只有企划成员可以查看审核队列' }, 403);
  }

  const status = c.req.query('status') || 'pending';
  const limit = Math.min(parseInt(c.req.query('limit') || '50', 10) || 50, 100);

  let sql = `
    SELECT id, user_id as userId, owner_name as ownerName, kind, title, summary,
           content, draft_code as draftCode, visibility, entity_id as entityId, tags,
           word_count as wordCount, canon_status as canonStatus, cocreation_id as cocreationId,
           canon_requested as canonRequested, tachi_e_url as tachiEUrl, canon_review as canonReview,
           reviewed_by as reviewedBy, reviewed_at as reviewedAt, created_at as createdAt, updated_at as updatedAt
    FROM world_shares
    WHERE cocreation_id = ?
  `;
  const params: any[] = [id];

  if (status !== 'all') {
    sql += ' AND canon_review = ?';
    params.push(status);
  }
  sql += ' ORDER BY created_at DESC LIMIT ?';
  params.push(limit);

  const { results } = await c.env.DB.prepare(sql).bind(...params).all();
  return c.json({ shares: results || [] });
});

// POST /api/cocreation/shares/:id/request-canon
cocreationRouter.post('/shares/:id/request-canon', async (c) => {
  const user = await getCurrentUser(c);
  if (!user) {
    return c.json({ error: '请先登录' }, 401);
  }

  const shareId = c.req.param('id');
  const share = await c.env.DB.prepare('SELECT * FROM world_shares WHERE id = ?').bind(shareId).first<any>();
  if (!share) {
    return c.json({ error: '作品不存在' }, 404);
  }
  if (share.user_id !== user.id) {
    return c.json({ error: '只有作者本人可以申请转正' }, 403);
  }
  if (!share.cocreation_id) {
    return c.json({ error: '该作品不属于任何共创企划' }, 400);
  }

  const now = Math.floor(Date.now() / 1000);
  await c.env.DB.prepare(`
    UPDATE world_shares SET canon_requested = 1, canon_review = 'pending', updated_at = ?
    WHERE id = ?
  `).bind(now, shareId).run();

  return c.json({ ok: true });
});

// POST /api/cocreation/shares/:id/approve-canon
cocreationRouter.post('/shares/:id/approve-canon', async (c) => {
  const user = await getCurrentUser(c);
  if (!user) {
    return c.json({ error: '请先登录' }, 401);
  }

  const shareId = c.req.param('id');
  const share = await c.env.DB.prepare('SELECT * FROM world_shares WHERE id = ?').bind(shareId).first<any>();
  if (!share) {
    return c.json({ error: '作品不存在' }, 404);
  }

  const member = await c.env.DB.prepare(
    'SELECT role FROM cocreation_members WHERE project_id = ? AND user_id = ?'
  ).bind(share.cocreation_id, user.id).first();

  if (!member && !user.is_admin) {
    return c.json({ error: '只有企划成员或管理员可以审核' }, 403);
  }

  const now = Math.floor(Date.now() / 1000);
  await c.env.DB.prepare(`
    UPDATE world_shares SET
      canon_status = 'canon', canon_review = 'approved',
      reviewed_by = ?, reviewed_at = ?, updated_at = ?
    WHERE id = ?
  `).bind(user.id, now, now, shareId).run();

  // Create notification for author
  await c.env.DB.prepare(`
    INSERT INTO notifications (user_id, sender_id, sender_name, type, title, content, target_id, target_kind, is_read, created_at)
    VALUES (?, ?, ?, 'canon_approved', '转正审核通过', ?, ?, 'share', 0, ?)
  `).bind(share.user_id, user.id, user.nickname || '管理员', `您的同人设定《${share.title}》已通过企划正史转正审核！`, shareId, now).run();

  return c.json({ ok: true });
});

// POST /api/cocreation/shares/:id/reject-canon
cocreationRouter.post('/shares/:id/reject-canon', async (c) => {
  const user = await getCurrentUser(c);
  if (!user) {
    return c.json({ error: '请先登录' }, 401);
  }

  const shareId = c.req.param('id');
  const share = await c.env.DB.prepare('SELECT * FROM world_shares WHERE id = ?').bind(shareId).first<any>();
  if (!share) {
    return c.json({ error: '作品不存在' }, 404);
  }

  const member = await c.env.DB.prepare(
    'SELECT role FROM cocreation_members WHERE project_id = ? AND user_id = ?'
  ).bind(share.cocreation_id, user.id).first();

  if (!member && !user.is_admin) {
    return c.json({ error: '只有企划成员或管理员可以审核' }, 403);
  }

  const now = Math.floor(Date.now() / 1000);
  await c.env.DB.prepare(`
    UPDATE world_shares SET
      canon_review = 'rejected', reviewed_by = ?, reviewed_at = ?, updated_at = ?
    WHERE id = ?
  `).bind(user.id, now, now, shareId).run();

  return c.json({ ok: true });
});

// ----------------------------------------------------
// Notifications
// ----------------------------------------------------

// GET /api/notifications
cocreationRouter.get('/notifications', async (c) => {
  const user = await getCurrentUser(c);
  if (!user) {
    return c.json({ error: '请先登录' }, 401);
  }

  const limit = Math.min(parseInt(c.req.query('limit') || '30', 10) || 30, 100);

  const { results } = await c.env.DB.prepare(`
    SELECT id, user_id as userId, sender_id as senderId, sender_name as senderName,
           type, title, content, target_id as targetId, target_kind as targetKind,
           is_read as isRead, created_at as createdAt
    FROM notifications
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `).bind(user.id, limit).all();

  const unreadRes = await c.env.DB.prepare(
    'SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0'
  ).bind(user.id).first<{ count: number }>();

  return c.json({
    notifications: results || [],
    unreadCount: unreadRes?.count || 0
  });
});

// POST /api/notifications/read-all
cocreationRouter.post('/notifications/read-all', async (c) => {
  const user = await getCurrentUser(c);
  if (!user) {
    return c.json({ error: '请先登录' }, 401);
  }

  await c.env.DB.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').bind(user.id).run();
  return c.json({ ok: true });
});

// POST /api/notifications/:id/read
cocreationRouter.post('/notifications/:id/read', async (c) => {
  const user = await getCurrentUser(c);
  if (!user) {
    return c.json({ error: '请先登录' }, 401);
  }

  const id = parseInt(c.req.param('id'), 10);
  await c.env.DB.prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?').bind(id, user.id).run();
  return c.json({ ok: true });
});
