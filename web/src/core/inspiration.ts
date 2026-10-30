import { uid } from './uid';
import type { CharEntity, DocV6, SceneCard, WorldEntity } from './schema/types';
import { getInspiration, inspirationAsset, type InspirationTarget } from '../data/inspiration';

export interface InspirationDraft { inspirationId: string; target: InspirationTarget; name: string; seed: string; useArtwork: boolean }
/** Build the whole record before touching the document; cancellation has no side effects. */
export function createFromInspiration(doc: DocV6, draft: InspirationDraft, origin: string) {
  const item = getInspiration(draft.inspirationId);
  if (!item || !['scene', 'world', 'char'].includes(draft.target) ||
    (item.kind === 'character' ? draft.target !== 'char' : draft.target === 'char')) throw new Error('请选择有效的创作类型');
  const name = draft.name.trim().slice(0, 80), seed = draft.seed.trim();
  if (!name || !seed) throw new Error('请填写名称和创作种子');
  const now = Date.now();
  const base = { name, inspirationId: item.id, visibility: 'private' as const, createdAt: now, updatedAt: now };
  if (draft.target === 'char') {
    const id = uid('ch_');
    const image = inspirationAsset(item.id, 'detail');
    const character: CharEntity = { ...base, id, data: { name, impression: item.description, extra: seed },
      ...(draft.useArtwork && image && item.source.type === 'generated' ? { tachiE: new URL(image.src, origin).href } : {}) };
    doc.chars[id] = character; doc.ui.activeC = id;
    return `/char/${id}`;
  }
  if (draft.target === 'world') {
    const id = uid('wd_');
    const world: WorldEntity = { ...base, id, data: { w_name: name, w_core: seed }, customInsp: [...item.questions] };
    doc.worlds[id] = world; doc.ui.activeW = id;
    return `/world/${id}`;
  }
  const id = uid('sc_');
  const scene: SceneCard = { id, inspirationId: item.id, title: name, location: '', place: '', chars: '',
    conflict: seed, purpose: seed, note: item.description, beat: item.description, status: '未写', updatedAt: now };
  doc.scenes.push(scene);
  return `/scenes?edit=${encodeURIComponent(id)}`;
}
