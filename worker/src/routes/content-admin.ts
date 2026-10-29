import { AIError, limitedJSON } from '../ai-guards';
import { Hono } from 'hono';
import { getCurrentUser } from '../auth';
import type { Env } from '../types';
import { boundedInt, invalidatePublic } from '../public-cache';
import { documentHash, legacyDocumentMatches, pruneRevisions, validDocument } from '../documents';

export const contentAdminRouter = new Hono<{ Bindings: Env }>();
contentAdminRouter.use('*', async (c, next) => {
  const user = await getCurrentUser(c);
  if (!user) return c.json({ error: '请先登录' }, 401);
  if (!user.is_super_admin) return c.json({ error: '只有超级管理员可管理全部云端创作' }, 403);
  if (!Number(c.req.path.match(/\/content\/(\d+)\//)?.[1])) return c.json({ error: '用户 ID 无效' }, 400);
  await next();
});

contentAdminRouter.get('/:userId/document', async (c) => {
  const row = await c.env.DB.prepare('SELECT rev, doc_json, updated_at FROM user_docs WHERE user_id = ?')
    .bind(Number(c.req.param('userId'))).first<{ rev: number; doc_json: string; updated_at: number }>();
  if (!row) return c.body(null, 204);
  return c.json({ data: JSON.parse(row.doc_json), rev: row.rev, updatedAt: row.updated_at });
});

contentAdminRouter.put('/:userId/document', async (c) => {
  const user = (await getCurrentUser(c))!;
  const ownerId = Number(c.req.param('userId'));
  let body: any;
  try { body = await limitedJSON(c.req.raw, 1_900_000); }
  catch (error) { return c.json({ error: error instanceof AIError ? error.message : '无法读取文档' }, error instanceof AIError ? error.status as any : 400); }
  if (!body || !Number.isSafeInteger(body.baseRev) || !validDocument(body.data)) return c.json({ error: '文档或版本格式不正确' }, 400);
  const raw = JSON.stringify(body.data);
  const bytes = new TextEncoder().encode(raw).length;
  if (bytes > 1_800_000) return c.json({ error: '文档体积超过 1.8MB 上限' }, 413);
  const hash = await documentHash(body.data);
  const current = await c.env.DB.prepare('SELECT rev, content_hash, updated_at FROM user_docs WHERE user_id = ?')
    .bind(ownerId).first<{ rev: number; content_hash: string; updated_at: number }>();
  if (!current || current.rev !== body.baseRev) return c.json({ error: '云端版本已变化，请保留草稿后重新载入', latest: current && { rev: current.rev, updatedAt: current.updated_at } }, 409);
  if (!current.content_hash && await legacyDocumentMatches(c.env.DB, ownerId, body.baseRev, hash)) {
    const saved = await c.env.DB.prepare('UPDATE user_docs SET content_hash = ? WHERE user_id = ? AND rev = ?').bind(hash, ownerId, body.baseRev).run();
    if (!saved.meta.changes) return c.json({ error: '云端版本已变化，请保留当前草稿' }, 409);
    return c.json({ rev: current.rev, updatedAt: current.updated_at });
  }
  if (current.content_hash === hash) return c.json({ rev: current.rev, updatedAt: current.updated_at });
  const now = Math.floor(Date.now() / 1000);
  const results = await c.env.DB.batch([
    c.env.DB.prepare(`INSERT INTO doc_revisions (user_id, rev, byte_size, summary, doc_json, created_at)
      SELECT user_id, rev, byte_size, '管理员修改前快照', doc_json, ? FROM user_docs WHERE user_id = ? AND rev = ?`)
      .bind(now, ownerId, body.baseRev),
    c.env.DB.prepare(`INSERT INTO admin_content_audit (actor_id, owner_id, target_kind, target_id, action, base_rev, before_json, created_at)
      SELECT ?, user_id, 'document', CAST(user_id AS TEXT), 'update', rev, doc_json, ? FROM user_docs WHERE user_id = ? AND rev = ?`)
      .bind(user.id, now, ownerId, body.baseRev),
    c.env.DB.prepare(`UPDATE user_docs SET doc_json = ?, byte_size = ?, content_hash = ?, updated_at = ?, rev = rev + 1
      WHERE user_id = ? AND rev = ?`).bind(raw, bytes, hash, now, ownerId, body.baseRev),
    pruneRevisions(c.env.DB, ownerId, now)
  ]);
  if (!results[2].meta.changes) {
    const latest = await c.env.DB.prepare('SELECT rev, updated_at FROM user_docs WHERE user_id = ?').bind(ownerId).first();
    return c.json({ error: '作者已修改云端内容，请保留草稿并重新载入后合并', latest }, 409);
  }
  invalidatePublic(c.env.DB);
  return c.json({ rev: body.baseRev + 1, updatedAt: now });
});

contentAdminRouter.get('/:userId/shares', async (c) => {
  const ownerId = Number(c.req.param('userId'));
  const page = boundedInt(c.req.query('page'), 1, 100000);
  const limit = 20;
  const result = await c.env.DB.batch([
    c.env.DB.prepare(`SELECT id, user_id as userId, kind, title, summary, visibility, entity_id as entityId,
      rev, created_at as createdAt, updated_at as updatedAt FROM world_shares WHERE user_id = ?
      ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`).bind(ownerId, limit, (page - 1) * limit),
    c.env.DB.prepare('SELECT COUNT(*) as total FROM world_shares WHERE user_id = ?').bind(ownerId)
  ]);
  return c.json({ shares: result[0].results, total: Number((result[1].results[0] as any).total), page, limit });
});
