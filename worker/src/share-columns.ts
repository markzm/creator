export const shareMetaColumns = `id, user_id as userId, owner_name as ownerName, kind, title, summary,
 visibility, entity_id as entityId, tags, word_count as wordCount, canon_status as canonStatus,
 cocreation_id as cocreationId, canon_requested as canonRequested, tachi_e_url as tachiEUrl,
 author_id as authorId, canon_review as canonReview, reviewed_by as reviewedBy, reviewed_at as reviewedAt,
 created_at as createdAt, updated_at as updatedAt, rev`;
export const shareFullColumns = `${shareMetaColumns}, content, draft_code as draftCode`;
export const shareListColumns = `${shareMetaColumns}, '' as content, '' as draftCode`;
