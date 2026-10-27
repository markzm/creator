import { Hono } from 'hono';
import { getCurrentUser } from '../auth';
import type { Env, UserRow } from '../types';

export const sharesRouter = new Hono<{ Bindings: Env }>();

async function loadReadableShare(c: any, shareId: string, user: UserRow | null) {
  const share = await c.env.DB.prepare(
    'SELECT id, user_id as userId, visibility FROM world_shares WHERE id = ?'
  ).bind(shareId).first() as { id: string; userId: number; visibility: string } | null;
  if (!share) return null;
  if (share.visibility === 'private' && (!user || (user.id !== share.userId && !user.is_admin))) {
    return undefined;
  }
  return share;
}

// POST /api/presence
sharesRouter.post('/presence', async (c) => {
  const user = await getCurrentUser(c);
  if (!user) {
    return c.json({ error: '请先登录' }, 401);
  }

  const body = await c.req.json().catch(() => ({}));
  const focus = typeof body.focus === 'string' ? body.focus.trim().slice(0, 100) : '';
  const now = Math.floor(Date.now() / 1000);

  await c.env.DB.prepare(`
    UPDATE users SET presence_focus = ?, last_seen_at = ? WHERE id = ?
  `).bind(focus, now, user.id).run();

  return c.json({ ok: true });
});

// GET /api/lobby/users
sharesRouter.get('/lobby/users', async (c) => {
  const now = Math.floor(Date.now() / 1000);
  const weekAgo = now - 7 * 86400;

  const { results } = await c.env.DB.prepare(`
    SELECT id, nickname as name, avatar_url as avatar, bio, presence_focus as focus, last_seen_at as lastSeen
    FROM users
    WHERE last_seen_at >= ? AND is_disabled = 0
    ORDER BY last_seen_at DESC
    LIMIT 50
  `).bind(weekAgo).all<{
    id: number;
    name: string;
    avatar: string;
    bio: string;
    focus: string;
    lastSeen: number;
  }>();

  const users = (results || []).map((u) => ({
    ...u,
    isOnline: now - u.lastSeen <= 180
  }));

  return c.json({ users });
});

// GET /api/lobby/creator-profile
sharesRouter.get('/lobby/creator-profile', async (c) => {
  const uidStr = c.req.query('user_id');
  const uid = parseInt(uidStr || '', 10);
  if (isNaN(uid) || uid <= 0) {
    return c.json({ error: '用户 ID 无效' }, 400);
  }

  const user = await c.env.DB.prepare(`
    SELECT id, nickname, avatar_url, bio, presence_focus, last_seen_at, created_at,
           is_admin, is_super_admin, is_muted
    FROM users WHERE id = ? AND is_disabled = 0
  `).bind(uid).first<{
    id: number;
    nickname: string;
    avatar_url: string;
    bio: string;
    presence_focus: string;
    last_seen_at: number;
    created_at: number;
    is_admin: number;
    is_super_admin: number;
    is_muted: number;
  }>();

  if (!user) {
    return c.json({ error: '未找到创作者信息' }, 404);
  }

  // Keep this response in sync with CreatorProfile (and the Go API). The web
  // client renders profile.user immediately after the request resolves, so a
  // flat response here makes the modal throw during render and disappear.
  const { results: publishedShares } = await c.env.DB.prepare(`
    SELECT id, user_id as userId, owner_name as ownerName, kind, title, summary,
           content, draft_code as draftCode, visibility, entity_id as entityId, tags,
           word_count as wordCount, canon_status as canonStatus, cocreation_id as cocreationId,
           canon_requested as canonRequested, tachi_e_url as tachiEUrl,
           author_id as authorId, canon_review as canonReview,
           reviewed_by as reviewedBy, reviewed_at as reviewedAt,
           created_at as createdAt, updated_at as updatedAt
    FROM world_shares
    WHERE user_id = ? AND visibility = 'public'
    ORDER BY created_at DESC, id DESC
    LIMIT 50
  `).bind(uid).all();

  const { results: projectRows } = await c.env.DB.prepare(`
    SELECT p.*,
           (SELECT COUNT(*) FROM world_shares ws
            WHERE ws.cocreation_id = p.id AND ws.canon_review = 'pending') AS pendingCount
    FROM cocreation_projects p
    JOIN cocreation_members cm ON cm.project_id = p.id
    WHERE cm.user_id = ?
    ORDER BY p.updated_at DESC
    LIMIT 20
  `).bind(uid).all<any>();

  const cocreations = await Promise.all((projectRows || []).map(async (p: any) => {
    let admins: string[] = [];
    try {
      admins = JSON.parse(p.admins_json || '[]');
    } catch {
      // Ignore malformed legacy display data; membership rows are authoritative.
    }

    const { results: members } = await c.env.DB.prepare(`
      SELECT m.user_id as userId, u.nickname as name, u.avatar_url as avatar, m.role
      FROM cocreation_members m
      JOIN users u ON u.id = m.user_id
      WHERE m.project_id = ?
      ORDER BY CASE m.role WHEN 'owner' THEN 0 ELSE 1 END, m.created_at ASC
    `).bind(p.id).all();

    return {
      id: p.id,
      worldId: p.world_id,
      worldTitle: p.world_title,
      ownerId: p.owner_id,
      ownerName: p.owner_name,
      admins,
      members: members || [],
      summary: p.summary || '',
      isOpenDoujin: Boolean(p.is_open_doujin),
      pendingCount: Number(p.pendingCount || 0),
      createdAt: p.created_at,
      updatedAt: p.updated_at
    };
  }));

  const now = Math.floor(Date.now() / 1000);
  return c.json({
    user: {
      id: user.id,
      name: user.nickname || '未命名创作者',
      avatar: user.avatar_url || '',
      bio: user.bio || '',
      focus: user.presence_focus || '',
      lastSeen: user.last_seen_at || 0,
      isOnline: now - (user.last_seen_at || 0) <= 300
    },
    isAdmin: Boolean(user.is_admin),
    isSuperAdmin: Boolean(user.is_super_admin),
    isMuted: Boolean(user.is_muted),
    createdAt: user.created_at || 0,
    publishedShares: publishedShares || [],
    cocreations
  });
});

// GET /api/stats/global
sharesRouter.get('/stats/global', async (c) => {
  const now = Math.floor(Date.now() / 1000);
  const onlineThreshold = now - 180;

  const totalUsersRes = await c.env.DB.prepare('SELECT COUNT(*) as count FROM users WHERE is_disabled = 0').first<{ count: number }>();
  const onlineUsersRes = await c.env.DB.prepare('SELECT COUNT(*) as count FROM users WHERE last_seen_at >= ? AND is_disabled = 0').bind(onlineThreshold).first<{ count: number }>();

  const sharesStatsRes = await c.env.DB.prepare(`
    SELECT
      COUNT(*) as totalShares,
      COALESCE(SUM(word_count), 0) as totalWords
    FROM world_shares WHERE visibility = 'public'
  `).first<{ totalShares: number; totalWords: number }>();

  const kindCountsRes = await c.env.DB.prepare(`
    SELECT kind, COUNT(*) as count
    FROM world_shares WHERE visibility = 'public'
    GROUP BY kind
  `).all<{ kind: string; count: number }>();

  const kindCounts: Record<string, number> = {};
  for (const row of kindCountsRes.results || []) {
    kindCounts[row.kind] = row.count;
  }

  const syncedWordsRes = await c.env.DB.prepare('SELECT COALESCE(SUM(byte_size), 0) as totalBytes FROM user_docs').first<{ totalBytes: number }>();

  const { results: recentCreations } = await c.env.DB.prepare(`
    SELECT id, user_id as userId, owner_name as ownerName, kind, title, summary,
           visibility, tags, word_count as wordCount, canon_status as canonStatus,
           cocreation_id as cocreationId, tachi_e_url as tachiEUrl, created_at as createdAt, updated_at as updatedAt
    FROM world_shares
    WHERE visibility = 'public'
    ORDER BY created_at DESC, id DESC
    LIMIT 6
  `).all();

  const { results: activeCreatorsRaw } = await c.env.DB.prepare(`
    SELECT id, nickname as name, avatar_url as avatar, bio, presence_focus as focus, last_seen_at as lastSeen
    FROM users
    WHERE last_seen_at >= ? AND is_disabled = 0
    ORDER BY last_seen_at DESC
    LIMIT 6
  `).bind(now - 7 * 86400).all<{
    id: number;
    name: string;
    avatar: string;
    bio: string;
    focus: string;
    lastSeen: number;
  }>();

  const activeCreators = (activeCreatorsRaw || []).map((u) => ({
    ...u,
    isOnline: now - u.lastSeen <= 180
  }));

  return c.json({
    totalUsers: totalUsersRes?.count || 0,
    onlineUsers: onlineUsersRes?.count || 0,
    totalPublicShares: sharesStatsRes?.totalShares || 0,
    kindCounts,
    totalPublicWords: sharesStatsRes?.totalWords || 0,
    totalSyncedWords: Math.floor((syncedWordsRes?.totalBytes || 0) / 3),
    recentCreations: recentCreations || [],
    activeCreators
  });
});

// GET /api/shares
sharesRouter.get('/shares', async (c) => {
  const user = await getCurrentUser(c);
  const owner = c.req.query('owner');

  if (owner === 'me') {
    if (!user) {
      return c.json({ error: '请先登录' }, 401);
    }
    const vis = c.req.query('visibility');
    const kind = c.req.query('kind');
    const limit = Math.min(parseInt(c.req.query('limit') || '50', 10) || 50, 100);

    let sql = `
      SELECT id, user_id as userId, owner_name as ownerName, kind, title, summary,
             content, draft_code as draftCode, visibility, entity_id as entityId, tags,
             word_count as wordCount, canon_status as canonStatus, cocreation_id as cocreationId,
             canon_requested as canonRequested, tachi_e_url as tachiEUrl, canon_review as canonReview,
             reviewed_by as reviewedBy, reviewed_at as reviewedAt, created_at as createdAt, updated_at as updatedAt
      FROM world_shares
      WHERE user_id = ?
    `;
    const params: any[] = [user.id];

    if (vis && vis !== 'all') {
      sql += ' AND visibility = ?';
      params.push(vis);
    }
    if (kind) {
      sql += ' AND kind = ?';
      params.push(kind);
    }
    sql += ' ORDER BY created_at DESC, id DESC LIMIT ?';
    params.push(limit);

    const { results } = await c.env.DB.prepare(sql).bind(...params).all();
    return c.json({ shares: results || [] });
  }

  // Public Feed
  const kind = c.req.query('kind');
  const keyword = c.req.query('q');
  const before = parseInt(c.req.query('before') || '0', 10);
  const beforeId = c.req.query('beforeId') || '';
  const limit = Math.min(parseInt(c.req.query('limit') || '30', 10) || 30, 50);
  const withContent = c.req.query('full') === '1';

  let sql = `
    SELECT id, user_id as userId, owner_name as ownerName, kind, title, summary,
           ${withContent ? 'content,' : ''} draft_code as draftCode, visibility,
           entity_id as entityId, tags, word_count as wordCount, canon_status as canonStatus,
           cocreation_id as cocreationId, canon_requested as canonRequested, tachi_e_url as tachiEUrl,
           canon_review as canonReview, reviewed_by as reviewedBy, reviewed_at as reviewedAt,
           created_at as createdAt, updated_at as updatedAt
    FROM world_shares
    WHERE visibility = 'public'
  `;
  const params: any[] = [];

  if (kind) {
    sql += ' AND kind = ?';
    params.push(kind);
  }
  if (keyword) {
    sql += ' AND (title LIKE ? OR summary LIKE ? OR tags LIKE ?)';
    const kw = `%${keyword}%`;
    params.push(kw, kw, kw);
  }
  if (before > 0) {
    if (beforeId) {
      sql += ' AND (created_at < ? OR (created_at = ? AND id < ?))';
      params.push(before, before, beforeId);
    } else {
      sql += ' AND created_at < ?';
      params.push(before);
    }
  }

  sql += ' ORDER BY created_at DESC, id DESC LIMIT ?';
  params.push(limit);

  const { results } = await c.env.DB.prepare(sql).bind(...params).all();
  return c.json({ shares: results || [] });
});

// POST /api/shares
sharesRouter.post('/shares', async (c) => {
  const user = await getCurrentUser(c);
  if (!user) {
    return c.json({ error: '请先登录' }, 401);
  }

  if (user.is_muted) {
    return c.json({ error: '您已被管理员禁言，无法公开作品' }, 403);
  }

  const body = await c.req.json().catch(() => null);
  if (!body || !body.title || !body.title.trim()) {
    return c.json({ error: '标题不能为空' }, 400);
  }

  const shareId = body.id || `ws_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const kind = body.kind || 'world';
  const title = body.title.trim().slice(0, 150);
  const summary = (body.summary || '').slice(0, 500);
  const content = body.content || '';
  const draftCode = body.draftCode || '';
  const visibility = body.visibility === 'private' ? 'private' : 'public';
  const entityId = body.entityId || '';
  const tags = body.tags || '';
  const wordCount = Array.from(content).length;
  const cocreationId = (body.cocreationId || '').trim();
  const tachiEUrl = body.tachiEUrl || '';

  let canonStatus = 'canon';
  if (cocreationId) {
    const project = await c.env.DB.prepare(
      'SELECT is_open_doujin FROM cocreation_projects WHERE id = ?'
    ).bind(cocreationId).first<{ is_open_doujin: number }>();
    if (!project) return c.json({ error: '共创企划不存在' }, 400);
    if (!project.is_open_doujin && !user.is_admin) {
      return c.json({ error: '该共创企划已暂停投稿' }, 403);
    }
    // Check if user is reviewer or admin
    const member = await c.env.DB.prepare(
      'SELECT role FROM cocreation_members WHERE project_id = ? AND user_id = ?'
    ).bind(cocreationId, user.id).first<{ role: string }>();

    if (!member && !user.is_admin) {
      canonStatus = 'doujin';
    }
  }

  const now = Math.floor(Date.now() / 1000);

  // Check if exists
  const existing = await c.env.DB.prepare('SELECT user_id FROM world_shares WHERE id = ?').bind(shareId).first<{ user_id: number }>();
  if (existing) {
    if (existing.user_id !== user.id && !user.is_admin) {
      return c.json({ error: '无权修改他人的分享' }, 403);
    }
    await c.env.DB.prepare(`
      UPDATE world_shares SET
        title = ?, summary = ?, content = ?, draft_code = ?, visibility = ?,
        tags = ?, word_count = ?, canon_status = ?, cocreation_id = ?,
        tachi_e_url = ?, updated_at = ?
      WHERE id = ?
    `).bind(title, summary, content, draftCode, visibility, tags, wordCount, canonStatus, cocreationId, tachiEUrl, now, shareId).run();
  } else {
    await c.env.DB.prepare(`
      INSERT INTO world_shares (
        id, user_id, owner_name, kind, title, summary, content, draft_code,
        visibility, entity_id, tags, word_count, canon_status, cocreation_id,
        canon_requested, tachi_e_url, author_id, canon_review, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      shareId, user.id, user.nickname || '未命名创作者', kind, title, summary, content, draftCode,
      visibility, entityId, tags, wordCount, canonStatus, cocreationId,
      0, tachiEUrl, user.id, 'none', now, now
    ).run();
  }

  const created = await c.env.DB.prepare(`
    SELECT id, user_id as userId, owner_name as ownerName, kind, title, summary,
           content, draft_code as draftCode, visibility, entity_id as entityId, tags,
           word_count as wordCount, canon_status as canonStatus, cocreation_id as cocreationId,
           canon_requested as canonRequested, tachi_e_url as tachiEUrl, canon_review as canonReview,
           created_at as createdAt, updated_at as updatedAt
    FROM world_shares WHERE id = ?
  `).bind(shareId).first();

  return c.json({ share: created }, 201);
});

// GET /api/shares/:id
sharesRouter.get('/shares/:id', async (c) => {
  const user = await getCurrentUser(c);
  const id = c.req.param('id');

  const share = await c.env.DB.prepare(`
    SELECT id, user_id as userId, owner_name as ownerName, kind, title, summary,
           content, draft_code as draftCode, visibility, entity_id as entityId, tags,
           word_count as wordCount, canon_status as canonStatus, cocreation_id as cocreationId,
           canon_requested as canonRequested, tachi_e_url as tachiEUrl, canon_review as canonReview,
           reviewed_by as reviewedBy, reviewed_at as reviewedAt, created_at as createdAt, updated_at as updatedAt
    FROM world_shares WHERE id = ?
  `).bind(id).first<any>();

  if (!share) {
    return c.json({ error: '分享条目不存在' }, 404);
  }

  if (share.visibility === 'private' && (!user || (user.id !== share.userId && !user.is_admin))) {
    return c.json({ error: '该条目为作者私有，暂不公开' }, 403);
  }

  return c.json({ share });
});

// PATCH /api/shares/:id
sharesRouter.patch('/shares/:id', async (c) => {
  const user = await getCurrentUser(c);
  if (!user) {
    return c.json({ error: '请先登录' }, 401);
  }

  const id = c.req.param('id');
  const existing = await c.env.DB.prepare('SELECT user_id, content FROM world_shares WHERE id = ?').bind(id).first<{ user_id: number; content: string }>();
  if (!existing) {
    return c.json({ error: '分享条目不存在' }, 404);
  }
  if (existing.user_id !== user.id && !user.is_admin) {
    return c.json({ error: '仅作者本人可修改该分享' }, 403);
  }

  const body = await c.req.json().catch(() => ({}));
  const now = Math.floor(Date.now() / 1000);

  let updates: string[] = ['updated_at = ?'];
  let params: any[] = [now];

  if (body.visibility !== undefined) {
    if (user.is_muted && body.visibility === 'public') {
      return c.json({ error: '您已被管理员禁言，无法公开作品' }, 403);
    }
    updates.push('visibility = ?');
    params.push(body.visibility === 'private' ? 'private' : 'public');
  }
  if (typeof body.title === 'string') {
    updates.push('title = ?');
    params.push(body.title.trim().slice(0, 150));
  }
  if (typeof body.summary === 'string') {
    updates.push('summary = ?');
    params.push(body.summary.slice(0, 500));
  }
  if (typeof body.content === 'string') {
    updates.push('content = ?', 'word_count = ?');
    params.push(body.content, Array.from(body.content).length);
  }
  if (typeof body.tags === 'string') {
    updates.push('tags = ?');
    params.push(body.tags);
  }

  params.push(id);
  await c.env.DB.prepare(`
    UPDATE world_shares SET ${updates.join(', ')} WHERE id = ?
  `).bind(...params).run();

  return c.json({ ok: true });
});

// DELETE /api/shares/:id
sharesRouter.delete('/shares/:id', async (c) => {
  const user = await getCurrentUser(c);
  if (!user) {
    return c.json({ error: '请先登录' }, 401);
  }

  const id = c.req.param('id');
  const existing = await c.env.DB.prepare('SELECT user_id FROM world_shares WHERE id = ?').bind(id).first<{ user_id: number }>();
  if (!existing) {
    return c.json({ error: '分享条目不存在' }, 404);
  }
  if (existing.user_id !== user.id && !user.is_admin) {
    return c.json({ error: '仅作者本人可删除该分享' }, 403);
  }

  await c.env.DB.prepare('DELETE FROM world_shares WHERE id = ?').bind(id).run();
  return c.json({ ok: true });
});

// GET /api/shares/:id/comments
sharesRouter.get('/shares/:id/comments', async (c) => {
  const shareId = c.req.param('id');
  const user = await getCurrentUser(c);
  const readable = await loadReadableShare(c, shareId, user);
  if (readable === undefined) return c.json({ error: '该条目为作者私有，暂不公开' }, 403);
  if (!readable) return c.json({ error: '分享条目不存在' }, 404);
  const { results } = await c.env.DB.prepare(`
    SELECT id, share_id as shareId, user_id as userId, user_name as userName,
           user_avatar as userAvatar, content, parent_id as parentId, like_count as likeCount, created_at as createdAt
    FROM setting_comments
    WHERE share_id = ?
    ORDER BY created_at ASC
  `).bind(shareId).all();

  return c.json({ comments: results || [] });
});

// POST /api/shares/:id/comments
sharesRouter.post('/shares/:id/comments', async (c) => {
  const user = await getCurrentUser(c);
  if (!user) {
    return c.json({ error: '请先登录' }, 401);
  }
  if (user.is_muted) {
    return c.json({ error: '您已被禁言，无法发表评论' }, 403);
  }

  const shareId = c.req.param('id');
  const readable = await loadReadableShare(c, shareId, user);
  if (readable === undefined) return c.json({ error: '该条目为作者私有，无法评论' }, 403);
  if (!readable) return c.json({ error: '分享条目不存在' }, 404);
  const body = await c.req.json().catch(() => null);
  if (!body || !body.content || !body.content.trim()) {
    return c.json({ error: '评论内容不能为空' }, 400);
  }

  const content = body.content.trim().slice(0, 1000);
  const parentId = typeof body.parentId === 'number' ? body.parentId : 0;
  if (parentId) {
    const parent = await c.env.DB.prepare(
      'SELECT id FROM setting_comments WHERE id = ? AND share_id = ?'
    ).bind(parentId, shareId).first();
    if (!parent) return c.json({ error: '回复目标不存在' }, 400);
  }
  const now = Math.floor(Date.now() / 1000);

  const res = await c.env.DB.prepare(`
    INSERT INTO setting_comments (share_id, user_id, user_name, user_avatar, content, parent_id, like_count, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(shareId, user.id, user.nickname || '未命名创作者', user.avatar_url || '', content, parentId, 0, now).run();

  const commentId = res.meta.last_row_id as number;
  const comment = await c.env.DB.prepare(`
    SELECT id, share_id as shareId, user_id as userId, user_name as userName,
           user_avatar as userAvatar, content, parent_id as parentId, like_count as likeCount, created_at as createdAt
    FROM setting_comments WHERE id = ?
  `).bind(commentId).first();

  return c.json({ comment }, 201);
});

// POST /api/comments/:id/like
sharesRouter.post('/comments/:id/like', async (c) => {
  const user = await getCurrentUser(c);
  if (!user) {
    return c.json({ error: '请先登录' }, 401);
  }

  const commentId = parseInt(c.req.param('id'), 10);
  const now = Math.floor(Date.now() / 1000);

  const commentAccess = await c.env.DB.prepare(`
    SELECT c.id, s.user_id as shareOwnerId, s.visibility
    FROM setting_comments c
    JOIN world_shares s ON s.id = c.share_id
    WHERE c.id = ?
  `).bind(commentId).first() as { id: number; shareOwnerId: number; visibility: string } | null;
  if (!commentAccess) return c.json({ error: '评论不存在' }, 404);
  if (commentAccess.visibility === 'private' && commentAccess.shareOwnerId !== user.id && !user.is_admin) {
    return c.json({ error: '该条目为作者私有，无法操作评论' }, 403);
  }

  const liked = await c.env.DB.prepare(
    'SELECT 1 FROM comment_likes WHERE comment_id = ? AND user_id = ?'
  ).bind(commentId, user.id).first();

  if (liked) {
    await c.env.DB.batch([
      c.env.DB.prepare('DELETE FROM comment_likes WHERE comment_id = ? AND user_id = ?').bind(commentId, user.id),
      c.env.DB.prepare('UPDATE setting_comments SET like_count = MAX(0, like_count - 1) WHERE id = ?').bind(commentId)
    ]);
  } else {
    await c.env.DB.batch([
      c.env.DB.prepare('INSERT INTO comment_likes (comment_id, user_id, created_at) VALUES (?, ?, ?)').bind(commentId, user.id, now),
      c.env.DB.prepare('UPDATE setting_comments SET like_count = like_count + 1 WHERE id = ?').bind(commentId)
    ]);
  }

  const updated = await c.env.DB.prepare('SELECT like_count FROM setting_comments WHERE id = ?').bind(commentId).first<{ like_count: number }>();
  return c.json({
    liked: !liked,
    likeCount: updated ? updated.like_count : 0
  });
});

// DELETE /api/comments/:id
sharesRouter.delete('/comments/:id', async (c) => {
  const user = await getCurrentUser(c);
  if (!user) {
    return c.json({ error: '请先登录' }, 401);
  }

  const commentId = parseInt(c.req.param('id'), 10);
  const comment = await c.env.DB.prepare('SELECT user_id FROM setting_comments WHERE id = ?').bind(commentId).first<{ user_id: number }>();
  if (!comment) {
    return c.json({ error: '评论不存在' }, 404);
  }
  if (comment.user_id !== user.id && !user.is_admin) {
    return c.json({ error: '仅作者或管理员可删除该评论' }, 403);
  }

  await c.env.DB.prepare('DELETE FROM setting_comments WHERE id = ?').bind(commentId).run();
  return c.json({ ok: true });
});
