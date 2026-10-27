import { Hono } from 'hono';
import {
  checkPassword,
  claimChallenge,
  clearLoginFailures,
  createSession,
  destroySession,
  getClientIp,
  getLoginLock,
  generateChallenge,
  hashPassword,
  hashToken,
  recordLoginFailure,
  validateEmail,
  validatePassword,
  verifyChallenge
} from '../auth';
import type { Env, UserRow } from '../types';
import { toAuthUser } from '../types';

export const authRouter = new Hono<{ Bindings: Env }>();

// GET /api/auth/challenge
authRouter.get('/challenge', async (c) => {
  const secretKey = c.env.SECRET_KEY || 'creator-secret-change-in-wrangler-secrets';
  const ch = await generateChallenge(secretKey);
  const registerMode = c.env.REGISTER_MODE || 'open';
  return c.json({
    question: ch.question,
    token: ch.token,
    registerMode,
    smtpEnabled: false
  });
});

// POST /api/auth/register
authRouter.post('/register', async (c) => {
  const registerMode = c.env.REGISTER_MODE || 'open';
  if (registerMode === 'closed') {
    return c.json({ error: '当前系统已关闭公开注册，请联系管理员创建账号' }, 403);
  }

  const body = await c.req.json().catch(() => null);
  if (!body) {
    return c.json({ error: '请求格式错误' }, 400);
  }

  const { email, password, inviteCode, challengeToken, challengeAnswer } = body;

  // Challenge check
  const secretKey = c.env.SECRET_KEY || 'creator-secret-change-in-wrangler-secrets';
  if (registerMode === 'open' || challengeToken || challengeAnswer) {
    if (!challengeToken || !challengeAnswer) {
      return c.json({ error: '请先完成验证题' }, 400);
    }
    const ok = await verifyChallenge(secretKey, challengeToken, challengeAnswer);
    if (!ok) {
      return c.json({ error: '验证码错误或已过期，请刷新后重试' }, 400);
    }
    if (!(await claimChallenge(c, challengeToken))) {
      return c.json({ error: '验证码已使用，请刷新后重试' }, 400);
    }
  }

  const cleanEmail = (email || '').trim().toLowerCase();
  const emailErr = validateEmail(cleanEmail);
  if (emailErr) {
    return c.json({ error: emailErr }, 400);
  }

  const passErr = validatePassword(password);
  if (passErr) {
    return c.json({ error: passErr }, 400);
  }

  // Check invite code if required
  if (registerMode === 'invite') {
    if (!inviteCode || !inviteCode.trim()) {
      return c.json({ error: '当前模式需要填写邀请码' }, 400);
    }
  }

  // Check email uniqueness
  const existing = await c.env.DB.prepare(
    'SELECT id FROM users WHERE email = ? COLLATE NOCASE'
  ).bind(cleanEmail).first();
  if (existing) {
    return c.json({ error: '该邮箱已注册，请直接登录' }, 409);
  }

  if (registerMode === 'invite') {
    const now = Math.floor(Date.now() / 1000);
    const inviteUpdate = await c.env.DB.prepare(`
      UPDATE invites SET used_count = used_count + 1
      WHERE code = ? AND used_count < max_uses
        AND (expires_at IS NULL OR expires_at >= ?)
    `).bind(inviteCode.trim(), now).run();
    if (!inviteUpdate.meta.changes) {
      return c.json({ error: '邀请码无效或已用尽' }, 400);
    }
  }

  const passHash = await hashPassword(password);
  const now = Math.floor(Date.now() / 1000);
  const isAdmin = 0;
  const isSuperAdmin = 0;

  const insertRes = await c.env.DB.prepare(`
    INSERT INTO users (
      email, password_hash, nickname, avatar_url, bio,
      is_admin, is_super_admin, is_disabled, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    cleanEmail,
    passHash,
    '未命名创作者',
    '',
    '',
    isAdmin,
    isSuperAdmin,
    0,
    now,
    now
  ).run();

  const userId = insertRes.meta.last_row_id as number;
  const createdUser = await c.env.DB.prepare(
    'SELECT * FROM users WHERE id = ?'
  ).bind(userId).first<UserRow>();

  if (!createdUser) {
    return c.json({ error: '注册失败' }, 500);
  }

  await createSession(c, userId);
  return c.json({ user: toAuthUser(createdUser) }, 201);
});

// POST /api/auth/login
authRouter.post('/login', async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body) {
    return c.json({ error: '请求格式错误' }, 400);
  }

  const { email, password } = body;
  const cleanEmail = (email || '').trim().toLowerCase();
  const clientIp = getClientIp(c);
  const lockedUntil = await getLoginLock(c, clientIp, cleanEmail);
  if (lockedUntil) {
    return c.json({ error: '登录失败次数过多，请 15 分钟后重试' }, 429);
  }

  const user = await c.env.DB.prepare(
    'SELECT * FROM users WHERE email = ? COLLATE NOCASE'
  ).bind(cleanEmail).first<UserRow>();

  if (!user || !(await checkPassword(password, user.password_hash))) {
    await recordLoginFailure(c, clientIp, cleanEmail);
    return c.json({ error: '邮箱或密码错误' }, 401);
  }

  if (user.is_disabled) {
    return c.json({ error: '该账号已被禁用' }, 403);
  }

  await clearLoginFailures(c, clientIp, cleanEmail);

  await createSession(c, user.id);
  return c.json({ user: toAuthUser(user) });
});

// POST /api/auth/logout
authRouter.post('/logout', async (c) => {
  await destroySession(c);
  return c.json({ ok: true });
});

// POST /api/auth/forgot
authRouter.post('/forgot', async (c) => {
  return c.json({ error: '密码找回服务尚未配置，请联系管理员重置密码' }, 503);
});

// POST /api/auth/reset
authRouter.post('/reset', async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body || !body.token || !body.newPassword) {
    return c.json({ error: '请求格式错误' }, 400);
  }

  const passErr = validatePassword(body.newPassword);
  if (passErr) {
    return c.json({ error: passErr }, 400);
  }

  const tokenH = await hashToken(body.token);
  const now = Math.floor(Date.now() / 1000);

  const resetRecord = await c.env.DB.prepare(`
    SELECT * FROM password_resets
    WHERE token_hash = ? AND expires_at > ? AND used = 0
    LIMIT 1
  `).bind(tokenH, now).first<{ token_hash: string; user_id: number }>();

  if (!resetRecord) {
    return c.json({ error: '重置令牌无效或已过期' }, 400);
  }

  const passHash = await hashPassword(body.newPassword);
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').bind(passHash, now, resetRecord.user_id),
    c.env.DB.prepare('UPDATE password_resets SET used = 1 WHERE token_hash = ?').bind(tokenH),
    c.env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(resetRecord.user_id)
  ]);

  return c.json({ ok: true });
});
