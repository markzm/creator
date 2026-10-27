import bcrypt from 'bcryptjs';
import type { Context } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import type { Env, UserRow } from './types';

export const SESSION_COOKIE = 'creator_sid';
export const SESSION_TTL_SECONDS = 30 * 24 * 3600;

export function validateEmail(email: string): string | null {
  const e = (email || '').trim();
  if (e.length < 5 || e.length > 120) {
    return '请输入有效的邮箱地址';
  }
  const emailRegex = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;
  if (!emailRegex.test(e)) {
    return '请输入有效的邮箱地址';
  }
  return null;
}

export function validatePassword(password: string): string | null {
  if (!password || password.length < 8 || password.length > 72) {
    return '密码长度需在 8 到 72 位之间，且同时包含字母与数字';
  }
  let hasLetter = false;
  let hasDigit = false;
  for (let i = 0; i < password.length; i++) {
    const ch = password[i];
    if (/[a-zA-Z]/.test(ch)) hasLetter = true;
    else if (/[0-9]/.test(ch)) hasDigit = true;
  }
  if (!hasLetter || !hasDigit) {
    return '密码长度需在 8 到 72 位之间，且同时包含字母与数字';
  }
  return null;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
}

export async function checkPassword(password: string, hash: string): Promise<boolean> {
  if (!password || !hash) return false;
  return bcrypt.compare(password, hash);
}

export async function hashToken(rawToken: string): Promise<string> {
  const enc = new TextEncoder();
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(rawToken.trim()));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function generateRawToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// ----------------------------------------------------
// Arithmetic Challenge (HMAC-SHA256)
// ----------------------------------------------------
const usedNonces = new Map<string, number>();

async function getHmacKey(secret: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  return crypto.subtle.importKey(
    'raw',
    enc.encode(secret || 'default-secret-key-creator-v6'),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(str: string): Uint8Array {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export async function generateChallenge(secretKey: string): Promise<{ question: string; token: string }> {
  const a = Math.floor(Math.random() * 15) + 3;
  const b = Math.floor(Math.random() * 15) + 2;
  const ans = a + b;

  const nonceBytes = new Uint8Array(8);
  crypto.getRandomValues(nonceBytes);
  const nonce = Array.from(nonceBytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  const exp = Math.floor(Date.now() / 1000) + 300; // 5 minutes
  const rawMsg = `${nonce}:${exp}:${ans}`;

  const key = await getHmacKey(secretKey);
  const enc = new TextEncoder();
  const sigBuffer = await crypto.subtle.sign('HMAC', key, enc.encode(rawMsg));
  const sig = Array.from(new Uint8Array(sigBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  const payload = `${nonce}:${exp}:${sig}`;
  const token = base64UrlEncode(enc.encode(payload));

  return {
    question: `${a} + ${b} = ?`,
    token
  };
}

export async function verifyChallenge(secretKey: string, token: string, answer: string): Promise<boolean> {
  const ansInt = parseInt(answer.trim(), 10);
  if (isNaN(ansInt)) return false;

  try {
    const decBytes = base64UrlDecode(token.trim());
    const decStr = new TextDecoder().decode(decBytes);
    const parts = decStr.split(':');
    if (parts.length !== 3) return false;

    const [nonce, expStr, sig] = parts;
    const exp = parseInt(expStr, 10);
    if (isNaN(exp)) return false;

    const now = Math.floor(Date.now() / 1000);
    if (now > exp) return false;

    // Verify HMAC
    const expectedMsg = `${nonce}:${exp}:${ansInt}`;
    const key = await getHmacKey(secretKey);
    const enc = new TextEncoder();
    const sigBuffer = await crypto.subtle.sign('HMAC', key, enc.encode(expectedMsg));
    const expectedSig = Array.from(new Uint8Array(sigBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    if (sig !== expectedSig) return false;

    // Prevent replay
    if (usedNonces.has(nonce)) return false;
    usedNonces.set(nonce, exp);

    // Periodic cleanup
    if (usedNonces.size > 1000) {
      for (const [n, e] of usedNonces.entries()) {
        if (now > e) usedNonces.delete(n);
      }
    }

    return true;
  } catch {
    return false;
  }
}

// ----------------------------------------------------
// AES-256-GCM Config Encryption (Interoperable with Go)
// ----------------------------------------------------
async function getAesGcmKey(secret: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const sha = await crypto.subtle.digest('SHA-256', enc.encode(secret || 'default-secret-key-creator-v6'));
  return crypto.subtle.importKey('raw', sha, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export async function encryptUserConfig(rawJSON: string, secretKey: string): Promise<string> {
  if (!rawJSON || !rawJSON.trim()) return '';
  const key = await getAesGcmKey(secretKey);
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);

  const enc = new TextEncoder();
  const cipherBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(rawJSON)
  );

  const combined = new Uint8Array(iv.length + cipherBuffer.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(cipherBuffer), iv.length);

  let binary = '';
  for (let i = 0; i < combined.byteLength; i++) {
    binary += String.fromCharCode(combined[i]);
  }
  return btoa(binary);
}

export async function decryptUserConfig(b64Ciphertext: string, secretKey: string): Promise<string> {
  if (!b64Ciphertext || !b64Ciphertext.trim()) return '';
  try {
    const binary = atob(b64Ciphertext.trim());
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    if (bytes.length < 12 + 16) return '';

    const iv = bytes.slice(0, 12);
    const ciphertext = bytes.slice(12);

    const key = await getAesGcmKey(secretKey);
    const plainBuffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext
    );
    return new TextDecoder().decode(plainBuffer);
  } catch {
    return '';
  }
}

// ----------------------------------------------------
// Session Management
// ----------------------------------------------------
export async function getCurrentUser(c: Context<{ Bindings: Env }>): Promise<UserRow | null> {
  const rawToken = getCookie(c, SESSION_COOKIE);
  if (!rawToken) return null;

  const tokenHash = await hashToken(rawToken);
  const now = Math.floor(Date.now() / 1000);

  const query = `
    SELECT u.* FROM users u
    JOIN sessions s ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > ?
    LIMIT 1
  `;
  const user = await c.env.DB.prepare(query).bind(tokenHash, now).first<UserRow>();
  return user || null;
}

export async function createSession(
  c: Context<{ Bindings: Env }>,
  userId: number
): Promise<string> {
  const rawToken = generateRawToken();
  const tokenHash = await hashToken(rawToken);
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + SESSION_TTL_SECONDS;

  const ua = c.req.header('user-agent') || '';
  const ip = c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || '';

  await c.env.DB.prepare(`
    INSERT INTO sessions (token_hash, user_id, user_agent, ip_addr, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(tokenHash, userId, ua, ip, expiresAt, now).run();

  setCookie(c, SESSION_COOKIE, rawToken, {
    path: '/',
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    maxAge: SESSION_TTL_SECONDS
  });

  return rawToken;
}

export async function destroySession(c: Context<{ Bindings: Env }>): Promise<void> {
  const rawToken = getCookie(c, SESSION_COOKIE);
  if (rawToken) {
    const tokenHash = await hashToken(rawToken);
    await c.env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(tokenHash).run();
  }
  setCookie(c, SESSION_COOKIE, '', {
    path: '/',
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    maxAge: 0
  });
}
