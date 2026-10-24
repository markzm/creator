import { getCharGroups } from './format';
import { OG, WG, type LegacyFieldGroup } from './legacy/fields';
import { T } from './legacy/i18n';
import type { DocV6 } from './schema/types';
import { collectAllEvents } from './timeline';

export interface SearchHit {
  kind: 'world' | 'org' | 'char' | 'event' | 'scene' | 'plot' | 'glossary';
  id: string;
  name: string;
  where: string;
  snippet?: string;
}

function labelOf(groups: LegacyFieldGroup[], key: string, lang: 'zh' | 'en'): string {
  const f = groups.flatMap((g) => g.f).find((x) => x.id === key);
  return f ? (lang === 'zh' ? f.l : f.lE || f.l) : key;
}

/**
 * Performs a global full-text search across worlds, orgs, chars, timeline events, scenes, plots, and glossary.
 * Matches legacy `CC.openSearch` matching logic in legacy/index.html L2829-L2872.
 */
export function globalSearch(
  doc: DocV6,
  query: string,
  lang: 'zh' | 'en' = 'zh',
  limit = 40
): SearchHit[] {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return [];

  const hits: SearchHit[] = [];

  const scan = (
    kind: SearchHit['kind'],
    id: string,
    dispName: string | undefined,
    fieldPairs: Array<[string, string | undefined]>
  ) => {
    let where: string | null = null;
    let snippet: string | undefined;
    if ((dispName || '').toLowerCase().includes(q)) {
      where = '';
      snippet = dispName;
    } else {
      for (const [label, val] of fieldPairs) {
        if (val && String(val).toLowerCase().includes(q)) {
          where = label;
          snippet = String(val);
          break;
        }
      }
    }
    if (where !== null) {
      hits.push({
        kind,
        id,
        name: dispName || T[lang].unnamed,
        where,
        snippet
      });
    }
  };

  Object.values(doc.worlds || {}).forEach((w) => {
    const pairs: Array<[string, string | undefined]> = w.data
      ? Object.entries(w.data)
          .filter(([k]) => k !== 'w_name')
          .map(([k, v]) => [labelOf(WG, k, lang), v])
      : [];
    scan('world', w.id, (w.data && w.data.w_name) || w.name, pairs);
  });

  Object.values(doc.orgs || {}).forEach((o) => {
    const pairs: Array<[string, string | undefined]> = o.data
      ? Object.entries(o.data)
          .filter(([k]) => k !== 'o_name')
          .map(([k, v]) => [labelOf(OG, k, lang), v])
      : [];
    scan('org', o.id, (o.data && o.data.o_name) || o.name, pairs);
  });

  Object.values(doc.chars || {}).forEach((c) => {
    const groups = getCharGroups(c, doc.templates);
    const pairs: Array<[string, string | undefined]> = c.data
      ? Object.entries(c.data)
          .filter(([k]) => k !== 'name')
          .map(([k, v]) => [labelOf(groups, k, lang), v])
      : [];
    scan('char', c.id, (c.data && c.data.name) || c.name, pairs);
  });

  collectAllEvents(doc).forEach((e) => {
    if ((e.name || '').toLowerCase().includes(q) || (e.desc || '').toLowerCase().includes(q)) {
      hits.push({
        kind: 'event',
        id: e.id || '',
        name: e.name,
        where: e.year || '',
        snippet: e.desc || e.name
      });
    }
  });

  (doc.scenes || []).forEach((s) => {
    scan('scene', s.id, s.title, [
      ['地点', s.location ?? s.place],
      ['角色', s.chars],
      ['冲突', s.conflict ?? s.purpose],
      ['备注', s.note ?? s.beat]
    ]);
  });

  (doc.plots || []).forEach((p) => {
    const pairs: Array<[string, string | undefined]> = [['卷备注', p.note]];
    (p.acts || []).forEach((a) => {
      pairs.push(['幕', a.title]);
      (a.chapters || []).forEach((ch) => {
        pairs.push([ch.title || '章节', ch.summary]);
      });
    });
    scan('plot', p.id, p.title, pairs);
  });

  (doc.glossary || []).forEach((g) => {
    scan('glossary', g.id, g.term, [
      ['标准写法', g.std ?? g.cat],
      ['释义', g.note ?? g.def]
    ]);
  });

  return hits.slice(0, limit);
}
