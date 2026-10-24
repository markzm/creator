import { describe, expect, it } from 'vitest';
import goldenYears from '../__fixtures__/golden-years.json';
import { createEmptyDocV6 } from '../schema/migrations';
import { calculateAgeAtEvent, collectAllEvents, parseYear } from '../timeline';

describe('timeline — Golden Master years, event aggregation & age calculator', () => {
  it('passes 100% of golden-years.json vectors for parseYear', () => {
    expect(goldenYears.length).toBe(15);
    for (const vec of goldenYears) {
      expect(parseYear(vec.input), `parseYear mismatch on: "${vec.input}"`).toBe(vec.expected);
    }
  });

  it('aggregates events from manual timeline, worlds, orgs, chars, and plots', () => {
    const doc = createEmptyDocV6();
    const wId = doc.ui.activeW!;
    const oId = doc.ui.activeO!;
    const cId = doc.ui.activeC!;

    doc.worlds[wId].name = '艾瑟兰';
    doc.worlds[wId].data = {
      w_name: '艾瑟兰',
      w_wars: '120年 霜火之战；250年 灰烬围城',
      w_eras: '第一纪元（100-300）\n混沌纪（0-9）'
    };

    doc.orgs[oId].name = '暮光议会';
    doc.orgs[oId].data = {
      o_name: '暮光议会',
      o_founded: '180年',
      o_history: '北境扩张；秘卷失窃'
    };

    doc.chars[cId].name = '艾德里安';
    doc.chars[cId].data = {
      name: '艾德里安',
      event: '曾在雪原独自生还',
      turning_points: '导师陨落；觉醒暗影'
    };

    doc.timeline.push({
      id: 'ev_1',
      name: '天陨日',
      year: 300,
      yearStr: '300年',
      desc: '流星坠落王都',
      src: 'manual'
    });

    doc.plots.push({
      id: 'p_1',
      title: '第一卷',
      acts: [
        {
          id: 'a_1',
          title: '序幕',
          chapters: [
            {
              id: 'ch_1',
              title: '风起雾谷',
              status: '已完成',
              year: '302年',
              summary: '主角抵达雾谷'
            }
          ]
        }
      ]
    });

    const events = collectAllEvents(doc);
    expect(events.some((e) => e.source === '独立' && e.name === '天陨日' && e.yearNum === 300)).toBe(
      true
    );
    expect(events.some((e) => e.source === '世界观' && e.yearNum === 120)).toBe(true);
    expect(events.some((e) => e.source === '世界观' && e.yearNum === 100 && e.desc === '纪元')).toBe(
      true
    );
    expect(events.some((e) => e.source === '组织' && e.yearNum === 180)).toBe(true);
    expect(events.some((e) => e.source === '角色' && e.name.includes('导师陨落'))).toBe(true);
    expect(events.some((e) => e.source === '剧情' && e.yearNum === 302)).toBe(true);
  });

  it('calculates character birth year and age at event accurately', () => {
    const res = calculateAgeAtEvent('外表18岁 / 实际24岁', 300, 295);
    expect(res).toEqual({
      birthYear: 282,
      ageAtEvent: 13
    });

    const unborn = calculateAgeAtEvent('20', 300, 270);
    expect(unborn).toEqual({
      birthYear: 280,
      ageAtEvent: -10
    });

    expect(calculateAgeAtEvent('', 300, 290)).toBeNull();
    expect(calculateAgeAtEvent('18', 0, 290)).toBeNull();
  });
});
