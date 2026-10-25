import { describe, expect, it } from 'vitest';
import { createEmptyDocV6 } from '../schema/migrations';
import type { DocV6 } from '../schema/types';
import { uid } from '../uid';

describe('Official Reference Materials & Forking Logic', () => {
  it('creates copies with isReference=false when forking an official reference item', () => {
    const doc: DocV6 = createEmptyDocV6();
    const refWorldId = 'wd_astral_ref';
    doc.worlds[refWorldId] = {
      id: refWorldId,
      name: '星渊群岛',
      isReference: true,
      visibility: 'public',
      customInsp: ['以太洋流'],
      data: {
        w_name: '星渊群岛',
        w_type: '破碎浮空群岛'
      },
      createdAt: 1000,
      updatedAt: 1000
    };

    // Simulate forking
    const newId = uid('wd_');
    const copyName = doc.worlds[refWorldId].name + ' (衍生副本)';
    const forked = {
      ...JSON.parse(JSON.stringify(doc.worlds[refWorldId])),
      id: newId,
      name: copyName,
      isReference: false,
      visibility: 'private',
      data: {
        ...doc.worlds[refWorldId].data,
        w_name: copyName
      },
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    doc.worlds[newId] = forked;

    expect(doc.worlds[refWorldId].isReference).toBe(true);
    expect(doc.worlds[newId].isReference).toBe(false);
    expect(doc.worlds[newId].name).toContain('(衍生副本)');
    expect(doc.worlds[newId].data.w_name).toContain('(衍生副本)');
  });

  it('forks reference articles into private personal copies', () => {
    const refArt = {
      id: 'art_ref_1',
      title: '《星渊航志·序章：雾海灯塔》',
      category: '小说正文' as const,
      summary: '探险序章',
      content: '以太浓雾沉甸甸地压在破晓号上…',
      isReference: true,
      visibility: 'public' as const,
      wordCount: 50,
      createdAt: 1000,
      updatedAt: 1000
    };

    const newArtId = uid('art_');
    const forkedArt = {
      ...JSON.parse(JSON.stringify(refArt)),
      id: newArtId,
      title: refArt.title + ' (衍生副本)',
      isReference: false,
      visibility: 'private' as const,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    expect(refArt.isReference).toBe(true);
    expect(forkedArt.isReference).toBe(false);
    expect(forkedArt.visibility).toBe('private');
    expect(forkedArt.title).toContain('(衍生副本)');
  });
});
