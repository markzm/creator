import { AIError, limitedJSON } from '../ai-guards';
import { Hono } from 'hono';
import { getCurrentUser } from '../auth';
import type { Env } from '../types';

export const syncRouter = new Hono<{ Bindings: Env }>();

import { documentHash, legacyDocumentMatches, documentSummary, pruneRevisions, validDocument } from '../documents';
import { invalidatePublic } from '../public-cache';

// GET /api/sync
syncRouter.get('/', async (c) => {
  const user = await getCurrentUser(c);
  if (!user) {
    return c.json({ error: '请先登录' }, 401);
  }

  const doc = await c.env.DB.prepare(
    'SELECT rev, doc_json, updated_at FROM user_docs WHERE user_id = ?'
  ).bind(user.id).first<{ rev: number; doc_json: string; updated_at: number }>();

  if (!doc) {
    return c.body(null, 204);
  }

  let data = null;
  try {
    data = JSON.parse(doc.doc_json);
  } catch {
    return c.json({ error: '文档数据损坏' }, 500);
  }

  return c.json({
    data,
    rev: doc.rev,
    updatedAt: doc.updated_at
  });
});

// A metadata read is sufficient on the normal path. Only conflicts need the document blob.
syncRouter.put('/', async (c) => {
  const user = await getCurrentUser(c);
  if (!user) return c.json({ error: '请先登录' }, 401);
  let body: any;
  try { body = await limitedJSON(c.req.raw, 1_900_000); }
  catch (error) { return c.json({ error: error instanceof AIError ? error.message : '无法读取文档' }, error instanceof AIError ? error.status as any : 400); }
  if (!body || !Number.isSafeInteger(body.baseRev) || body.baseRev < 0 || !validDocument(body.data)) {
    return c.json({ error: '文档结构或版本不正确' }, 400);
  }
  const { data, baseRev } = body;
  const rawJSON = JSON.stringify(data);
  const byteSize = new TextEncoder().encode(rawJSON).length;
  if (byteSize > 1_800_000) return c.json({ error: '文档体积超过 1.8MB 上限' }, 413);
  const hash = await documentHash(data);
  const now = Math.floor(Date.now() / 1000);
  const current = await c.env.DB.prepare('SELECT rev, content_hash, updated_at FROM user_docs WHERE user_id = ?')
    .bind(user.id).first<{ rev: number; content_hash: string; updated_at: number }>();
  const conflict = async () => {
    const latest = await c.env.DB.prepare('SELECT rev, doc_json, updated_at FROM user_docs WHERE user_id = ?')
      .bind(user.id).first<{ rev: number; doc_json: string; updated_at: number }>();
    return c.json({ error: '检测到多端版本冲突', serverData: latest ? JSON.parse(latest.doc_json) : null,
      serverRev: latest?.rev || 0, updatedAt: latest?.updated_at || now }, 409);
  };
  if ((current?.rev || 0) !== baseRev) return conflict();
  if (current && !current.content_hash && await legacyDocumentMatches(c.env.DB, user.id, baseRev, hash)) {
    const saved = await c.env.DB.prepare('UPDATE user_docs SET content_hash = ? WHERE user_id = ? AND rev = ?').bind(hash, user.id, baseRev).run();
    if (!saved.meta.changes) return conflict();
    return c.json({ rev: current.rev, updatedAt: current.updated_at });
  }
  if (current?.content_hash === hash) return c.json({ rev: current.rev, updatedAt: current.updated_at });
  const newRev = baseRev + 1;
  const write = current
    ? c.env.DB.prepare(`UPDATE user_docs SET rev = ?, doc_json = ?, byte_size = ?, updated_at = ?, content_hash = ?
        WHERE user_id = ? AND rev = ?`).bind(newRev, rawJSON, byteSize, now, hash, user.id, baseRev)
    : c.env.DB.prepare(`INSERT OR IGNORE INTO user_docs (user_id, rev, doc_json, byte_size, updated_at, content_hash)
        VALUES (?, ?, ?, ?, ?, ?)`).bind(user.id, newRev, rawJSON, byteSize, now, hash);
  // changes() guards snapshots/pruning after a lost CAS. Batch execution is atomic in D1.
  const result = await c.env.DB.batch([
    write,
    c.env.DB.prepare(`INSERT INTO doc_revisions (user_id, rev, byte_size, summary, doc_json, created_at)
      SELECT user_id, rev, byte_size, ?, doc_json, ? FROM user_docs
      WHERE changes() > 0 AND user_id = ? AND rev = ? AND NOT EXISTS (
        SELECT 1 FROM doc_revisions WHERE user_id = ? AND created_at > ?
      )`).bind(documentSummary(data), now, user.id, newRev, user.id, now - 600),
    pruneRevisions(c.env.DB, user.id, now)
  ]);
  if (!result[0].meta.changes) return conflict();
  invalidatePublic(c.env.DB);
  return c.json({ rev: newRev, updatedAt: now });
});

// GET /api/sync/revisions
syncRouter.get('/revisions', async (c) => {
  const user = await getCurrentUser(c);
  if (!user) {
    return c.json({ error: '请先登录' }, 401);
  }

  const { results } = await c.env.DB.prepare(`
    SELECT id, rev, byte_size as byteSize, summary, created_at as createdAt
    FROM doc_revisions WHERE user_id = ?
    ORDER BY created_at DESC, id DESC
    LIMIT 100
  `).bind(user.id).all<{ id: number; rev: number; byteSize: number; summary: string; createdAt: number }>();

  return c.json({ revisions: results || [] });
});

// GET /api/sync/revisions/:id
syncRouter.get('/revisions/:id', async (c) => {
  const user = await getCurrentUser(c);
  if (!user) {
    return c.json({ error: '请先登录' }, 401);
  }

  const id = parseInt(c.req.param('id'), 10);
  if (isNaN(id)) {
    return c.json({ error: '无效的历史版本号' }, 400);
  }

  const rev = await c.env.DB.prepare(`
    SELECT id, rev, byte_size as byteSize, summary, doc_json, created_at as createdAt
    FROM doc_revisions WHERE user_id = ? AND id = ?
  `).bind(user.id, id).first<{
    id: number;
    rev: number;
    byteSize: number;
    summary: string;
    doc_json: string;
    createdAt: number;
  }>();

  if (!rev) {
    return c.json({ error: '历史快照不存在' }, 404);
  }

  let data = null;
  try {
    data = JSON.parse(rev.doc_json);
  } catch {
    return c.json({ error: '快照数据损坏' }, 500);
  }

  return c.json({
    id: rev.id,
    rev: rev.rev,
    byteSize: rev.byteSize,
    summary: rev.summary,
    createdAt: rev.createdAt,
    data
  });
});
