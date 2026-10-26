import type { DocV6 } from './schema/types';
import { createEmptyDocV6 } from './schema/migrations';

export interface ReferenceMergeResult {
  added: number;
  updated: number;
  removed: number;
}

type RefFlagged = { id: string; isReference?: boolean; updatedAt?: number };

export function isReferenceItem(x: unknown): x is RefFlagged {
  return Boolean(x && typeof x === 'object' && (x as RefFlagged).isReference === true);
}

function pickRefMap<T extends RefFlagged>(map: Record<string, T> | undefined): Record<string, T> {
  const out: Record<string, T> = {};
  for (const [id, v] of Object.entries(map || {})) {
    if (isReferenceItem(v)) out[id] = v;
  }
  return out;
}

function pickRefList<T extends RefFlagged>(list: T[] | undefined): T[] {
  return (list || []).filter((x) => isReferenceItem(x));
}

/**
 * Returns a new DocV6 that contains ONLY `isReference` items. Used when an admin publishes
 * official reference materials, so private content never leaves the admin's workspace.
 */
export function extractReferenceSubset(doc: DocV6): DocV6 {
  const empty = createEmptyDocV6(() => 'ref_tmp', 0);
  return {
    _version: 6,
    worlds: pickRefMap(doc.worlds),
    orgs: pickRefMap(doc.orgs),
    chars: pickRefMap(doc.chars),
    templates: pickRefMap(doc.templates),
    timeline: pickRefList(doc.timeline),
    plots: pickRefList(doc.plots),
    scenes: pickRefList(doc.scenes),
    glossary: pickRefList(doc.glossary),
    articles: pickRefList(doc.articles),
    stats: [],
    preferences: undefined,
    ui: { ...empty.ui, activeW: null, activeO: null, activeC: null, activeTpl: '', activeArticle: null, nowYear: 0 }
  };
}

/**
 * Returns a copy of the document with every `isReference` item removed.
 * Reference materials are server-owned and must never be pushed into a user's cloud document.
 */
export function stripReferenceItems(doc: DocV6): DocV6 {
  const dropMap = <T extends RefFlagged>(map: Record<string, T> | undefined) => {
    const out: Record<string, T> = {};
    for (const [id, v] of Object.entries(map || {})) {
      if (!isReferenceItem(v)) out[id] = v;
    }
    return out;
  };
  const dropList = <T extends RefFlagged>(list: T[] | undefined) =>
    (list || []).filter((x) => !isReferenceItem(x));
  return {
    ...doc,
    worlds: dropMap(doc.worlds),
    orgs: dropMap(doc.orgs),
    chars: dropMap(doc.chars),
    templates: dropMap(doc.templates),
    timeline: dropList(doc.timeline),
    plots: dropList(doc.plots),
    scenes: dropList(doc.scenes),
    glossary: dropList(doc.glossary),
    articles: dropList(doc.articles)
  };
}

/**
 * Merges official reference materials into a user's document in place.
 * - Missing reference items are added.
 * - Existing reference items are replaced when the official copy is newer.
 * - Local reference items that no longer exist officially are removed
 *   (forked copies are unaffected: they carry new ids and `isReference` is false).
 */
export function mergeReferenceMaterials(target: DocV6, refDoc: DocV6): ReferenceMergeResult {
  const result: ReferenceMergeResult = { added: 0, updated: 0, removed: 0 };
  const newer = (incoming: RefFlagged, existing: RefFlagged) =>
    (incoming.updatedAt || 0) > (existing.updatedAt || 0);

  const mergeMap = <T extends RefFlagged>(
    targetMap: Record<string, T>,
    refMap: Record<string, T> | undefined
  ) => {
    const refs = pickRefMap(refMap);
    for (const [id, item] of Object.entries(refs)) {
      const existing = targetMap[id];
      if (!existing) {
        targetMap[id] = item;
        result.added++;
      } else if (isReferenceItem(existing) && newer(item, existing)) {
        targetMap[id] = item;
        result.updated++;
      }
    }
    for (const [id, existing] of Object.entries(targetMap)) {
      if (isReferenceItem(existing) && !refs[id]) {
        delete targetMap[id];
        result.removed++;
      }
    }
  };

  const mergeList = <T extends RefFlagged>(targetList: T[], refList: T[] | undefined): T[] => {
    const refs = pickRefList(refList);
    const refIds = new Set(refs.map((x) => x.id));
    const kept: T[] = [];
    for (const existing of targetList) {
      if (isReferenceItem(existing) && !refIds.has(existing.id)) {
        result.removed++;
        continue;
      }
      kept.push(existing);
    }
    for (const item of refs) {
      const idx = kept.findIndex((x) => x.id === item.id);
      if (idx === -1) {
        kept.push(item);
        result.added++;
      } else if (isReferenceItem(kept[idx]) && newer(item, kept[idx])) {
        kept[idx] = item;
        result.updated++;
      }
    }
    return kept;
  };

  mergeMap(target.worlds, refDoc.worlds);
  mergeMap(target.orgs, refDoc.orgs);
  mergeMap(target.chars, refDoc.chars);
  mergeMap(target.templates, refDoc.templates);
  target.timeline = mergeList(target.timeline || [], refDoc.timeline);
  target.plots = mergeList(target.plots || [], refDoc.plots);
  target.scenes = mergeList(target.scenes || [], refDoc.scenes);
  target.glossary = mergeList(target.glossary || [], refDoc.glossary);
  target.articles = mergeList(target.articles || [], refDoc.articles);
  return result;
}
