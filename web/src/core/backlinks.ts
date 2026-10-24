import { replaceAllOccurrences } from './glossary';
import type { DocV6 } from './schema/types';

export interface EntityIndexEntry {
  id: string;
  name: string;
  kind: 'world' | 'org' | 'char' | 'glossary';
}

export interface EntityRefToken {
  type: 'text' | 'ref';
  text: string;
  target?: EntityIndexEntry;
}

export interface BacklinkItem {
  sourceKind: 'world' | 'org' | 'char' | 'event' | 'plot' | 'scene';
  sourceId: string;
  sourceName: string;
  fieldId?: string;
  snippet: string;
}

const IGNORED_NAMES = new Set(['未命名', 'Untitled']);

function isValidEntityTerm(term: string | undefined): term is string {
  if (!term) return false;
  const trimmed = term.trim();
  return trimmed.length >= 2 && !IGNORED_NAMES.has(trimmed);
}

/**
 * Builds a longest-first entity index of worlds, organizations, characters, and glossary terms
 * for safe AST Wiki tokenization.
 */
export function buildEntityIndex(doc: DocV6): EntityIndexEntry[] {
  const map = new Map<string, EntityIndexEntry>();

  const register = (id: string, rawName: string | undefined, kind: EntityIndexEntry['kind']) => {
    if (!isValidEntityTerm(rawName)) return;
    const name = rawName.trim();
    if (!map.has(name)) {
      map.set(name, { id, name, kind });
    }
  };

  const registerAliases = (
    id: string,
    rawAlias: string | undefined,
    kind: EntityIndexEntry['kind']
  ) => {
    if (!rawAlias) return;
    rawAlias
      .split(/[、,，|/\n]/)
      .map((s) => s.trim())
      .forEach((alias) => register(id, alias, kind));
  };

  Object.values(doc.worlds || {}).forEach((w) => {
    register(w.id, (w.data && w.data.w_name) || w.name, 'world');
    registerAliases(w.id, w.data?.w_alias, 'world');
  });

  Object.values(doc.orgs || {}).forEach((o) => {
    register(o.id, (o.data && o.data.o_name) || o.name, 'org');
    registerAliases(o.id, o.data?.o_alias, 'org');
  });

  Object.values(doc.chars || {}).forEach((c) => {
    register(c.id, (c.data && c.data.name) || c.name, 'char');
    registerAliases(c.id, c.data?.alias, 'char');
  });

  (doc.glossary || []).forEach((g) => {
    register(g.id, g.term, 'glossary');
    register(g.id, g.std ?? g.cat, 'glossary');
  });

  return Array.from(map.values()).sort((a, b) => {
    if (b.name.length !== a.name.length) {
      return b.name.length - a.name.length;
    }
    return a.name.localeCompare(b.name);
  });
}

/**
 * Safely tokenizes plain text into `{ type: 'text' | 'ref', text, target }` tokens
 * without any HTML injection or `v-html` XSS surface.
 */
export function tokenizeEntityRefs(
  text: string,
  index: EntityIndexEntry[],
  excludeId?: string
): EntityRefToken[] {
  if (!text) return [];

  const candidates = (index || [])
    .filter((entry) => entry.id !== excludeId && isValidEntityTerm(entry.name))
    .sort((a, b) => b.name.length - a.name.length);

  if (!candidates.length) {
    return [{ type: 'text', text }];
  }

  const tokens: EntityRefToken[] = [];
  let buf = '';
  let i = 0;

  while (i < text.length) {
    let matched: EntityIndexEntry | undefined;
    for (const cand of candidates) {
      if (text.startsWith(cand.name, i)) {
        matched = cand;
        break;
      }
    }
    if (matched) {
      if (buf) {
        tokens.push({ type: 'text', text: buf });
        buf = '';
      }
      tokens.push({
        type: 'ref',
        text: matched.name,
        target: matched
      });
      i += matched.name.length;
    } else {
      buf += text[i];
      i++;
    }
  }

  if (buf) {
    tokens.push({ type: 'text', text: buf });
  }

  return tokens;
}

function makeSnippet(text: string, targetName: string): string {
  const idx = text.indexOf(targetName);
  if (idx === -1) return text.slice(0, 60);
  const start = Math.max(0, idx - 20);
  const end = Math.min(text.length, idx + targetName.length + 30);
  return (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '');
}

/**
 * Finds all backlinks across worlds, orgs, chars, timeline, plots, and scenes that mention `targetName`.
 */
export function findBacklinks(
  doc: DocV6,
  targetId: string,
  targetName: string
): BacklinkItem[] {
  const needle = (targetName || '').trim();
  if (!isValidEntityTerm(needle)) return [];

  const results: BacklinkItem[] = [];

  const scanEntityMap = (
    sourceKind: 'world' | 'org' | 'char',
    entities: Record<string, { id: string; name: string; data: Record<string, string> }>,
    nameField: string
  ) => {
    Object.values(entities || {}).forEach((ent) => {
      if (ent.id === targetId) return;
      const sourceName = (ent.data && ent.data[nameField]) || ent.name;
      for (const [fid, val] of Object.entries(ent.data || {})) {
        if (val && val.includes(needle)) {
          results.push({
            sourceKind,
            sourceId: ent.id,
            sourceName,
            fieldId: fid,
            snippet: makeSnippet(val, needle)
          });
          break;
        }
      }
    });
  };

  scanEntityMap('world', doc.worlds || {}, 'w_name');
  scanEntityMap('org', doc.orgs || {}, 'o_name');
  scanEntityMap('char', doc.chars || {}, 'name');

  (doc.timeline || []).forEach((ev) => {
    if (ev.id === targetId) return;
    const hay = [ev.name, ev.desc, ev.link, ev.world, ev.chars].filter(Boolean).join(' · ');
    if (hay.includes(needle)) {
      results.push({
        sourceKind: 'event',
        sourceId: ev.id,
        sourceName: ev.name,
        snippet: makeSnippet(hay, needle)
      });
    }
  });

  (doc.plots || []).forEach((p) => {
    if (p.id === targetId) return;
    const hayParts = [p.title, p.note];
    (p.acts || []).forEach((a) => {
      hayParts.push(a.title);
      (a.chapters || []).forEach((ch) => {
        hayParts.push(ch.title, ch.summary, ch.chars, ch.pov, ch.goal, ch.twist);
      });
    });
    const hay = hayParts.filter(Boolean).join(' · ');
    if (hay.includes(needle)) {
      results.push({
        sourceKind: 'plot',
        sourceId: p.id,
        sourceName: p.title,
        snippet: makeSnippet(hay, needle)
      });
    }
  });

  (doc.scenes || []).forEach((s) => {
    if (s.id === targetId) return;
    const hay = [
      s.title,
      s.location ?? s.place,
      s.chars,
      s.conflict ?? s.purpose,
      s.note ?? s.beat
    ]
      .filter(Boolean)
      .join(' · ');
    if (hay.includes(needle)) {
      results.push({
        sourceKind: 'scene',
        sourceId: s.id,
        sourceName: s.title,
        snippet: makeSnippet(hay, needle)
      });
    }
  });

  return results;
}

/**
 * Globally renames an entity across the entire `DocV6` and returns the updated document and replacement count.
 */
export function renameEntityEverywhere(
  doc: DocV6,
  oldName: string,
  newName: string
): { doc: DocV6; count: number } {
  const from = (oldName || '').trim();
  const to = (newName || '').trim();
  if (!from || !to || from === to) {
    return { doc, count: 0 };
  }
  const { doc: updatedDoc, count } = replaceAllOccurrences(doc, from, to);
  return { doc: updatedDoc, count };
}
