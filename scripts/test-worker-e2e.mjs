import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import bcrypt from 'bcryptjs';
import { createFixture, emptyDoc, now, root } from '../worker/tests/fixture.mjs';
const fixture = await createFixture({ assets: true });
const { mf, db, sql } = fixture;
try {
  const authorDoc = emptyDoc();
  await sql('UPDATE users SET password_hash = ? WHERE id = 4', await bcrypt.hash('TestPass123!', 4));
  authorDoc.worlds.author_world = { id: 'author_world', name: '作者未发布世界', customInsp: [], data: { w_name: '作者未发布世界', w_core: '作者原始设定' }, createdAt: 1, updatedAt: 1 };
  for (const [id, data] of [[2, authorDoc], [1, { ...emptyDoc(), worlds: { own_world: { id: 'own_world', name: '管理员个人世界', customInsp: [], data: { w_name: '管理员个人世界', w_core: '管理员自己的设定' }, createdAt: 1, updatedAt: 1 } } }]]) {
    await sql('INSERT INTO user_docs (user_id,rev,doc_json,byte_size,updated_at) VALUES (?,1,?,?,?)', id, JSON.stringify(data), JSON.stringify(data).length, now());
  }
  for (let chunk = 0; chunk < 20; chunk++) {
    await db.batch(Array.from({ length: 50 }, (_, offset) => {
      const n = chunk * 50 + offset;
      return db.prepare(`INSERT INTO users (id,email,password_hash,nickname,last_seen_at,created_at,updated_at) VALUES (?,?,'unused',?,?,?,?)`)
        .bind(n + 10, `creator${n}@test.example`, `创作者${String(n).padStart(4, '0')}`, n < 500 ? now() : now() - 1000, now(), now());
    }));
  }
  await db.batch(Array.from({ length: 50 }, (_, n) => db.prepare(`INSERT INTO world_shares
    (id,user_id,owner_name,kind,title,summary,content,visibility,created_at,updated_at) VALUES (?,2,'author','article',?,?,?,'public',?,?)`)
    .bind(`feed_${String(n).padStart(3, '0')}`, `大厅文章${n}`, '作品摘要', `完整正文${n}`, now(), now())));
  await sql(`INSERT INTO world_shares (id,user_id,owner_name,kind,title,content,visibility,created_at,updated_at)
    VALUES ('private_e2e',2,'author','article','作者私有作品','私有作品正文','private',?,?)`, now(), now());
  await mkdir(root + 'artifacts/e2e', { recursive: true });
  const url = await mf.ready;
  // Seed timing must not age the presence/session fixtures before the browser starts.
  await sql(`UPDATE users SET last_seen_at = CAST(strftime('%s', 'now') AS INTEGER) - CASE WHEN id < 510 THEN 0 ELSE 1000 END WHERE id >= 10`);
  await sql(`UPDATE sessions SET expires_at = CAST(strftime('%s', 'now') AS INTEGER) + 86400`);
  const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const env = { ...process.env, E2E_BASE_URL: url.origin, E2E_FIXTURE: '1',
    ...(existsSync(chrome) && !process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { PLAYWRIGHT_CHROMIUM_EXECUTABLE: chrome } : {}) };
  const status = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [root + 'web/node_modules/@playwright/test/cli.js', 'test', 'creator-cloudflare.spec.ts', 'inspiration.spec.ts'], { cwd: root + 'web', env, stdio: 'inherit' });
    child.on('error', reject); child.on('exit', code => resolve(code || 0));
  });
  process.exitCode = status;
} finally { await mf.dispose(); }
