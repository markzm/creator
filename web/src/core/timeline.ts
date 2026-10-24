import type { DocV6 } from './schema/types';

export interface CollectedEvent {
  id?: string;
  name: string;
  year: string;
  yearNum: number | null;
  desc: string;
  link?: string;
  source: '独立' | '角色' | '组织' | '世界观' | '剧情';
}

/**
 * Parses a natural-language or numeric year string into a sortable integer year.
 * Matches legacy `CC.parseYear` in legacy/index.html L1369-L1380.
 */
export function parseYear(str?: string | number | null): number | null {
  if (str === undefined || str === null || str === '') return null;
  if (typeof str === 'number') {
    return Number.isNaN(str) ? null : str;
  }
  const s = String(str).trim();
  if (!s) return null;
  if (/^-\d{1,4}$/.test(s)) return parseInt(s, 10);
  const m1 = s.match(/(\d{1,4})/);
  if (m1) return parseInt(m1[1], 10);
  if (/三百年前/.test(s)) return 300;
  if (/两百年前/.test(s)) return 200;
  if (/百年前/.test(s)) return 100;
  if (/千年前/.test(s)) return 1000;
  if (/远古|上古|创世/.test(s)) return -1000;
  return null;
}

/**
 * Aggregates timeline events from manual timeline entries, characters, organizations, worlds, and plot chapters.
 * Matches legacy `CC.collectAllEvents` in legacy/index.html L1381-L1429.
 */
export function collectAllEvents(doc: DocV6): CollectedEvent[] {
  const events: CollectedEvent[] = [];

  (doc.timeline || []).forEach((e) => {
    const rawYear = e.yearStr !== undefined ? e.yearStr : e.year !== undefined && e.year !== null ? String(e.year) : '';
    const yearNum =
      e.yearNum !== undefined
        ? e.yearNum
        : typeof e.year === 'number' && !Number.isNaN(e.year) && e.yearStr === undefined
          ? e.year
          : parseYear(rawYear);
    events.push({
      id: e.id,
      name: e.name,
      year: rawYear,
      yearNum,
      desc: e.desc || '',
      link: e.link ?? e.world ?? e.chars,
      source: '独立'
    });
  });

  Object.values(doc.chars || {}).forEach((c) => {
    if (!c.data) return;
    if (c.data.event) {
      events.push({
        name: `${c.name}：${c.data.event.slice(0, 30)}`,
        year: '',
        yearNum: null,
        desc: c.data.event,
        link: c.name,
        source: '角色'
      });
    }
    if (c.data.turning_points) {
      c.data.turning_points.split(/[；;、\n]/).forEach((t) => {
        if (t.trim()) {
          events.push({
            name: `${c.name}：${t.slice(0, 30)}`,
            year: '',
            yearNum: null,
            desc: t,
            link: c.name,
            source: '角色'
          });
        }
      });
    }
  });

  Object.values(doc.orgs || {}).forEach((o) => {
    if (!o.data) return;
    if (o.data.o_founded) {
      events.push({
        name: `${o.data.o_name || o.name} 成立`,
        year: o.data.o_founded,
        yearNum: parseYear(o.data.o_founded),
        desc: '',
        link: o.data.o_name,
        source: '组织'
      });
    }
    if (o.data.o_history) {
      o.data.o_history.split(/[；;\n]/).forEach((h) => {
        if (h.trim()) {
          events.push({
            name: `${o.data.o_name || o.name}：${h.slice(0, 30)}`,
            year: '',
            yearNum: null,
            desc: h,
            link: o.data.o_name,
            source: '组织'
          });
        }
      });
    }
  });

  Object.values(doc.worlds || {}).forEach((w) => {
    if (!w.data) return;
    if (w.data.w_wars) {
      w.data.w_wars.split(/[；;\n]/).forEach((l) => {
        if (l.trim()) {
          const y = l.match(/(\d+)\s*年/)?.[1] || '';
          events.push({
            name: `${w.data.w_name || w.name}：${l.slice(0, 30)}`,
            year: y,
            yearNum: parseYear(y),
            desc: l,
            link: w.data.w_name,
            source: '世界观'
          });
        }
      });
    }
    if (w.data.w_eras) {
      w.data.w_eras.split('\n').forEach((l) => {
        const ym = l.match(/(\d{2,})/);
        if (l.trim() && ym) {
          events.push({
            name: l.slice(0, 40),
            year: ym[1],
            yearNum: parseYear(ym[1]),
            desc: '纪元',
            link: w.data.w_name,
            source: '世界观'
          });
        }
      });
    }
  });

  (doc.plots || []).forEach((p) => {
    (p.acts || []).forEach((a) => {
      (a.chapters || []).forEach((ch) => {
        if (ch.title && (ch.year || '').trim()) {
          events.push({
            name: `${p.title}·${ch.title}`.slice(0, 30),
            year: ch.year!,
            yearNum: parseYear(ch.year),
            desc: ch.summary || '',
            link: p.title,
            source: '剧情'
          });
        }
      });
    });
  });

  return events;
}

/**
 * Calculates a character's birth year and age at a given event year based on their age at baseYear.
 * Matches legacy age calculator logic in legacy/index.html L3400-L3432.
 */
export function calculateAgeAtEvent(
  charAgeStr: string | number,
  baseYear: number,
  eventYear: number
): { birthYear: number; ageAtEvent: number } | null {
  const age =
    typeof charAgeStr === 'number'
      ? charAgeStr
      : (() => {
          const m = String(charAgeStr || '').match(/\d+/);
          return m ? parseInt(m[0], 10) : NaN;
        })();
  const nowY = Number(baseYear);
  const evY = Number(eventYear);
  if (!(nowY > 0) || !(age >= 0) || !(evY > 0) || Number.isNaN(nowY) || Number.isNaN(age) || Number.isNaN(evY)) {
    return null;
  }
  const birthYear = nowY - age;
  const ageAtEvent = evY - birthYear;
  return { birthYear, ageAtEvent };
}
