import { describe, expect, it } from 'vitest';
import { applyConflictChoices, computeSyncHash, summarizeDocDiff, threeWayMerge } from '../diff';
import { createEmptyDocV6 } from '../schema/migrations';
import type { DocV6 } from '../schema/types';

function cloneDoc(doc: DocV6): DocV6 {
  return JSON.parse(JSON.stringify(doc));
}

describe('diff & threeWayMerge — Sync hash, diff summary, and field-level merge', () => {
  it('computes identical sync hash when only UI state changes', () => {
    const docA = createEmptyDocV6();
    const docB = cloneDoc(docA);
    docB.ui.activeW = null;
    docB.ui.nowYear = 999;

    expect(computeSyncHash(docA)).toBe(computeSyncHash(docB));

    const wId = Object.keys(docB.worlds)[0];
    docB.worlds[wId].data.w_name = '新世界';
    expect(computeSyncHash(docA)).not.toBe(computeSyncHash(docB));
  });

  it('auto-merges disjoint entity additions and disjoint field edits without conflict', () => {
    const base = createEmptyDocV6();
    const cId = base.ui.activeC!;
    base.chars[cId].name = '艾琳';
    base.chars[cId].data = {
      name: '艾琳',
      age: '18',
      job: '学徒'
    };

    const local = cloneDoc(base);
    const remote = cloneDoc(base);

    // Local edits `age` on c1 and adds new character `c_local`
    local.chars[cId].data.age = '19';
    local.chars.c_local = {
      id: 'c_local',
      name: '本地新角色',
      data: { name: '本地新角色' },
      createdAt: 100,
      updatedAt: 200
    };

    // Remote edits `job` on c1 and adds new character `c_remote`
    remote.chars[cId].data.job = '大法师';
    remote.chars.c_remote = {
      id: 'c_remote',
      name: '云端新角色',
      data: { name: '云端新角色' },
      createdAt: 100,
      updatedAt: 250
    };

    const result = threeWayMerge(base, local, remote);
    expect(result.canAutoMerge).toBe(true);
    expect(result.conflicts).toHaveLength(0);
    expect(result.mergedDoc.chars[cId].data).toEqual({
      name: '艾琳',
      age: '19',
      job: '大法师'
    });
    expect(result.mergedDoc.chars.c_local).toBeDefined();
    expect(result.mergedDoc.chars.c_remote).toBeDefined();
    expect(result.summary.charsAdded).toBe(2);
    expect(result.summary.charsModified).toBe(1);
  });

  it('detects true field-level conflict when both local and remote modify the same field differently', () => {
    const base = createEmptyDocV6();
    const cId = base.ui.activeC!;
    base.chars[cId].name = '凯恩';
    base.chars[cId].data = {
      name: '凯恩',
      weapon: '铁剑',
      habit: '喝茶'
    };

    const local = cloneDoc(base);
    const remote = cloneDoc(base);

    local.chars[cId].data.weapon = '暗影双刃';
    remote.chars[cId].data.weapon = '圣光长枪';
    // Both also change `habit` to the exact same value -> should NOT conflict
    local.chars[cId].data.habit = '喝咖啡';
    remote.chars[cId].data.habit = '喝咖啡';

    const result = threeWayMerge(base, local, remote);
    expect(result.canAutoMerge).toBe(false);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]).toEqual({
      kind: 'char',
      entityId: cId,
      entityName: '凯恩',
      fieldId: 'weapon',
      localVal: '暗影双刃',
      remoteVal: '圣光长枪',
      baseVal: '铁剑'
    });
    expect(result.mergedDoc.chars[cId].data.habit).toBe('喝咖啡');
  });

  it('supports two-way merge when base is null', () => {
    const local = createEmptyDocV6();
    const cId = local.ui.activeC!;
    local.chars[cId].data = { name: '诺拉', age: '20' };

    const remote = cloneDoc(local);
    remote.chars[cId].data = { name: '诺拉', age: '', job: '游侠' };
    local.chars[cId].data.job = '';

    const clean = threeWayMerge(null, local, remote);
    expect(clean.canAutoMerge).toBe(true);
    expect(clean.mergedDoc.chars[cId].data.age).toBe('20');
    expect(clean.mergedDoc.chars[cId].data.job).toBe('游侠');
  });

  it('summarizes array deltas in summarizeDocDiff', () => {
    const a = createEmptyDocV6();
    const b = cloneDoc(a);
    b.timeline.push({ id: 'ev1', year: 100, name: '创世' });
    b.glossary.push({ id: 'g1', term: '以太', def: '能量' });

    const sum = summarizeDocDiff(a, b);
    expect(sum.timelineDelta).toBe(1);
    expect(sum.glossaryDelta).toBe(1);
  });
});

describe('threeWayMerge — metadata, whole-record and preference conflicts', () => {
  function baseDoc(): DocV6 {
    const d = createEmptyDocV6(() => 'u', 1000);
    const cId = d.ui.activeC!;
    d.chars[cId].data = { name: '艾琳' };
    d.chars[cId].name = '艾琳';
    return d;
  }

  it('takes a remote-only visibility/shareId change instead of letting local silently win', () => {
    const base = baseDoc();
    const cId = base.ui.activeC!;
    const local = cloneDoc(base);
    const remote = cloneDoc(base);
    remote.chars[cId].visibility = 'public';
    remote.chars[cId].shareId = 'sh_1';
    const res = threeWayMerge(base, local, remote);
    expect(res.canAutoMerge).toBe(true);
    expect(res.mergedDoc.chars[cId].visibility).toBe('public');
    expect(res.mergedDoc.chars[cId].shareId).toBe('sh_1');
  });

  it('flags a metadata conflict when both sides changed the same meta key differently', () => {
    const base = baseDoc();
    const cId = base.ui.activeC!;
    const local = cloneDoc(base);
    const remote = cloneDoc(base);
    local.chars[cId].avatar = '🧙';
    remote.chars[cId].avatar = '🧝';
    const res = threeWayMerge(base, local, remote);
    expect(res.canAutoMerge).toBe(false);
    expect(res.conflicts.some((c) => c.fieldId === '$avatar' && c.entityId === cId)).toBe(true);
  });

  it('surfaces a whole-record conflict for articles edited on both sides instead of silent last-write-wins', () => {
    const base = baseDoc();
    base.articles = [
      { id: 'art', title: 'A', category: '小说正文', summary: '', content: 'base', visibility: 'private', orgIds: [], charIds: [], wordCount: 4, createdAt: 1, updatedAt: 1 }
    ];
    const local = cloneDoc(base);
    const remote = cloneDoc(base);
    local.articles[0].content = 'local text';
    local.articles[0].updatedAt = 10;
    remote.articles[0].content = 'remote text';
    remote.articles[0].updatedAt = 20;
    const res = threeWayMerge(base, local, remote);
    expect(res.canAutoMerge).toBe(false);
    const conf = res.conflicts.find((c) => c.kind === 'article' && c.fieldId === '*');
    expect(conf).toBeDefined();
    // provisional pick is the newer side
    expect(res.mergedDoc.articles[0].content).toBe('remote text');
    // the user picks local
    const chosen = applyConflictChoices(res.mergedDoc, res.conflicts, () => 'local');
    expect(chosen.articles[0].content).toBe('local text');
  });

  it('merges preferences per key with 3-way semantics', () => {
    const base = baseDoc();
    base.preferences = { preferredGenre: '奇幻', writingTone: '细腻', defaultPerspective: '第三人称', aiCustomInstruction: '' };
    const local = cloneDoc(base);
    const remote = cloneDoc(base);
    local.preferences!.writingTone = '冷峻';
    remote.preferences!.preferredGenre = '科幻';
    const res = threeWayMerge(base, local, remote);
    expect(res.canAutoMerge).toBe(true);
    expect(res.mergedDoc.preferences).toMatchObject({ preferredGenre: '科幻', writingTone: '冷峻' });
  });

  it('excludes official reference items from the sync hash', () => {
    const a = createEmptyDocV6(() => 'u', 1000);
    const b = cloneDoc(a);
    b.worlds.wd_ref = { id: 'wd_ref', name: '官方', isReference: true, customInsp: [], data: { w_name: '官方' }, createdAt: 1, updatedAt: 1 };
    expect(computeSyncHash(a)).toBe(computeSyncHash(b));
    expect(summarizeDocDiff(a, b).worldsAdded).toBe(1); // summary still sees it; hash does not
  });
});
