import { describe, expect, it } from 'vitest';
import {
  extractReferenceSubset,
  mergeReferenceMaterials,
  stripReferenceItems
} from '../reference';
import { isDocEffectivelyEmpty } from '../diff';
import { createEmptyDocV6 } from '../schema/migrations';
import { createStarterExampleDoc } from '../starterExample';
import type { DocV6 } from '../schema/types';

function docWithMixedContent(): DocV6 {
  const doc = createEmptyDocV6(() => 'fixed', 1000);
  doc.worlds = {};
  doc.chars = {};
  doc.worlds.wd_ref = {
    id: 'wd_ref',
    name: '官方世界',
    isReference: true,
    customInsp: [],
    data: { w_name: '官方世界' },
    createdAt: 1000,
    updatedAt: 1000
  };
  doc.worlds.wd_private = {
    id: 'wd_private',
    name: '我的私有世界',
    customInsp: [],
    data: { w_name: '我的私有世界', w_core: '绝密' },
    createdAt: 1000,
    updatedAt: 1000
  };
  doc.chars.ch_private = {
    id: 'ch_private',
    name: '私有角色',
    data: { name: '私有角色' },
    avatar: '🧙',
    createdAt: 1000,
    updatedAt: 1000
  };
  doc.articles = [
    {
      id: 'art_ref',
      title: '官方范文',
      category: '小说正文',
      summary: '',
      content: 'ref',
      isReference: true,
      visibility: 'public',
      orgIds: [],
      charIds: [],
      wordCount: 3,
      createdAt: 1000,
      updatedAt: 1000
    },
    {
      id: 'art_private',
      title: '我的日记',
      category: '小说正文',
      summary: '',
      content: 'secret',
      visibility: 'private',
      orgIds: [],
      charIds: [],
      wordCount: 6,
      createdAt: 1000,
      updatedAt: 1000
    }
  ];
  doc.preferences = { preferredGenre: 'x', writingTone: 'y', defaultPerspective: 'z', aiCustomInstruction: 'private prompt' };
  return doc;
}

describe('core/reference — official reference material boundaries', () => {
  it('extractReferenceSubset keeps only isReference items and drops private data/preferences', () => {
    const subset = extractReferenceSubset(docWithMixedContent());
    expect(Object.keys(subset.worlds)).toEqual(['wd_ref']);
    expect(Object.keys(subset.chars)).toEqual([]);
    expect(subset.articles.map((a) => a.id)).toEqual(['art_ref']);
    expect(subset.preferences).toBeUndefined();
    expect(subset.stats).toEqual([]);
    expect(JSON.stringify(subset)).not.toContain('绝密');
    expect(JSON.stringify(subset)).not.toContain('private prompt');
  });

  it('stripReferenceItems removes reference items but keeps everything user-authored', () => {
    const stripped = stripReferenceItems(docWithMixedContent());
    expect(Object.keys(stripped.worlds)).toEqual(['wd_private']);
    expect(Object.keys(stripped.chars)).toEqual(['ch_private']);
    expect(stripped.articles.map((a) => a.id)).toEqual(['art_private']);
    expect(stripped.preferences?.aiCustomInstruction).toBe('private prompt');
  });

  it('mergeReferenceMaterials adds, updates newer, and removes retired reference items without touching user items', () => {
    const target = docWithMixedContent();
    target.worlds.wd_old = {
      id: 'wd_old',
      name: '已下架范例',
      isReference: true,
      customInsp: [],
      data: {},
      createdAt: 1,
      updatedAt: 1
    };
    const official = createEmptyDocV6(() => 'o', 1);
    official.worlds = {
      wd_ref: { ...target.worlds.wd_ref, name: '官方世界 v2', updatedAt: 2000 },
      wd_new: { id: 'wd_new', name: '新范例', isReference: true, customInsp: [], data: {}, createdAt: 1, updatedAt: 1 },
      wd_leak: { id: 'wd_leak', name: '泄露', customInsp: [], data: {}, createdAt: 1, updatedAt: 1 }
    };
    const res = mergeReferenceMaterials(target, official);
    // removed: the retired world AND the reference article that is absent from the official doc
    expect(res).toEqual({ added: 1, updated: 1, removed: 2 });
    expect(target.articles.map((a) => a.id)).toEqual(['art_private']);
    expect(target.worlds.wd_ref.name).toBe('官方世界 v2');
    expect(target.worlds.wd_new).toBeDefined();
    expect(target.worlds.wd_old).toBeUndefined();
    expect(target.worlds.wd_leak).toBeUndefined();
    expect(target.worlds.wd_private.data.w_core).toBe('绝密');
    expect(target.chars.ch_private.avatar).toBe('🧙');
  });

  it('isDocEffectivelyEmpty treats the starter example (all references) as empty but any user content as non-empty', () => {
    expect(isDocEffectivelyEmpty(createStarterExampleDoc())).toBe(true);
    expect(isDocEffectivelyEmpty(createEmptyDocV6())).toBe(true);
    const withArticle = createEmptyDocV6();
    withArticle.articles = [
      {
        id: 'a',
        title: 't',
        category: '小说正文',
        summary: '',
        content: 'c',
        visibility: 'private',
        orgIds: [],
        charIds: [],
        wordCount: 1,
        createdAt: 1,
        updatedAt: 1
      }
    ];
    expect(isDocEffectivelyEmpty(withArticle)).toBe(false);
    const withChar = createEmptyDocV6();
    Object.values(withChar.chars)[0].data.name = '有人';
    expect(isDocEffectivelyEmpty(withChar)).toBe(false);
  });
});
