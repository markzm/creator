import { describe, expect, it } from 'vitest';
import {
  buildEntityIndex,
  findBacklinks,
  renameEntityEverywhere,
  tokenizeEntityRefs
} from '../backlinks';
import { createEmptyDocV6 } from '../schema/migrations';

describe('backlinks — Wiki AST tokenizer, backlink finder & global rename', () => {
  it('builds longest-first entity index and safely tokenizes text without XSS', () => {
    const doc = createEmptyDocV6();
    const wId = doc.ui.activeW!;
    const oId = doc.ui.activeO!;
    const cId = doc.ui.activeC!;

    doc.worlds[wId].name = '艾瑟兰大陆';
    doc.worlds[wId].data = { w_name: '艾瑟兰大陆', w_alias: '艾瑟兰' };
    doc.orgs[oId].name = '暮光议会';
    doc.orgs[oId].data = { o_name: '暮光议会' };
    doc.chars[cId].name = '莉莉安';
    doc.chars[cId].data = { name: '莉莉安', alias: '夜莺' };
    doc.glossary.push({ id: 'gl_1', term: '源石结晶', std: '源石' });

    const index = buildEntityIndex(doc);
    // Longest names come first ('艾瑟兰大陆' before '艾瑟兰')
    expect(index[0].name.length).toBeGreaterThanOrEqual(index[index.length - 1].name.length);

    const text = '在艾瑟兰大陆上，莉莉安加入了暮光议会并寻找源石结晶。<script>alert(1)</script>';
    const tokens = tokenizeEntityRefs(text, index);

    const refNames = tokens.filter((t) => t.type === 'ref').map((t) => t.text);
    expect(refNames).toEqual(['艾瑟兰大陆', '莉莉安', '暮光议会', '源石结晶']);

    // Rejoined token text equals original text byte-for-byte
    expect(tokens.map((t) => t.text).join('')).toBe(text);

    // Excludes self when excludeId is provided
    const selfExcluded = tokenizeEntityRefs(text, index, cId);
    expect(selfExcluded.filter((t) => t.type === 'ref').map((t) => t.text)).not.toContain('莉莉安');
  });

  it('finds backlinks across worlds, orgs, chars, timeline, plots, and scenes', () => {
    const doc = createEmptyDocV6();
    const wId = doc.ui.activeW!;
    const oId = doc.ui.activeO!;
    const cId = doc.ui.activeC!;

    doc.worlds[wId].name = '艾瑟兰';
    doc.worlds[wId].data = { w_name: '艾瑟兰' };
    doc.orgs[oId].name = '暮光议会';
    doc.orgs[oId].data = { o_name: '暮光议会', o_world: '艾瑟兰', o_leader: '莉莉安' };
    doc.chars[cId].name = '莉莉安';
    doc.chars[cId].data = { name: '莉莉安', world: '艾瑟兰', orgs: '暮光议会 | 首领' };

    doc.timeline.push({ id: 'ev_1', year: 300, name: '莉莉安加冕', desc: '于艾瑟兰王都' });
    doc.scenes.push({ id: 'sc_1', title: '议会密谈', chars: '莉莉安', location: '暮光议会大厅' });

    const charLinks = findBacklinks(doc, cId, '莉莉安');
    expect(charLinks.map((b) => b.sourceKind)).toEqual(['org', 'event', 'scene']);
  });

  it('renames an entity across the entire DocV6 and returns accurate replacement count', () => {
    const doc = createEmptyDocV6();
    const oId = doc.ui.activeO!;
    const cId = doc.ui.activeC!;

    doc.orgs[oId].name = '暮光议会';
    doc.orgs[oId].data = { o_name: '暮光议会', o_history: '暮光议会成立之初' };
    doc.chars[cId].name = '莉莉安';
    doc.chars[cId].data = { name: '莉莉安', orgs: '暮光议会 | 成员' };
    doc.scenes.push({ id: 'sc_1', title: '潜入暮光议会', note: '暮光议会守卫森严' });

    const { doc: renamed, count } = renameEntityEverywhere(doc, '暮光议会', '黎明议会');
    expect(count).toBe(5);
    expect(renamed.orgs[oId].name).toBe('黎明议会');
    expect(renamed.orgs[oId].data.o_name).toBe('黎明议会');
    expect(renamed.chars[cId].data.orgs).toBe('黎明议会 | 成员');
    expect(renamed.scenes[0].title).toBe('潜入黎明议会');
  });
});
