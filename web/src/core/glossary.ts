import type { DocV6 } from './schema/types';

export interface OccurrenceHit {
  kind: 'world' | 'org' | 'char' | 'plot' | 'scene' | 'event';
  id: string;
  name: string;
  n: number;
}

function countSubstr(text: string | number | undefined | null, query: string): number {
  if (text === undefined || text === null || !query) return 0;
  const s = String(text);
  if (!s) return 0;
  return s.split(query).length - 1;
}

/**
 * Scans all text fields in `DocV6` for occurrences of `query`.
 * Matches legacy `CC.scanAll` in legacy/index.html L3221-L3248.
 */
export function scanAllOccurrences(doc: DocV6, query: string): OccurrenceHit[] {
  if (!query) return [];
  const hits: OccurrenceHit[] = [];

  const scanObj = (
    kind: 'world' | 'org' | 'char',
    id: string,
    name: string,
    obj?: Record<string, string>
  ) => {
    let n = 0;
    Object.values(obj || {}).forEach((v) => {
      if (typeof v === 'string' && v) {
        n += countSubstr(v, query);
      }
    });
    if (n > 0) hits.push({ kind, id, name, n });
  };

  Object.values(doc.worlds || {}).forEach((w) =>
    scanObj('world', w.id, (w.data && w.data.w_name) || w.name, w.data)
  );
  Object.values(doc.orgs || {}).forEach((o) =>
    scanObj('org', o.id, (o.data && o.data.o_name) || o.name, o.data)
  );
  Object.values(doc.chars || {}).forEach((c) =>
    scanObj('char', c.id, (c.data && c.data.name) || c.name, c.data)
  );

  (doc.plots || []).forEach((p) => {
    let n = countSubstr(p.title, query) + countSubstr(p.note, query);
    (p.acts || []).forEach((a) => {
      n += countSubstr(a.title, query);
      (a.chapters || []).forEach((ch) => {
        n +=
          countSubstr(ch.title, query) +
          countSubstr(ch.year, query) +
          countSubstr(ch.summary, query) +
          countSubstr(ch.pov, query) +
          countSubstr(ch.chars, query) +
          countSubstr(ch.goal, query) +
          countSubstr(ch.twist, query);
      });
    });
    if (n > 0) hits.push({ kind: 'plot', id: p.id, name: p.title, n });
  });

  (doc.scenes || []).forEach((s) => {
    const n =
      countSubstr(s.title, query) +
      countSubstr(s.location ?? s.place, query) +
      countSubstr(s.chars, query) +
      countSubstr(s.conflict ?? s.purpose, query) +
      countSubstr(s.note ?? s.beat, query) +
      countSubstr(s.time, query) +
      countSubstr(s.mood, query);
    if (n > 0) hits.push({ kind: 'scene', id: s.id, name: s.title, n });
  });

  (doc.timeline || []).forEach((ev) => {
    const yStr = ev.yearStr !== undefined ? ev.yearStr : String(ev.year ?? '');
    const n =
      countSubstr(ev.name, query) +
      countSubstr(ev.desc, query) +
      countSubstr(ev.link, query) +
      countSubstr(ev.world, query) +
      countSubstr(ev.chars, query) +
      countSubstr(yStr, query);
    if (n > 0) hits.push({ kind: 'event', id: ev.id, name: ev.name, n });
  });

  return hits;
}

/**
 * Replaces all occurrences of `from` with `to` across the entire `DocV6` (immutably returning new doc + count).
 * Matches legacy global replace in legacy/index.html L3260-L3291.
 */
export function replaceAllOccurrences(
  doc: DocV6,
  from: string,
  to: string,
  skipReference = false
): { doc: DocV6; count: number; hits: OccurrenceHit[] } {
  if (!from || from === to) {
    return { doc, count: 0, hits: [] };
  }
  const hits = scanAllOccurrences(doc, from);
  let totalCount = 0;

  const next: DocV6 = JSON.parse(JSON.stringify(doc));
  const rep = (s: string | undefined): string | undefined => {
    if (typeof s !== 'string' || !s) return s;
    const parts = s.split(from);
    if (parts.length > 1) {
      totalCount += parts.length - 1;
      return parts.join(to);
    }
    return s;
  };

  const walkRecord = (obj?: Record<string, string>) => {
    if (!obj) return;
    Object.keys(obj).forEach((k) => {
      obj[k] = rep(obj[k]) ?? '';
    });
  };

  Object.values(next.worlds || {}).forEach((w) => {
    if (skipReference && w.isReference) return;
    walkRecord(w.data);
    if (w.data.w_name) w.name = w.data.w_name;
    else w.name = rep(w.name) || w.name;
  });
  Object.values(next.orgs || {}).forEach((o) => {
    if (skipReference && o.isReference) return;
    walkRecord(o.data);
    if (o.data.o_name) o.name = o.data.o_name;
    else o.name = rep(o.name) || o.name;
  });
  Object.values(next.chars || {}).forEach((c) => {
    if (skipReference && c.isReference) return;
    walkRecord(c.data);
    if (c.data.name) c.name = c.data.name;
    else c.name = rep(c.name) || c.name;
  });

  (next.plots || []).forEach((p) => {
    if (skipReference && p.isReference) return;
    p.title = rep(p.title) ?? p.title;
    if (p.note !== undefined) p.note = rep(p.note);
    (p.acts || []).forEach((a) => {
      a.title = rep(a.title) ?? a.title;
      (a.chapters || []).forEach((ch) => {
        ch.title = rep(ch.title) ?? ch.title;
        if (ch.year !== undefined) ch.year = rep(ch.year);
        if (ch.summary !== undefined) ch.summary = rep(ch.summary);
        if (ch.pov !== undefined) ch.pov = rep(ch.pov);
        if (ch.chars !== undefined) ch.chars = rep(ch.chars);
        if (ch.goal !== undefined) ch.goal = rep(ch.goal);
        if (ch.twist !== undefined) ch.twist = rep(ch.twist);
      });
    });
  });

  (next.scenes || []).forEach((s) => {
    if (skipReference && s.isReference) return;
    s.title = rep(s.title) ?? s.title;
    if (s.location !== undefined) s.location = rep(s.location);
    if (s.place !== undefined) s.place = rep(s.place);
    if (s.chars !== undefined) s.chars = rep(s.chars);
    if (s.conflict !== undefined) s.conflict = rep(s.conflict);
    if (s.purpose !== undefined) s.purpose = rep(s.purpose);
    if (s.note !== undefined) s.note = rep(s.note);
    if (s.beat !== undefined) s.beat = rep(s.beat);
    if (s.time !== undefined) s.time = rep(s.time);
    if (s.mood !== undefined) s.mood = rep(s.mood);
  });

  (next.timeline || []).forEach((ev) => {
    if (skipReference && ev.isReference) return;
    ev.name = rep(ev.name) ?? ev.name;
    if (ev.desc !== undefined) ev.desc = rep(ev.desc);
    if (ev.link !== undefined) ev.link = rep(ev.link);
    if (ev.world !== undefined) ev.world = rep(ev.world);
    if (ev.chars !== undefined) ev.chars = rep(ev.chars);
    if (ev.yearStr !== undefined) ev.yearStr = rep(ev.yearStr);
  });

  (next.glossary || []).forEach((g) => {
    if (skipReference && g.isReference) return;
    g.term = rep(g.term) ?? g.term;
    if (g.std !== undefined) g.std = rep(g.std);
    if (g.cat !== undefined) g.cat = rep(g.cat);
    if (g.note !== undefined) g.note = rep(g.note);
    if (g.def !== undefined) g.def = rep(g.def);
  });

  return { doc: next, count: totalCount, hits };
}
