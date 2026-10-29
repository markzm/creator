import type { UserRow } from './types';
export type ShareAccess = { id: string; user_id: number; visibility: string; rev: number };
export const canReadShare = (user: UserRow | null, share: Pick<ShareAccess, 'user_id' | 'visibility'>) =>
  share.visibility === 'public' || !!user && (user.id === share.user_id || !!user.is_super_admin);
export const canManageShare = (user: UserRow, share: ShareAccess) =>
  user.id === share.user_id || !!user.is_super_admin || !!user.is_admin && share.visibility === 'public';

export async function mutateShare(db: D1Database, user: UserRow, share: ShareAccess,
  write: D1PreparedStatement, action: string) {
  const statements: D1PreparedStatement[] = [];
  if (user.id !== share.user_id) {
    statements.push(db.prepare(`INSERT INTO admin_content_audit
      (actor_id, owner_id, target_kind, target_id, action, base_rev, before_json, created_at)
      SELECT ?, user_id, 'share', id, ?, rev, json_object(
        'id', id, 'userId', user_id, 'ownerName', owner_name, 'kind', kind, 'title', title,
        'summary', summary, 'content', content, 'draftCode', draft_code, 'visibility', visibility,
        'entityId', entity_id, 'tags', tags, 'wordCount', word_count, 'canonStatus', canon_status,
        'cocreationId', cocreation_id, 'canonRequested', canon_requested, 'canonReview', canon_review,
        'tachiEUrl', tachi_e_url, 'authorId', author_id, 'reviewedBy', reviewed_by, 'reviewedAt', reviewed_at,
        'createdAt', created_at, 'updatedAt', updated_at, 'rev', rev), ?
      FROM world_shares WHERE id = ? AND rev = ?`).bind(user.id, action, Math.floor(Date.now() / 1000), share.id, share.rev));
  }
  statements.push(write);
  const results = await db.batch(statements);
  return !!results[results.length - 1].meta.changes;
}
