import { Hono } from 'hono';
import { getCurrentUser } from '../auth';
import type { Env } from '../types';

export const syncRouter = new Hono<{ Bindings: Env }>();

const SNAPSHOT_INTERVAL_SEC = 600; // 10 minutes

function validateAndSummarizeDoc(data: any): { summary: string; valid: boolean } {
  if (!data || typeof data !== 'object') {
    return { summary: '', valid: false };
  }
  const hasVer = data._version !== undefined || data.version !== undefined;
  if (!hasVer) {
    return { summary: '', valid: false };
  }
  const worlds = data.worlds;
  const orgs = data.orgs;
  const chars = data.chars;
  if (
    !worlds || typeof worlds !== 'object' ||
    !orgs || typeof orgs !== 'object' ||
    !chars || typeof chars !== 'object'
  ) {
    return { summary: '', valid: false };
  }
  const wCnt = Object.keys(worlds).length;
  const oCnt = Object.keys(orgs).length;
  const cCnt = Object.keys(chars).length;
  return {
    summary: `世界观:${wCnt} 组织:${oCnt} 角色:${cCnt}`,
    valid: true
  };
}

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

// PUT /api/sync
syncRouter.put('/', async (c) => {
  const user = await getCurrentUser(c);
  if (!user) {
    return c.json({ error: '请先登录' }, 401);
  }

  const body = await c.req.json().catch(() => null);
  if (!body || !body.data || typeof body.baseRev !== 'number') {
    return c.json({ error: '请求 JSON 格式不正确' }, 400);
  }

  const { data, baseRev } = body;
  const { summary, valid } = validateAndSummarizeDoc(data);
  if (!valid) {
    return c.json({ error: '文档结构校验未通过（缺少 _version 或核心实体表）' }, 400);
  }

  const rawJSON = JSON.stringify(data);
  const byteSize = new TextEncoder().encode(rawJSON).length;
  if (byteSize > 1_800_000) {
    return c.json({ error: '文档体积超过 1.8MB 上限，请拆分文档后再同步' }, 413);
  }

  const now = Math.floor(Date.now() / 1000);

  const curDoc = await c.env.DB.prepare(
    'SELECT rev, doc_json, byte_size, updated_at FROM user_docs WHERE user_id = ?'
  ).bind(user.id).first<{ rev: number; doc_json: string; byte_size: number; updated_at: number }>();

  let newRev = 1;
  if (curDoc) {
    if (baseRev !== curDoc.rev) {
      let serverData = null;
      try {
        serverData = JSON.parse(curDoc.doc_json);
      } catch {
        // ignore
      }
      return c.json(
        {
          error: '检测到多端版本冲突',
          serverData,
          serverRev: curDoc.rev,
          updatedAt: curDoc.updated_at
        },
        409
      );
    }
    newRev = curDoc.rev + 1;
    const updateResult = await c.env.DB.prepare(`
      UPDATE user_docs SET rev = ?, doc_json = ?, byte_size = ?, updated_at = ?
      WHERE user_id = ? AND rev = ?
    `).bind(newRev, rawJSON, byteSize, now, user.id, baseRev).run();
    if (!updateResult.meta.changes) {
      const latest = await c.env.DB.prepare(
        'SELECT rev, doc_json, updated_at FROM user_docs WHERE user_id = ?'
      ).bind(user.id).first<{ rev: number; doc_json: string; updated_at: number }>();
      return c.json({
        error: '检测到多端版本冲突',
        serverData: latest ? JSON.parse(latest.doc_json) : null,
        serverRev: latest?.rev || 0,
        updatedAt: latest?.updated_at || now
      }, 409);
    }
  } else {
    if (baseRev !== 0) {
      return c.json({ error: '检测到多端版本冲突' }, 409);
    }
    await c.env.DB.prepare(`
      INSERT INTO user_docs (user_id, rev, doc_json, byte_size, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `).bind(user.id, newRev, rawJSON, byteSize, now).run();
  }

  // Snapshot logic
  const lastSnap = await c.env.DB.prepare(
    'SELECT MAX(created_at) as last_snap FROM doc_revisions WHERE user_id = ?'
  ).bind(user.id).first<{ last_snap: number | null }>();

  if (!lastSnap || lastSnap.last_snap === null || (now - lastSnap.last_snap >= SNAPSHOT_INTERVAL_SEC)) {
    await c.env.DB.prepare(`
      INSERT INTO doc_revisions (user_id, rev, byte_size, summary, doc_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(user.id, newRev, byteSize, summary, rawJSON, now).run();

    // Prune excess snapshots (keep top 50 recent)
    const countRes = await c.env.DB.prepare(
      'SELECT COUNT(*) as cnt FROM doc_revisions WHERE user_id = ?'
    ).bind(user.id).first<{ cnt: number }>();
    if (countRes && countRes.cnt > 60) {
      await c.env.DB.prepare(`
        DELETE FROM doc_revisions WHERE id IN (
          SELECT id FROM doc_revisions WHERE user_id = ?
          ORDER BY created_at DESC, id DESC
          LIMIT -1 OFFSET 50
        )
      `).bind(user.id).run();
    }
  }

  return c.json({
    rev: newRev,
    updatedAt: now
  });
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
