import { describe, expect, it } from 'vitest';
import { checkConsistency } from '../consistency';
import { exportAllMd, fmtOutput } from '../format';
import { replaceAllOccurrences, scanAllOccurrences } from '../glossary';
import { buildGraphLayout } from '../graphLayout';
import { CG, WG } from '../legacy/fields';
import { generateRandomPersona } from '../persona';
import { createEmptyDocV6 } from '../schema/migrations';
import { globalSearch } from '../search';
import { avgDone, dateStr, recordDailyStats, streakDays, totalChars } from '../stats';
import { uid } from '../uid';

describe('core utility modules — format, consistency, graphLayout, stats, glossary, persona, search', () => {
  it('generates prefixed unique ids via uid()', () => {
    const id1 = uid('ch_');
    const id2 = uid('ch_');
    expect(id1.startsWith('ch_')).toBe(true);
    expect(id1).not.toBe(id2);
  });

  it('formats output in text, md, json and exports full Markdown', () => {
    const data = { w_name: '艾瑟兰', w_type: '大陆' };
    const txt = fmtOutput(WG, data, 'text', false, true, 'zh');
    expect(txt).toContain('【基础】');
    expect(txt).toContain('名称：艾瑟兰');

    const md = fmtOutput(WG, data, 'md', false, true, 'en');
    expect(md).toContain('## Basic');
    expect(md).toContain('- **Name**：艾瑟兰');

    const json = fmtOutput(WG, data, 'json', false, true);
    expect(JSON.parse(json)).toEqual(data);

    const doc = createEmptyDocV6();
    const wId = doc.ui.activeW!;
    doc.worlds[wId].data = data;
    const allMd = exportAllMd(doc, 'zh');
    expect(allMd).toContain('# 🌍 世界观');
    expect(allMd).toContain('## 艾瑟兰');
  });

  it('detects all consistency issues in checkConsistency', () => {
    const doc = createEmptyDocV6();
    const wId = doc.ui.activeW!;
    doc.worlds[wId].name = '艾瑟兰';
    doc.worlds[wId].data = { w_name: '艾瑟兰', w_races: '人类、精灵、矮人' };

    const issues = checkConsistency(
      {
        gender: '男',
        personality: '她总是沉默寡言',
        power: '火焰操控',
        weakness: '惧怕火焰',
        principle: '绝不杀人',
        job: '王牌刺客',
        age: '18岁',
        growth: '30年前曾经历大战',
        world: '艾瑟兰',
        race: '龙裔'
      },
      'char',
      doc
    );

    expect(issues.length).toBe(5);
    expect(issues.some((i) => i.includes('性别「男」'))).toBe(true);
    expect(issues.some((i) => i.includes('能力是火'))).toBe(true);
    expect(issues.some((i) => i.includes('绝不杀'))).toBe(true);
    expect(issues.some((i) => i.includes('30 年前'))).toBe(true);
    expect(issues.some((i) => i.includes('龙裔'))).toBe(true);
  });

  it('computes graph nodes and edges for all and char-only layers', () => {
    const doc = createEmptyDocV6();
    const wId = doc.ui.activeW!;
    const oId = doc.ui.activeO!;
    const c1 = doc.ui.activeC!;
    const c2 = 'ch_2';

    doc.worlds[wId].data = { w_name: '艾瑟兰' };
    doc.orgs[oId].data = { o_name: '暮光议会', o_world: '艾瑟兰' };
    doc.chars[c1].data = {
      name: '艾琳',
      world: '艾瑟兰',
      orgs: '暮光议会 | 执事',
      relations: '凯恩 | 宿敌 | 曾是同门'
    };
    doc.chars[c2] = {
      id: c2,
      name: '凯恩',
      data: { name: '凯恩' },
      createdAt: 1,
      updatedAt: 1
    };

    const allGraph = buildGraphLayout(doc, 'all');
    expect(allGraph.nodes).toHaveLength(4);
    expect(allGraph.edges.some((e) => e.relType === 'enemy')).toBe(true);
    expect(allGraph.edges.some((e) => e.relType === 'member')).toBe(true);
    expect(allGraph.edges.some((e) => e.relType === 'world')).toBe(true);

    const charOnly = buildGraphLayout(doc, 'char-only');
    expect(charOnly.nodes).toHaveLength(2);
    expect(charOnly.edges).toHaveLength(1);
  });

  it('tracks totalChars, avgDone, recordDailyStats, and streakDays', () => {
    const doc = createEmptyDocV6();
    const cId = doc.ui.activeC!;
    const reqFields = CG.flatMap((g) => g.f.filter((f) => f.r));
    reqFields.forEach((f) => {
      doc.chars[cId].data[f.id] = '测试内容';
    });

    expect(totalChars(doc)).toBe(reqFields.length * 4);
    expect(avgDone(doc)).toBe(100);

    const day1 = new Date('2026-10-23T12:00:00Z');
    const day2 = new Date('2026-10-24T12:00:00Z');
    recordDailyStats(doc, day1);
    recordDailyStats(doc, day2);

    expect(doc.stats.some((s) => s.date === dateStr(day2))).toBe(true);
    expect(streakDays(doc, day2)).toBe(2);
  });

  it('scans and replaces occurrences across the document', () => {
    const doc = createEmptyDocV6();
    const wId = doc.ui.activeW!;
    doc.worlds[wId].data = { w_name: '旧大陆', w_core: '旧大陆正在沉没' };

    const hits = scanAllOccurrences(doc, '旧大陆');
    expect(hits).toHaveLength(1);
    expect(hits[0].n).toBe(2);

    const replaced = replaceAllOccurrences(doc, '旧大陆', '新大陆');
    expect(replaced.count).toBe(2);
    expect(replaced.doc.worlds[wId].data.w_core).toBe('新大陆正在沉没');
  });

  it('generates random persona fields without overwriting existing fields', () => {
    const { data, filledCount } = generateRandomPersona({ name: '固定姓名' }, () => 0);
    expect(data.name).toBe('固定姓名');
    expect(filledCount).toBe(13);
    expect(data.personality).toBeTruthy();
  });

  it('searches across all entity types via globalSearch', () => {
    const doc = createEmptyDocV6();
    const cId = doc.ui.activeC!;
    doc.chars[cId].name = '瑟拉菲娜';
    doc.chars[cId].data = { name: '瑟拉菲娜', weapon: '星辰之弓' };

    const byName = globalSearch(doc, '瑟拉菲娜');
    expect(byName).toHaveLength(1);
    expect(byName[0].kind).toBe('char');

    const byField = globalSearch(doc, '星辰之弓');
    expect(byField).toHaveLength(1);
    expect(byField[0].where).toBe('武器');
  });
});

describe('schema migrations — metadata & alias preservation', () => {
  it('keeps avatar/tachiE/visibility/refAuthorId and co-creation flags across repeated migrations', async () => {
    const { migrateToV6 } = await import('../schema/migrations');
    const doc = createEmptyDocV6(() => 'u', 1000);
    const cId = Object.keys(doc.chars)[0];
    const wId = Object.keys(doc.worlds)[0];
    Object.assign(doc.chars[cId], {
      avatar: '🧝',
      tachiE: 'https://img.example/tachie.png',
      visibility: 'public',
      shareId: 'sh_1',
      refAuthorId: 7,
      refAuthorName: 'admin',
      canonStatus: 'doujin',
      cocreationId: 'ccp_1'
    });
    Object.assign(doc.worlds[wId], { isCocreation: true, cocreationAdmins: ['a@x'], cocreationSummary: 's' });
    const twice = migrateToV6(migrateToV6(doc));
    expect(twice.chars[cId]).toMatchObject({
      avatar: '🧝',
      tachiE: 'https://img.example/tachie.png',
      visibility: 'public',
      shareId: 'sh_1',
      refAuthorId: 7,
      refAuthorName: 'admin',
      canonStatus: 'doujin',
      cocreationId: 'ccp_1'
    });
    expect(twice.worlds[wId]).toMatchObject({ isCocreation: true, cocreationAdmins: ['a@x'], cocreationSummary: 's' });
  });

  it('prefers the UI-edited scene/glossary keys over legacy aliases when they disagree', async () => {
    const { migrateToV6 } = await import('../schema/migrations');
    const doc = createEmptyDocV6(() => 'u', 1000);
    doc.scenes.push({
      id: 'sc_1',
      title: '对峙',
      place: '旧地点',
      location: '新地点',
      purpose: '旧目的',
      conflict: '新冲突',
      beat: '旧节拍',
      note: '新备注',
      status: '未写',
      updatedAt: 1
    });
    doc.glossary.push({ id: 'gl_1', term: '以太', cat: '旧分类', std: '新标准', def: '旧释义', note: '新备注', updatedAt: 1 });
    const m = migrateToV6(doc);
    expect(m.scenes[0]).toMatchObject({ place: '新地点', location: '新地点', purpose: '新冲突', conflict: '新冲突', beat: '新备注', note: '新备注' });
    expect(m.glossary[0]).toMatchObject({ cat: '新标准', std: '新标准', def: '新备注', note: '新备注' });
  });
});
