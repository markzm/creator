import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
export const root = fileURLToPath(new URL('../../', import.meta.url));
export const now = () => Math.floor(Date.now() / 1000);
export const emptyDoc = () => ({ _version: 6, worlds: {}, orgs: {}, chars: {}, templates: {}, articles: [], timeline: [], plots: [], scenes: [], glossary: [], stats: [] });
export function statements(source) {
  const result = []; let buffer = '';
  for (const line of source.split('\n')) {
    if (line.trim().startsWith('--')) continue;
    buffer += line + '\n';
    if (line.trim().endsWith(';') && (!/^\s*CREATE TRIGGER/i.test(buffer) || /\bEND;\s*$/i.test(buffer))) {
      if (buffer.trim()) result.push(buffer.trim()); buffer = '';
    }
  }
  if (buffer.trim()) throw new Error('Unterminated migration statement');
  return result;
}
export async function apply(source, db) { for (const statement of statements(source)) await db.prepare(statement).run(); }
export async function createFixture({ assets = false, bindings = {} } = {}) {
  const bundled = await build({ entryPoints: [root + 'worker/src/index.ts'], bundle: true, write: false, format: 'esm', target: 'es2022', platform: 'browser' });
  const upstream = { calls: [], content: '生成的创作草稿', status: 200, hold: null };
  const outboundService = async request => {
    const body = await request.json();
    upstream.calls.push({ url: request.url, authorization: request.headers.get('authorization'), body });
    if (upstream.hold) await upstream.hold;
    return new Response(JSON.stringify({ choices: [{ message: { content: upstream.content } }], usage: { total_tokens: 20 } }), {
      status: upstream.status, headers: { 'Content-Type': 'application/json' }
    });
  };
  const serviceBindings = assets ? { ASSETS: async request => {
    const path = decodeURIComponent(new URL(request.url).pathname);
    if (path.includes('..')) return new Response('Not found', { status: 404 });
    let file = path === '/' ? '/index.html' : path;
    const types = { html: 'text/html', js: 'text/javascript', css: 'text/css', svg: 'image/svg+xml', png: 'image/png', webp: 'image/webp', json: 'application/json', ico: 'image/x-icon' };
    try { const bytes = await readFile(root + 'web/dist' + file); return new Response(bytes, { headers: { 'Content-Type': types[file.split('.').pop()] || 'application/octet-stream' } }); }
    catch { return new Response('Not found', { status: 404 }); }
  } } : {};
  const options = { modules: true, script: bundled.outputFiles[0].text, compatibilityDate: '2024-09-23', compatibilityFlags: ['nodejs_compat'],
    d1Databases: { DB: 'creator-test', PREFLIGHT: 'creator-preflight' }, outboundService, serviceBindings,
    bindings: { SECRET_KEY: 'test-only-secret', OPENROUTER_API_KEY: 'sk-test-public-12345678901234567890', ...bindings } };
  const mf = new Miniflare(convertV4MiniflareOptions({ host: '127.0.0.1', port: 0, workers: [
    { ...options, name: 'creator-test' }, { ...options, name: 'creator-second' }
  ] }));
  const db = await mf.getD1Database('DB', 'creator-test');
  const sql = (text, ...args) => db.prepare(text).bind(...args).run();
  const files = (await readdir(root + 'migrations')).filter(f => f.endsWith('.sql')).sort();
  for (const file of files.filter(f => f < '0007')) await apply(await readFile(root + 'migrations/' + file, 'utf8'), db);
  const sessions = {};
  for (const [id, name, admin, superAdmin] of [[1, 'owner', 1, 1], [2, 'author', 0, 0], [3, 'admin', 1, 0], [4, 'reader', 0, 0]]) {
    await sql(`INSERT INTO users (id, email, password_hash, nickname, is_admin, is_super_admin, created_at, updated_at)
      VALUES (?, ?, 'unused', ?, ?, ?, ?, ?)`, id, `${name}@test.example`, name, admin, superAdmin, now(), now());
    const raw = `${name}-test-session`; sessions[name] = raw;
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
    const hash = [...new Uint8Array(digest)].map(n => n.toString(16).padStart(2, '0')).join('');
    await sql('INSERT INTO sessions (token_hash, user_id, user_agent, ip_addr, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)', hash, id, '', '', now() + 3600, now());
  }
  await apply(await readFile(root + 'migrations/0007_creator_management_ai_guards.sql', 'utf8'), db);
  const request = async (path, { user, method = 'GET', body, second = false } = {}) => {
    const init = { method, headers: { ...(user ? { Cookie: `creator_sid=${sessions[user]}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) };
    if (second) return (await mf.getWorker('creator-second')).fetch('https://creator.test/api' + path, init);
    return mf.dispatchFetch('https://creator.test/api' + path, init);
  };
  return { mf, db, sql, sessions, request, upstream };
}
