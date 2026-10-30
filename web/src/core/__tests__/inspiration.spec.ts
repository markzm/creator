import { describe, expect, it } from 'vitest';
import { createFromInspiration, type InspirationDraft } from '../inspiration';
import { createEmptyDocV6, migrateToV6 } from '../schema/migrations';
import { serializeBackupV6, mergeBackupIntoDoc } from '../backup';
import { applyConflictChoices, computeSyncHash, threeWayMerge } from '../diff';
import { filterInspirations, inspirations } from '../../data/inspiration';
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const seed = (target: InspirationDraft['target']): InspirationDraft => ({ inspirationId: target === 'char' ? 'forest-courier' : 'sky-islands', target, name: '我的故事', seed: '作者自己的创作种子', useArtwork: false });

describe('inspiration seeds and source metadata', () => {
  it('provides twelve unique seeds, four per genre, with three story questions each', () => {
    expect(new Set(inspirations.map(item => item.id)).size).toBe(12);
    for (const genre of ['fantasy', 'scifi', 'modern']) expect(filterInspirations('', genre, '')).toHaveLength(4);
    expect(filterInspirations('', '', 'character')).toHaveLength(4);
    expect(filterInspirations('巡林', '', '')[0]?.id).toBe('forest-courier');
    expect(inspirations.every(item => item.questions.length === 3 && item.seed.trim())).toBe(true);
  });
  it.each(['char', 'world', 'scene'] as const)('creates a fresh %s without overwriting other work', target => {
    const doc = createEmptyDocV6(), before = clone(doc);
    const path = createFromInspiration(doc, seed(target), 'https://studio.example');
    if (target === 'char') {
      expect(Object.keys(doc.chars)).toHaveLength(Object.keys(before.chars).length + 1);
      expect(doc.chars[doc.ui.activeC!]).toMatchObject({ name: '我的故事', visibility: 'private', inspirationId: 'forest-courier', data: { extra: '作者自己的创作种子' } });
      expect(doc.chars[doc.ui.activeC!]?.tachiE).toBeUndefined();
    } else if (target === 'world') {
      expect(doc.worlds[doc.ui.activeW!]).toMatchObject({ name: '我的故事', visibility: 'private', inspirationId: 'sky-islands', data: { w_core: '作者自己的创作种子' } });
    } else {
      expect(doc.scenes).toHaveLength(1); expect(doc.scenes[0]).toMatchObject({ inspirationId: 'sky-islands', conflict: '作者自己的创作种子', purpose: '作者自己的创作种子', status: '未写' });
      expect(path).toMatch(/^\/scenes\?edit=/);
    }
    for (const [id, value] of Object.entries(before.worlds)) expect(doc.worlds[id]).toEqual(value);
    for (const [id, value] of Object.entries(before.chars)) expect(doc.chars[id]).toEqual(value);
  });
  it('validates everything before changing a document', () => {
    const doc = createEmptyDocV6(), before = clone(doc);
    for (const draft of [{ ...seed('char'), inspirationId: 'unknown' }, { ...seed('world'), seed: ' ' }, { ...seed('char'), target: 'world' as const }]) {
      expect(() => createFromInspiration(doc, draft, 'https://studio.example')).toThrow();
      expect(doc).toEqual(before);
    }
  });
  it('round-trips all source IDs through migration, backup and restore; old records remain valid', () => {
    const doc = createEmptyDocV6();
    for (const target of ['char', 'world', 'scene'] as const) createFromInspiration(doc, seed(target), 'https://studio.example');
    const backup = JSON.parse(serializeBackupV6(doc));
    for (const restored of [migrateToV6(backup), mergeBackupIntoDoc(createEmptyDocV6(), backup)]) {
      expect(Object.values(restored.chars).some(item => item.inspirationId === 'forest-courier')).toBe(true);
      expect(Object.values(restored.worlds).some(item => item.inspirationId === 'sky-islands')).toBe(true);
      expect(restored.scenes[0]?.inspirationId).toBe('sky-islands');
    }
    const old = migrateToV6(createEmptyDocV6());
    expect(Object.values(old.chars)[0]?.inspirationId).toBeUndefined();
  });
  it('includes source IDs in fingerprints and preserves independent field edits during three-way merge', () => {
    const base = createEmptyDocV6(), id = Object.keys(base.worlds)[0]!;
    const local = clone(base), remote = clone(base);
    local.worlds[id]!.inspirationId = 'sky-islands'; remote.worlds[id]!.data.w_core = '另一台设备的修改';
    expect(computeSyncHash(local)).not.toBe(computeSyncHash(base));
    const merged = threeWayMerge(base, local, remote);
    expect(merged.conflicts).toEqual([]);
    expect(merged.mergedDoc.worlds[id]).toMatchObject({ inspirationId: 'sky-islands', data: { w_core: '另一台设备的修改' } });
    remote.worlds[id]!.inspirationId = 'tree-library';
    const conflict = threeWayMerge(base, local, remote);
    expect(conflict.conflicts.some(item => item.fieldId === '$inspirationId')).toBe(true);
    expect(applyConflictChoices(conflict.mergedDoc, conflict.conflicts, () => 'remote').worlds[id]?.inspirationId).toBe('tree-library');
  });
});
