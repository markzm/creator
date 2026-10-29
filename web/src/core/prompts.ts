import type { AITask, DocV6, EntityKind, PromptEntityRef, PromptTemplate } from './schema/types';

export const AI_TASKS: AITask[] = ['field_gen', 'entity_gen', 'article_write', 'article_continue', 'article_summary', 'prompt_generate', 'prompt_refine'];
export const TASK_LABELS: Record<AITask, string> = {
  field_gen: '字段设定', entity_gen: '完整设定', article_write: '文章创作', article_continue: '文章续写',
  article_summary: '文章摘要', prompt_generate: '生成提示词', prompt_refine: '润色提示词'
};
export const refKey = (ref: PromptEntityRef) => `${ref.kind}:${ref.id}`;
export function normalizePromptTemplates(raw: unknown): PromptTemplate[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  return raw.filter(p => p && typeof p.id === 'string' && p.id && !seen.has(p.id) && seen.add(p.id))
    .map(p => ({ id: p.id, title: String(p.title || '未命名提示词'), category: String(p.category || '通用'),
      content: String(p.content || ''), ...(AI_TASKS.includes(p.task) ? { task: p.task } : {}),
      entityRefs: (Array.isArray(p.entityRefs) ? p.entityRefs : []).filter((r: any) =>
        r && ['world', 'org', 'char'].includes(r.kind) && typeof r.id === 'string' && r.id),
      createdAt: Number(p.createdAt) || 0, updatedAt: Number(p.updatedAt) || 0 }));
}
export function entityForRef(doc: DocV6, ref: PromptEntityRef) {
  return (ref.kind === 'world' ? doc.worlds : ref.kind === 'org' ? doc.orgs : doc.chars)[ref.id];
}
export function contextOptions(doc: DocV6) {
  const labels = { world: '世界观', org: '组织', char: '角色' };
  return (['world', 'org', 'char'] as EntityKind[]).flatMap(kind => {
    const collection = kind === 'world' ? doc.worlds : kind === 'org' ? doc.orgs : doc.chars;
    return Object.values(collection || {}).map(entity => ({ kind, id: entity.id,
      label: `${labels[kind]} · ${entity.name || '未命名'}` }));
  });
}
export function defaultContextRefs(doc: DocV6, kind?: EntityKind | 'article', id?: string): PromptEntityRef[] {
  const refs: PromptEntityRef[] = [];
  const add = (ref: PromptEntityRef) => { if (entityForRef(doc, ref) && !refs.some(r => refKey(r) === refKey(ref))) refs.push(ref); };
  const named = (target: EntityKind, name?: string) => {
    if (!name?.trim()) return;
    const collection = target === 'world' ? doc.worlds : target === 'org' ? doc.orgs : doc.chars;
    const matches = Object.values(collection).filter(e => e.id === name.trim() || e.name === name.trim());
    if (matches.length === 1) add({ kind: target, id: matches[0]!.id });
  };
  if (kind === 'article') {
    const article = doc.articles.find(a => a.id === id);
    if (article?.worldId) add({ kind: 'world', id: article.worldId });
    article?.orgIds?.forEach(id => add({ kind: 'org', id }));
    article?.charIds?.forEach(id => add({ kind: 'char', id }));
  } else if (kind && id) add({ kind, id });
  // Resolve explicit relationships only. Merely selecting a world in another view is not a link.
  for (let index = 0; index < refs.length; index++) {
    const ref = refs[index]!;
    const entity = entityForRef(doc, ref);
    if (ref.kind === 'char') {
      named('world', entity?.data.world);
      (entity?.data.orgs || '').split('\n').forEach(line => named('org', line.split('|')[0]));
    } else if (ref.kind === 'org') named('world', entity?.data.o_world);
  }
  return refs;
}
export function contextText(doc: DocV6, refs: PromptEntityRef[]) {
  const seen = new Set<string>();
  return refs.filter(ref => !seen.has(refKey(ref)) && seen.add(refKey(ref))).flatMap(ref => {
    const entity = entityForRef(doc, ref);
    return entity ? [{ kind: ref.kind, name: entity.name, data: entity.data }] : [];
  }).map(item => JSON.stringify(item)).join('\n');
}
