export function canonical(value: any): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  return '{' + Object.keys(value).filter(k => value[k] !== undefined).sort()
    .map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
}
export async function documentHash(data: any) {
  const { ui: _ui, ...content } = data;
  if (Array.isArray(content.promptTemplates) && !content.promptTemplates.length) delete content.promptTemplates;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical(content)));
  return [...new Uint8Array(digest)].map(n => n.toString(16).padStart(2, '0')).join('');
}
export function validDocument(data: any): boolean {
  return data?._version === 6 && ['worlds', 'orgs', 'chars'].every(k =>
    data[k] && typeof data[k] === 'object' && !Array.isArray(data[k])) &&
    ['articles', 'timeline', 'plots', 'scenes', 'glossary', 'promptTemplates'].every(k =>
      data[k] === undefined || Array.isArray(data[k]));
}
export const documentSummary = (data: any) => `世界观:${Object.keys(data.worlds || {}).length} 组织:${Object.keys(data.orgs || {}).length} 角色:${Object.keys(data.chars || {}).length}`;

// Keep fifty recent snapshots plus one per day for thirty days. Administrative snapshots
// also live in the immutable audit table, independently of this user-facing retention window.
export function pruneRevisions(db: D1Database, userId: number, now: number) {
  return db.prepare(`DELETE FROM doc_revisions WHERE changes() > 0 AND user_id = ? AND id NOT IN (
    SELECT id FROM doc_revisions WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 50
  ) AND id NOT IN (
    SELECT MAX(id) FROM doc_revisions WHERE user_id = ? AND created_at >= ? GROUP BY CAST(created_at / 86400 AS INTEGER)
  )`).bind(userId, userId, userId, now - 30 * 86400);
}

// Older rows have no hash until their first sync. This one-time read avoids inventing a new revision.
export async function legacyDocumentMatches(db: D1Database, userId: number, rev: number, hash: string) {
  const row = await db.prepare('SELECT doc_json FROM user_docs WHERE user_id = ? AND rev = ?')
    .bind(userId, rev).first<{ doc_json: string }>();
  return !!row && await documentHash(JSON.parse(row.doc_json)) === hash;
}
