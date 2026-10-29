import { describe, expect, it } from 'vitest';
import { normalizeBackup, serializeBackupV6, mergeBackupIntoDoc } from '../backup';
import { applyConflictChoices, computeSyncHash, isDocEffectivelyEmpty, threeWayMerge } from '../diff';
import { contextText, defaultContextRefs, normalizePromptTemplates } from '../prompts';
import { extractReferenceSubset, mergeReferenceMaterials, stripReferenceItems } from '../reference';
import { createEmptyDocV6, migrateToV6 } from '../schema/migrations';
import type { DocV6, PromptTemplate } from '../schema/types';
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const prompt = (id = 'p1'): PromptTemplate => ({ id, title: '角色对白', category: '对话', content: '个人私密提示词', task: 'field_gen', entityRefs: [{ kind: 'char', id: 'c' }], createdAt: 1, updatedAt: 2 });
const doc = (): DocV6 => createEmptyDocV6();

describe('personal prompts: persistence, merge and privacy', () => {
  it('accepts old backups and normalizes malformed/duplicate prompt entries', () => {
    expect(migrateToV6({ _version: 6, worlds: {}, orgs: {}, chars: {} }).promptTemplates || []).toEqual([]);
    expect(normalizePromptTemplates([prompt(), prompt(), null, { id: 'p2', task: 'database_query', entityRefs: [{ kind: 'admin', id: '1' }] }])).toEqual([
      prompt(), { id: 'p2', title: '未命名提示词', category: '通用', content: '', entityRefs: [], createdAt: 0, updatedAt: 0 }
    ]);
  });
  it('round-trips prompts and article share revisions through backup and migration', () => {
    const source = doc(); source.promptTemplates = [prompt()];
    source.articles = [{ id: 'a', title: 'a', content: 'a', summary: '', category: '小说正文', orgIds: [], charIds: [], visibility: 'public', shareId: 's', shareRev: 7, wordCount: 1, createdAt: 1, updatedAt: 1 }];
    const backup = JSON.parse(serializeBackupV6(source));
    expect(normalizeBackup(backup).promptTemplates).toEqual([prompt()]);
    const restored = mergeBackupIntoDoc(doc(), backup);
    expect(restored.promptTemplates).toEqual([prompt()]);
    expect(restored.articles[0]?.shareRev).toBe(7);
    restored.promptTemplates![0]!.content = 'new'; restored.promptTemplates![0]!.updatedAt = 10;
    expect(mergeBackupIntoDoc(restored, backup).promptTemplates![0]!.content).toBe('new');
  });
  it('hashes prompts, treats a prompt-only workspace as content, and merges different IDs', () => {
    const base = doc(), local = clone(base), remote = clone(base);
    local.promptTemplates = [prompt()]; remote.promptTemplates = [prompt('p2')];
    const emptyPrompts = clone(base); emptyPrompts.promptTemplates = [];
    expect(computeSyncHash(emptyPrompts)).toBe(computeSyncHash(base));
    expect(computeSyncHash(local)).not.toBe(computeSyncHash(base));
    expect(isDocEffectivelyEmpty(local)).toBe(false);
    const result = threeWayMerge(base, local, remote);
    expect(result.conflicts).toEqual([]);
    expect(result.mergedDoc.promptTemplates!.map(p => p.id).sort()).toEqual(['p1', 'p2']);
  });
  it.each(['local', 'remote'] as const)('preserves a delete-versus-edit conflict when choosing %s', side => {
    const base = doc(); base.promptTemplates = [prompt()];
    const local = clone(base), remote = clone(base); local.promptTemplates = [];
    remote.promptTemplates![0]!.content = 'remote edit';
    const result = threeWayMerge(base, local, remote);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]!.kind).toBe('prompt');
    const resolved = applyConflictChoices(result.mergedDoc, result.conflicts, () => side);
    expect(resolved.promptTemplates).toEqual(side === 'local' ? [] : remote.promptTemplates);
  });
  it('keeps private templates out of references and ignores injected reference templates', () => {
    const source = doc(); source.promptTemplates = [prompt()];
    expect(JSON.stringify(extractReferenceSubset(source))).not.toContain('个人私密提示词');
    expect(stripReferenceItems(source).promptTemplates).toEqual([prompt()]);
    const target = doc(); mergeReferenceMaterials(target, source);
    expect(target.promptTemplates || []).toEqual([]);
  });
});

describe('explicit AI context selection', () => {
  it('follows declared world/org links without inheriting unrelated active selections', () => {
    const source = doc();
    source.worlds = { linked: { id: 'linked', name: '关联世界', data: { w_core: '规则' }, customInsp: [], createdAt: 1, updatedAt: 1 }, other: { id: 'other', name: '不相关世界', data: { w_core: '不能发送' }, customInsp: [], createdAt: 1, updatedAt: 1 } };
    source.orgs = { org: { id: 'org', name: '议会', data: { o_world: '关联世界' }, createdAt: 1, updatedAt: 1 } };
    source.chars = { c: { id: 'c', name: '角色', data: { world: 'linked', orgs: '议会|成员' }, avatar: 'private-avatar', createdAt: 1, updatedAt: 1 } };
    source.ui.activeW = 'other';
    const refs = defaultContextRefs(source, 'char', 'c');
    expect(refs).toEqual([{ kind: 'char', id: 'c' }, { kind: 'world', id: 'linked' }, { kind: 'org', id: 'org' }]);
    const context = contextText(source, refs);
    expect(context).toContain('规则'); expect(context).not.toContain('不能发送'); expect(context).not.toContain('private-avatar');
    source.chars.c!.data = {};
    expect(defaultContextRefs(source, 'char', 'c')).toEqual([{ kind: 'char', id: 'c' }]);
  });
  it('does not guess ambiguous names or stale article relations', () => {
    const source = doc(); const baseWorld = Object.values(source.worlds)[0]!;
    source.worlds = { a: { ...baseWorld, id: 'a', name: '同名' }, b: { ...baseWorld, id: 'b', name: '同名' } };
    const char = Object.values(source.chars)[0]!; char.data.world = '同名';
    expect(defaultContextRefs(source, 'char', char.id)).toEqual([{ kind: 'char', id: char.id }]);
    source.articles = [{ id: 'a', worldId: 'deleted' } as any];
    expect(defaultContextRefs(source, 'article', 'a')).toEqual([]);
  });
});
