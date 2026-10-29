import { Hono } from 'hono';
import { getCurrentUser } from '../auth';
import type { Env, UserRow } from '../types';
import { boundedInt, escapeLike, invalidatePublic, publicCached } from '../public-cache';
import { canManageShare, canReadShare, mutateShare, type ShareAccess } from '../share-access';
import { shareFullColumns, shareListColumns } from '../share-columns';
import { enrichProjects } from '../projects';

export const sharesRouter = new Hono<{ Bindings: Env }>();
sharesRouter.use('*', async (c, next) => {
  await next();
  if (c.req.method !== 'GET' && c.res.ok) invalidatePublic(c.env.DB);
});

async function loadReadableShare(c: any, shareId: string, user: UserRow | null) {
  const share = await c.env.DB.prepare(
    'SELECT id, user_id, visibility FROM world_shares WHERE id = ?'
  ).bind(shareId).first() as { id: string; user_id: number; visibility: string } | null;
  if (!share) return null;
  if (!canReadShare(user, { user_id: share.user_id, visibility: share.visibility })) {
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
    UPDATE users SET presence_focus = ?, last_seen_at = ? WHERE id = ? AND (presence_focus <> ? OR last_seen_at <= ?)
  `).bind(focus, now, user.id, focus, now - 60).run();

  return c.json({ ok: true });
});

// GET /api/lobby/users -- bounded, searchable creator directory plus global online count.
sharesRouter.get('/lobby/users', async (c) => {
  const page = boundedInt(c.req.query('page'), 1, 100000);
  const limit = boundedInt(c.req.query('limit'), 8, 50);
  const q = (c.req.query('q') || '').trim().slice(0, 60);
  const online = c.req.query('online') === '1';
  const result = await publicCached(c.env.DB, `creators:${page}:${limit}:${q}:${online}`, async () => {
    const now = Math.floor(Date.now() / 1000);
    const where = `is_disabled = 0 AND nickname LIKE ? ESCAPE '\\'${online ? ' AND last_seen_at >= ?' : ''}`;
    const args: any[] = ['%' + escapeLike(q) + '%', ...(online ? [now - 300] : [])];
    const rows = await c.env.DB.batch([
      c.env.DB.prepare(`SELECT id, nickname as name, avatar_url as avatar, bio, presence_focus as focus, last_seen_at as lastSeen
        FROM users WHERE ${where} ORDER BY last_seen_at DESC, id DESC LIMIT ? OFFSET ?`)
        .bind(...args, limit, (page - 1) * limit),
      c.env.DB.prepare(`SELECT COUNT(*) as total, SUM(CASE WHEN last_seen_at >= ? THEN 1 ELSE 0 END) as onlineCount
        FROM users WHERE is_disabled = 0`).bind(now - 300),
      c.env.DB.prepare(`SELECT COUNT(*) as total FROM users WHERE ${where}`).bind(...args)
    ]);
    return { users: rows[0].results.map((u: any) => ({ ...u, isOnline: now - u.lastSeen < 300 })),
      total: Number((rows[2].results[0] as any).total), onlineCount: Number((rows[1].results[0] as any).onlineCount || 0),
      totalCreators: Number((rows[1].results[0] as any).total), page, limit };
  });
  return c.json(result);
});

// GET /api/lobby/creator-profile
sharesRouter.get('/lobby/creator-profile', async (c) => {
  const uidStr = c.req.query('user_id');
  const uid = parseInt(uidStr || '', 10);
  if (isNaN(uid) || uid <= 0) {
    return c.json({ error: '用户 ID 无效' }, 400);
  }

  const profile = await publicCached(c.env.DB, `profile:${uid}`, async () => {
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
    return null;
  }

  // Keep this response in sync with CreatorProfile (and the Go API). The web
  // client renders profile.user immediately after the request resolves, so a
  // flat response here makes the modal throw during render and disappear.
  const { results: publishedShares } = await c.env.DB.prepare(`SELECT ${shareListColumns}
    FROM world_shares WHERE user_id = ? AND visibility = 'public' ORDER BY created_at DESC, id DESC LIMIT 50`).bind(uid).all();
  const { results: projectRows } = await c.env.DB.prepare(`SELECT p.* FROM cocreation_projects p
    JOIN cocreation_members cm ON cm.project_id = p.id WHERE cm.user_id = ? ORDER BY p.updated_at DESC LIMIT 20`).bind(uid).all();
  const cocreations = await enrichProjects(c.env.DB, projectRows);

  const now = Math.floor(Date.now() / 1000);
  return {
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
  };
  });
  if (!profile) return c.json({ error: '未找到创作者信息' }, 404);
  return c.json(profile);
});

sharesRouter.get('/stats/global', async (c) => c.json(await publicCached(c.env.DB, 'stats', async () => {
  const now = Math.floor(Date.now() / 1000);
  const result = await c.env.DB.batch([
    c.env.DB.prepare(`SELECT COUNT(*) as total, SUM(last_seen_at >= ?) as online FROM users WHERE is_disabled = 0`).bind(now - 300),
    c.env.DB.prepare(`SELECT kind, COUNT(*) as count, COALESCE(SUM(word_count), 0) as words
      FROM world_shares WHERE visibility = 'public' GROUP BY kind`),
    c.env.DB.prepare('SELECT COALESCE(SUM(byte_size), 0) as bytes FROM user_docs'),
    c.env.DB.prepare(`SELECT ${shareListColumns} FROM world_shares WHERE visibility = 'public' ORDER BY created_at DESC, id DESC LIMIT 6`),
    c.env.DB.prepare(`SELECT id, nickname as name, avatar_url as avatar, bio, presence_focus as focus, last_seen_at as lastSeen
      FROM users WHERE is_disabled = 0 ORDER BY last_seen_at DESC, id DESC LIMIT 6`)
  ]);
  const counts = result[1].results as any[];
  return { totalUsers: Number((result[0].results[0] as any).total), onlineUsers: Number((result[0].results[0] as any).online || 0),
    totalPublicShares: counts.reduce((n, r) => n + Number(r.count), 0), totalPublicWords: counts.reduce((n, r) => n + Number(r.words), 0),
    kindCounts: Object.fromEntries(counts.map(r => [r.kind, r.count])), totalSyncedWords: Math.floor(Number((result[2].results[0] as any).bytes) / 3),
    recentCreations: result[3].results, activeCreators: result[4].results.map((u: any) => ({ ...u, isOnline: now - u.lastSeen < 300 })) };
})));

sharesRouter.get('/shares', async (c) => {
  const mine = c.req.query('owner') === 'me';
  const user = mine ? await getCurrentUser(c) : null;
  if (mine && !user) return c.json({ error: '请先登录' }, 401);
  const limit = boundedInt(c.req.query('limit'), 30, 100);
  let sql = `SELECT ${c.req.query('full') === '1' ? shareFullColumns : shareListColumns} FROM world_shares WHERE `;
  const params: any[] = [];
  if (mine) { sql += 'user_id = ?'; params.push(user!.id); }
  else sql += "visibility = 'public'";
  const visibility = c.req.query('visibility');
  if (mine && ['public', 'private'].includes(visibility || '')) { sql += ' AND visibility = ?'; params.push(visibility); }
  const kind = c.req.query('kind');
  if (kind && kind !== 'all') { sql += ' AND kind = ?'; params.push(kind); }
  const project = c.req.query('project');
  if (project) { sql += ' AND cocreation_id = ?'; params.push(project); }
  const q = (c.req.query('q') || '').trim().slice(0, 60);
  if (q) {
    sql += ` AND (title LIKE ? ESCAPE '\\' OR summary LIKE ? ESCAPE '\\' OR tags LIKE ? ESCAPE '\\')`;
    const match = '%' + escapeLike(q) + '%'; params.push(match, match, match);
  }
  const before = Number(c.req.query('before'));
  const beforeId = c.req.query('beforeId') || '';
  if (Number.isSafeInteger(before) && before > 0) {
    sql += ' AND (created_at < ? OR (created_at = ? AND id < ?))'; params.push(before, before, beforeId);
  }
  sql += ' ORDER BY created_at DESC, id DESC LIMIT ?'; params.push(limit + 1);
  const { results } = await c.env.DB.prepare(sql).bind(...params).all();
  return c.json({ shares: results.slice(0, limit), hasMore: results.length > limit });
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
  const existing = await c.env.DB.prepare('SELECT id, user_id, visibility, rev FROM world_shares WHERE id = ?').bind(shareId).first<ShareAccess>();
  if (existing) {
    if (existing.user_id !== user.id) {
      return c.json({ error: '无权修改他人的分享' }, 403);
    }
    if (!Number.isSafeInteger(body.baseRev) || body.baseRev !== existing.rev) return c.json({ error: '作品版本冲突，请重新载入' }, 409);
    const result = await c.env.DB.prepare(`
      UPDATE world_shares SET
        title = ?, summary = ?, content = ?, draft_code = ?, visibility = ?,
        tags = ?, word_count = ?, canon_status = CASE WHEN cocreation_id <> ? THEN ? ELSE canon_status END,
        canon_review = CASE WHEN cocreation_id <> ? THEN 'none' ELSE canon_review END,
        canon_requested = CASE WHEN cocreation_id <> ? THEN 0 ELSE canon_requested END, cocreation_id = ?,
        tachi_e_url = ?, updated_at = ?, rev = rev + 1
      WHERE id = ? AND rev = ?
    `).bind(title, summary, content, draftCode, visibility, tags, wordCount, cocreationId, canonStatus, cocreationId, cocreationId, cocreationId, tachiEUrl, now, shareId, body.baseRev).run();
    if (!result.meta.changes) return c.json({ error: '作品版本冲突，请重新载入' }, 409);
  } else {
    if (body.id) return c.json({ error: '云端分享已被删除，本地草稿可保留并重新发布为新分享' }, 404);
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

  const created = await c.env.DB.prepare(`SELECT ${shareFullColumns} FROM world_shares WHERE id = ?`).bind(shareId).first();

  return c.json({ share: created }, 201);
});

// GET /api/shares/:id
sharesRouter.get('/shares/:id', async (c) => {
  const user = await getCurrentUser(c);
  const id = c.req.param('id');

  const share = await c.env.DB.prepare(`SELECT ${shareFullColumns} FROM world_shares WHERE id = ?`).bind(id).first<any>();

  if (!share) {
    return c.json({ error: '分享条目不存在' }, 404);
  }

  if (!canReadShare(user, { user_id: share.userId, visibility: share.visibility })) {
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
  const existing = await c.env.DB.prepare('SELECT id, user_id, visibility, rev FROM world_shares WHERE id = ?').bind(id).first<ShareAccess>();
  if (!existing) {
    return c.json({ error: '分享条目不存在' }, 404);
  }
  if (!canManageShare(user, existing)) {
    return c.json({ error: '仅作者本人可修改该分享' }, 403);
  }

  const body = await c.req.json().catch(() => ({}));
  if (!Number.isSafeInteger(body.baseRev) || body.baseRev !== existing.rev) return c.json({ error: '作品版本冲突，请重新载入' }, 409);
  const now = Math.floor(Date.now() / 1000);

  let updates: string[] = ['updated_at = ?', 'rev = rev + 1'];
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
  if (typeof body.draftCode === 'string') {
    updates.push('draft_code = ?'); params.push(body.draftCode);
  }
  if (typeof body.tags === 'string') {
    updates.push('tags = ?');
    params.push(body.tags);
  }

  params.push(id, body.baseRev);
  const changed = await mutateShare(c.env.DB, user, existing, c.env.DB.prepare(`
    UPDATE world_shares SET ${updates.join(', ')} WHERE id = ? AND rev = ?
  `).bind(...params), 'update');
  if (!changed) return c.json({ error: '作品版本冲突，请重新载入' }, 409);

  return c.json({ ok: true, rev: existing.rev + 1 });
});

// DELETE /api/shares/:id
sharesRouter.delete('/shares/:id', async (c) => {
  const user = await getCurrentUser(c);
  if (!user) {
    return c.json({ error: '请先登录' }, 401);
  }

  const id = c.req.param('id');
  const existing = await c.env.DB.prepare('SELECT id, user_id, visibility, rev FROM world_shares WHERE id = ?').bind(id).first<ShareAccess>();
  if (!existing) {
    return c.json({ error: '分享条目不存在' }, 404);
  }
  if (!canManageShare(user, existing)) {
    return c.json({ error: '仅作者本人可删除该分享' }, 403);
  }

  const baseRev = Number(c.req.query('baseRev'));
  if (!Number.isSafeInteger(baseRev) || baseRev !== existing.rev) return c.json({ error: '作品版本冲突，请重新载入' }, 409);
  const changed = await mutateShare(c.env.DB, user, existing,
    c.env.DB.prepare('DELETE FROM world_shares WHERE id = ? AND rev = ?').bind(id, baseRev), 'delete');
  if (!changed) return c.json({ error: '作品版本冲突，请重新载入' }, 409);
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
  if (!canReadShare(user, { user_id: commentAccess.shareOwnerId, visibility: commentAccess.visibility })) {
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
  const comment = await c.env.DB.prepare('SELECT user_id, share_id FROM setting_comments WHERE id = ?').bind(commentId).first<{ user_id: number; share_id: string }>();
  if (!comment) {
    return c.json({ error: '评论不存在' }, 404);
  }
  const readable = await loadReadableShare(c, comment.share_id, user);
  if (!readable) return c.json({ error: '无权访问该评论所属作品' }, 403);
  if (comment.user_id !== user.id && !user.is_admin) {
    return c.json({ error: '仅作者或管理员可删除该评论' }, 403);
  }

  await c.env.DB.prepare('DELETE FROM setting_comments WHERE id = ?').bind(commentId).run();
  return c.json({ ok: true });
});
