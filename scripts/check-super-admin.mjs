import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const remote = process.argv.includes('--remote');
const cli = fileURLToPath(new URL('../node_modules/.bin/wrangler', import.meta.url));
const query = 'SELECT id, email, is_admin, is_super_admin, is_disabled, is_muted FROM users WHERE is_super_admin <> 0';
const result = spawnSync(cli, ['d1', 'execute', 'creator-db', remote ? '--remote' : '--local', '--json', '--command', query],
  { encoding: 'utf8', cwd: fileURLToPath(new URL('..', import.meta.url)) });
if (result.status !== 0) {
  console.error('无法检查现有超级管理员，已停止迁移。请确认数据库已完成 0001–0006 迁移。');
  console.error(result.stderr || result.stdout);
  process.exit(1);
}
let rows;
try { rows = JSON.parse(result.stdout).flatMap(r => r.results || []); }
catch { console.error('无法解析迁移预检结果，已停止迁移。'); process.exit(1); }
if (rows.length !== 1 || rows[0].is_super_admin !== 1 || rows[0].is_admin !== 1 || rows[0].is_disabled || rows[0].is_muted) {
  console.error('必须恰好有一名有效的现有超级管理员，未自动更改任何账号。');
  console.table(rows);
  process.exit(1);
}
console.log(`超级管理员预检通过：UID ${rows[0].id} (${rows[0].email})。该账号将在迁移后锁定。`);
