import { h32 } from './draftCode';
import { stripReferenceItems } from './reference';
import type {
  BaseEntity,
  ConflictKind,
  DailyStat,
  DiffSummary,
  DocV6,
  EntityKind,
  FieldConflict,
  StudioPreferences,
  TemplateDef
} from './schema/types';

/** Entity metadata that must take part in change detection and 3-way merging. */
export const ENTITY_META_KEYS = [
  'inspirationId',
  'visibility',
  'shareId',
  'shareRev',
  'avatar',
  'tachiE',
  'templateId',
  'canonStatus',
  'cocreationId',
  'canonRequested',
  'isCocreation',
  'cocreationAdmins',
  'cocreationSummary'
] as const;

const PREFERENCE_KEYS: (keyof StudioPreferences)[] = [
  'preferredGenre',
  'writingTone',
  'defaultPerspective',
  'aiCustomInstruction'
];

const WHOLE_RECORD = '*';

/**
 * Recursively serializes an object with alphabetically sorted keys for deterministic hashing.
 */
export function canonicalStringify(val: unknown): string {
  if (val === null || typeof val !== 'object') {
    return JSON.stringify(val);
  }
  if (Array.isArray(val)) {
    return '[' + val.map((item) => canonicalStringify(item)).join(',') + ']';
  }
  const obj = val as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  return (
    '{' +
    keys.map((k) => JSON.stringify(k) + ':' + canonicalStringify(obj[k])).join(',') +
    '}'
  );
}

/**
 * Strips the volatile `ui` state from a DocV6 before computing sync hashes or comparing content.
 */
export function stripUIForSync(docIn: DocV6): Omit<DocV6, 'ui'> {
  // Official reference materials are server-owned and never part of a user's synced payload.
  const doc = stripReferenceItems(docIn);
  return {
    _version: 6,
    worlds: doc.worlds || {},
    orgs: doc.orgs || {},
    chars: doc.chars || {},
    templates: doc.templates || {},
    timeline: doc.timeline || [],
    plots: doc.plots || [],
    scenes: doc.scenes || [],
    glossary: doc.glossary || [],
    stats: doc.stats || [],
    articles: doc.articles || [],
    preferences: doc.preferences,
    ...(doc.promptTemplates?.length ? { promptTemplates: doc.promptTemplates } : {})
  };
}

/**
 * True when the document holds no user-authored content.
 * Official reference materials (`isReference`) and builtin templates do not count, so a
 * freshly reset workspace (starter example) is "empty" and will adopt the cloud copy on login.
 */
export function isDocEffectivelyEmpty(doc: DocV6): boolean {
  const own = <T extends { isReference?: boolean }>(x: T) => !x.isReference;
  const hasEntity = (coll: Record<string, BaseEntity> | undefined) =>
    Object.values(coll || {}).some(
      (x) => own(x) && x.data && Object.values(x.data).some((v) => v && String(v).trim())
    );
  const hasItems = (list: Array<{ isReference?: boolean }> | undefined) =>
    (list || []).some(own);
  const hasUserTemplates = Object.values(doc.templates || {}).some((t) => !t.builtin && own(t));
  return (
    !hasEntity(doc.worlds) &&
    !hasEntity(doc.orgs) &&
    !hasEntity(doc.chars) &&
    !hasUserTemplates &&
    !hasItems(doc.timeline) &&
    !hasItems(doc.plots) &&
    !hasItems(doc.scenes) &&
    !hasItems(doc.glossary) &&
    !hasItems(doc.articles) &&
    !(doc.promptTemplates || []).length
  );
}

/**
 * Computes a deterministic sync fingerprint ignoring `doc.ui` (active tabs, nowYear).
 */
export function computeSyncHash(doc: DocV6): string {
  const canonical = canonicalStringify(stripUIForSync(doc));
  const bytes = new TextEncoder().encode(canonical);
  return h32(bytes).toString(16).padStart(8, '0') + ':' + bytes.length;
}

function metaOf(ent: BaseEntity | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!ent) return out;
  const anyEnt = ent as unknown as Record<string, unknown>;
  for (const k of ENTITY_META_KEYS) {
    if (anyEnt[k] !== undefined) out[k] = anyEnt[k];
  }
  return out;
}

function entityChanged(a: BaseEntity, b: BaseEntity): boolean {
  if (a.name !== b.name) return true;
  if (canonicalStringify(a.data || {}) !== canonicalStringify(b.data || {})) return true;
  return canonicalStringify(metaOf(a)) !== canonicalStringify(metaOf(b));
}

/**
 * Classic 3-way pick for a scalar: unchanged on one side -> take the other; both changed to
 * different values -> conflict (caller decides the provisional value).
 */
function pick3<V>(
  base: V | undefined,
  local: V | undefined,
  remote: V | undefined
): { value: V | undefined; conflict: boolean } {
  const eq = (x: V | undefined, y: V | undefined) => canonicalStringify(x) === canonicalStringify(y);
  if (eq(local, remote)) return { value: local, conflict: false };
  if (eq(local, base)) return { value: remote, conflict: false };
  if (eq(remote, base)) return { value: local, conflict: false };
  return { value: local, conflict: true };
}

function recordLabel(x: unknown): string {
  const r = (x || {}) as Record<string, unknown>;
  return String(r.title || r.name || r.term || r.id || '');
}

function diffEntityMap<T extends BaseEntity>(
  localMap: Record<string, T>,
  remoteMap: Record<string, T>
): { added: number; modified: number } {
  const lKeys = new Set(Object.keys(localMap || {}));
  const rKeys = new Set(Object.keys(remoteMap || {}));
  let added = 0;
  let modified = 0;

  for (const k of rKeys) {
    if (!lKeys.has(k)) {
      added++;
    } else if (entityChanged(localMap[k], remoteMap[k])) {
      modified++;
    }
  }
  for (const k of lKeys) {
    if (!rKeys.has(k)) {
      added++;
    }
  }
  return { added, modified };
}

function diffArrayDelta<T extends { id: string }>(localArr: T[], remoteArr: T[]): number {
  const l = localArr || [];
  const r = remoteArr || [];
  if (l.length !== r.length) {
    return Math.abs(r.length - l.length);
  }
  const lMap = new Map(l.map((item) => [item.id, canonicalStringify(item)]));
  let delta = 0;
  for (const item of r) {
    const prev = lMap.get(item.id);
    if (!prev || prev !== canonicalStringify(item)) {
      delta++;
    }
  }
  return delta;
}

/**
 * Generates a high-level summary of differences between two DocV6 documents.
 */
export function summarizeDocDiff(local: DocV6, remote: DocV6): DiffSummary {
  const wDiff = diffEntityMap(local.worlds || {}, remote.worlds || {});
  const oDiff = diffEntityMap(local.orgs || {}, remote.orgs || {});
  const cDiff = diffEntityMap(local.chars || {}, remote.chars || {});

  return {
    worldsAdded: wDiff.added,
    worldsModified: wDiff.modified,
    orgsAdded: oDiff.added,
    orgsModified: oDiff.modified,
    charsAdded: cDiff.added,
    charsModified: cDiff.modified,
    timelineDelta: diffArrayDelta(local.timeline || [], remote.timeline || []),
    plotsDelta: diffArrayDelta(local.plots || [], remote.plots || []),
    scenesDelta: diffArrayDelta(local.scenes || [], remote.scenes || []),
    glossaryDelta: diffArrayDelta(local.glossary || [], remote.glossary || []),
    articlesDelta: diffArrayDelta(local.articles || [], remote.articles || []),
    templatesDelta: diffArrayDelta(Object.values(local.templates || {}), Object.values(remote.templates || {}))
  };
}

function clone<T>(val: T): T {
  return JSON.parse(JSON.stringify(val));
}

function mergeEntityCollection<T extends BaseEntity>(
  kind: EntityKind,
  nameDataKey: string,
  baseMap: Record<string, T> | undefined,
  localMap: Record<string, T>,
  remoteMap: Record<string, T>,
  conflicts: FieldConflict[]
): Record<string, T> {
  const allIds = new Set<string>([
    ...Object.keys(baseMap || {}),
    ...Object.keys(localMap || {}),
    ...Object.keys(remoteMap || {})
  ]);

  const merged: Record<string, T> = {};

  for (const id of allIds) {
    const bEnt = baseMap ? baseMap[id] : undefined;
    const lEnt = localMap ? localMap[id] : undefined;
    const rEnt = remoteMap ? remoteMap[id] : undefined;

    // Deleted on both sides
    if (!lEnt && !rEnt) continue;

    // Existed in base, deleted on one side
    if (bEnt && !lEnt && rEnt) {
      if (!entityChanged(bEnt, rEnt)) {
        // Deleted locally and untouched remotely -> honor deletion
        continue;
      }
      conflicts.push({ kind, entityId: id, entityName: rEnt.name || id, fieldId: WHOLE_RECORD, localVal: '', remoteVal: JSON.stringify(rEnt), baseVal: JSON.stringify(bEnt) });
      merged[id] = clone(rEnt);
      continue;
    }

    if (bEnt && lEnt && !rEnt) {
      if (!entityChanged(bEnt, lEnt)) {
        // Deleted remotely and untouched locally -> honor deletion
        continue;
      }
      conflicts.push({ kind, entityId: id, entityName: lEnt.name || id, fieldId: WHOLE_RECORD, localVal: JSON.stringify(lEnt), remoteVal: '', baseVal: JSON.stringify(bEnt) });
      merged[id] = clone(lEnt);
      continue;
    }

    // Added only on local
    if (!bEnt && lEnt && !rEnt) {
      merged[id] = clone(lEnt);
      continue;
    }

    // Added only on remote
    if (!bEnt && !lEnt && rEnt) {
      merged[id] = clone(rEnt);
      continue;
    }

    // Present in both local and remote -> field-by-field merge
    if (lEnt && rEnt) {
      const bData = bEnt?.data || {};
      const lData = lEnt.data || {};
      const rData = rEnt.data || {};
      const fieldKeys = new Set<string>([
        ...Object.keys(bData),
        ...Object.keys(lData),
        ...Object.keys(rData)
      ]);

      const mergedData: Record<string, string> = {};
      for (const fid of fieldKeys) {
        const bVal = bData[fid] ?? '';
        const lVal = lData[fid] ?? '';
        const rVal = rData[fid] ?? '';

        if (lVal === rVal) {
          if (lVal !== '' || fid in lData || fid in rData) {
            mergedData[fid] = lVal;
          }
          continue;
        }

        if (bEnt) {
          // 3-way comparison with base
          if (lVal === bVal && rVal !== bVal) {
            mergedData[fid] = rVal;
          } else if (rVal === bVal && lVal !== bVal) {
            mergedData[fid] = lVal;
          } else {
            // Both changed the same field to different values -> conflict!
            mergedData[fid] = lVal;
            conflicts.push({
              kind,
              entityId: id,
              entityName: lEnt.name || rEnt.name || id,
              fieldId: fid,
              localVal: lVal,
              remoteVal: rVal,
              baseVal: bVal
            });
          }
        } else {
          // 2-way comparison without base
          if (lVal === '' && rVal !== '') {
            mergedData[fid] = rVal;
          } else if (rVal === '' && lVal !== '') {
            mergedData[fid] = lVal;
          } else {
            mergedData[fid] = lVal;
            conflicts.push({
              kind,
              entityId: id,
              entityName: lEnt.name || rEnt.name || id,
              fieldId: fid,
              localVal: lVal,
              remoteVal: rVal,
              baseVal: ''
            });
          }
        }
      }

      let mergedName = mergedData[nameDataKey] || '';
      if (!mergedName) {
        if (bEnt && lEnt.name === bEnt.name && rEnt.name !== bEnt.name) {
          mergedName = rEnt.name;
        } else {
          mergedName = lEnt.name || rEnt.name;
        }
      }

      // Start from remote, overlay unknown local extras, then settle every metadata key by a
      // real 3-way pick (previously `...local` silently won, dropping remote visibility/shareId).
      const entityObj: any = {
        ...clone(rEnt),
        ...clone(lEnt),
        id,
        name: mergedName,
        data: mergedData,
        createdAt: Math.min(lEnt.createdAt || Date.now(), rEnt.createdAt || Date.now()),
        updatedAt: Math.max(lEnt.updatedAt || 0, rEnt.updatedAt || 0)
      };
      const bMeta = metaOf(bEnt);
      const lMeta = metaOf(lEnt);
      const rMeta = metaOf(rEnt);
      for (const key of ENTITY_META_KEYS) {
        const picked = pick3(bMeta[key], lMeta[key], rMeta[key]);
        if (picked.value === undefined) {
          delete entityObj[key];
        } else {
          entityObj[key] = clone(picked.value);
        }
        if (picked.conflict) {
          conflicts.push({
            kind,
            entityId: id,
            entityName: lEnt.name || rEnt.name || id,
            fieldId: '$' + key,
            localVal: lMeta[key] === undefined ? '' : String(lMeta[key]),
            remoteVal: rMeta[key] === undefined ? '' : String(rMeta[key]),
            baseVal: bMeta[key] === undefined ? '' : String(bMeta[key])
          });
        }
      }

      if (kind === 'world') {
        const bInsp = new Set((bEnt as any)?.customInsp || []);
        const lInsp: string[] = (lEnt as any).customInsp || [];
        const rInsp: string[] = (rEnt as any).customInsp || [];
        const lSet = new Set(lInsp);
        const rSet = new Set(rInsp);
        const combined = new Set<string>();
        for (const item of [...lInsp, ...rInsp]) {
          if (bEnt && bInsp.has(item) && (!lSet.has(item) || !rSet.has(item))) {
            continue;
          }
          combined.add(item);
        }
        entityObj.customInsp = Array.from(combined);
      }

      merged[id] = entityObj as T;
    }
  }

  return merged;
}

function mergeByIdArray<T extends { id: string; updatedAt?: number }>(
  kind: ConflictKind,
  baseArr: T[] | undefined,
  localArr: T[],
  remoteArr: T[],
  conflicts: FieldConflict[]
): T[] {
  const bMap = new Map<string, T>((baseArr || []).map((x) => [x.id, x]));
  const lMap = new Map<string, T>((localArr || []).map((x) => [x.id, x]));
  const rMap = new Map<string, T>((remoteArr || []).map((x) => [x.id, x]));

  const orderedIds: string[] = [];
  const seen = new Set<string>();
  for (const item of [...(localArr || []), ...(remoteArr || [])]) {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      orderedIds.push(item.id);
    }
  }

  const out: T[] = [];
  for (const id of orderedIds) {
    const b = bMap.get(id);
    const l = lMap.get(id);
    const r = rMap.get(id);

    if (b && !l && r) {
      if (canonicalStringify(b) === canonicalStringify(r)) continue;
      conflicts.push({ kind, entityId: id, entityName: recordLabel(r) || id, fieldId: WHOLE_RECORD, localVal: '', remoteVal: JSON.stringify(r), baseVal: JSON.stringify(b) });
      out.push(clone(r));
    } else if (b && l && !r) {
      if (canonicalStringify(b) === canonicalStringify(l)) continue;
      conflicts.push({ kind, entityId: id, entityName: recordLabel(l) || id, fieldId: WHOLE_RECORD, localVal: JSON.stringify(l), remoteVal: '', baseVal: JSON.stringify(b) });
      out.push(clone(l));
    } else if (l && !r) {
      out.push(clone(l));
    } else if (!l && r) {
      out.push(clone(r));
    } else if (l && r) {
      if (canonicalStringify(l) === canonicalStringify(r)) {
        out.push(clone(l));
      } else if (b && canonicalStringify(l) === canonicalStringify(b)) {
        out.push(clone(r));
      } else if (b && canonicalStringify(r) === canonicalStringify(b)) {
        out.push(clone(l));
      } else {
        // Both sides changed the same record: keep the newer one provisionally but surface it,
        // instead of silently dropping one side's edits.
        const pick = (r.updatedAt || 0) > (l.updatedAt || 0) ? r : l;
        out.push(clone(pick));
        conflicts.push({
          kind,
          entityId: id,
          entityName: recordLabel(l) || recordLabel(r) || id,
          fieldId: WHOLE_RECORD,
          localVal: JSON.stringify(l),
          remoteVal: JSON.stringify(r),
          baseVal: b ? JSON.stringify(b) : ''
        });
      }
    }
  }
  return out;
}

function mergeTemplates(
  baseMap: Record<string, TemplateDef> | undefined,
  localMap: Record<string, TemplateDef>,
  remoteMap: Record<string, TemplateDef>,
  conflicts: FieldConflict[]
): Record<string, TemplateDef> {
  const allIds = new Set<string>([
    ...Object.keys(baseMap || {}),
    ...Object.keys(localMap || {}),
    ...Object.keys(remoteMap || {})
  ]);
  const out: Record<string, TemplateDef> = {};
  for (const id of allIds) {
    const b = baseMap?.[id];
    const l = localMap?.[id];
    const r = remoteMap?.[id];
    if (!l && !r) continue;
    if (b && !l && r && canonicalStringify(b) === canonicalStringify(r)) continue;
    if (b && l && !r && canonicalStringify(b) === canonicalStringify(l)) continue;
    if (l && !r) out[id] = clone(l);
    else if (!l && r) out[id] = clone(r);
    else if (l && r) {
      if (canonicalStringify(l) === canonicalStringify(r)) out[id] = clone(l);
      else if (b && canonicalStringify(l) === canonicalStringify(b)) out[id] = clone(r);
      else if (b && canonicalStringify(r) === canonicalStringify(b)) out[id] = clone(l);
      else {
        out[id] = clone((r.updatedAt || 0) > (l.updatedAt || 0) ? r : l);
        if (!l.builtin || !r.builtin) {
          conflicts.push({
            kind: 'template',
            entityId: id,
            entityName: l.name || r.name || id,
            fieldId: WHOLE_RECORD,
            localVal: JSON.stringify(l),
            remoteVal: JSON.stringify(r),
            baseVal: b ? JSON.stringify(b) : ''
          });
        }
      }
    }
  }
  return out;
}

function mergePreferences(
  base: StudioPreferences | undefined,
  local: StudioPreferences | undefined,
  remote: StudioPreferences | undefined,
  conflicts: FieldConflict[]
): StudioPreferences | undefined {
  if (!local && !remote) return base ? clone(base) : undefined;
  if (!local) return clone(remote!);
  if (!remote) return clone(local);
  const out: StudioPreferences = { ...clone(remote), ...clone(local) };
  for (const key of PREFERENCE_KEYS) {
    const picked = pick3(base?.[key], local[key], remote[key]);
    if (picked.value !== undefined) out[key] = picked.value as string;
    if (picked.conflict) {
      conflicts.push({
        kind: 'preferences',
        entityId: 'preferences',
        entityName: 'preferences',
        fieldId: key,
        localVal: String(local[key] ?? ''),
        remoteVal: String(remote[key] ?? ''),
        baseVal: String(base?.[key] ?? '')
      });
    }
  }
  return out;
}

function mergeStats(localStats: DailyStat[], remoteStats: DailyStat[]): DailyStat[] {
  const byDate = new Map<string, DailyStat>();
  for (const s of [...(localStats || []), ...(remoteStats || [])]) {
    if (!s || !s.date) continue;
    const prev = byDate.get(s.date);
    if (!prev) {
      byDate.set(s.date, { ...s });
    } else {
      byDate.set(s.date, {
        date: s.date,
        chars: Math.max(prev.chars || 0, s.chars || 0),
        ...(prev.done !== undefined || s.done !== undefined
          ? { done: Math.max(prev.done || 0, s.done || 0) }
          : {})
      });
    }
  }
  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Performs an entity-level and field-level three-way merge between `base`, `local`, and `remote`.
 * Auto-merges disjoint entities and disjoint field modifications; only flags `FieldConflict`
 * when the same field on the same entity was modified to two different values on both sides.
 */
export function threeWayMerge(
  base: DocV6 | null,
  local: DocV6,
  remote: DocV6
): {
  canAutoMerge: boolean;
  mergedDoc: DocV6;
  conflicts: FieldConflict[];
  summary: DiffSummary;
} {
  const conflicts: FieldConflict[] = [];

  const worlds = mergeEntityCollection(
    'world',
    'w_name',
    base?.worlds,
    local.worlds || {},
    remote.worlds || {},
    conflicts
  );
  const orgs = mergeEntityCollection(
    'org',
    'o_name',
    base?.orgs,
    local.orgs || {},
    remote.orgs || {},
    conflicts
  );
  const chars = mergeEntityCollection(
    'char',
    'name',
    base?.chars,
    local.chars || {},
    remote.chars || {},
    conflicts
  );

  const templates = mergeTemplates(base?.templates, local.templates || {}, remote.templates || {}, conflicts);
  const timeline = mergeByIdArray('timeline', base?.timeline, local.timeline || [], remote.timeline || [], conflicts);
  const plots = mergeByIdArray('plot', base?.plots, local.plots || [], remote.plots || [], conflicts);
  const scenes = mergeByIdArray('scene', base?.scenes, local.scenes || [], remote.scenes || [], conflicts);
  const glossary = mergeByIdArray('glossary', base?.glossary, local.glossary || [], remote.glossary || [], conflicts);
  const stats = mergeStats(local.stats || [], remote.stats || []);
  const articles = mergeByIdArray('article', base?.articles, local.articles || [], remote.articles || [], conflicts);
  const promptTemplates = mergeByIdArray('prompt', base?.promptTemplates, local.promptTemplates || [], remote.promptTemplates || [], conflicts);
  const preferences = mergePreferences(base?.preferences, local.preferences, remote.preferences, conflicts);

  const lUi = local.ui || { activeW: null, activeO: null, activeC: null, activeTpl: '', activeArticle: null, nowYear: 0 };
  const mergedDoc: DocV6 = {
    _version: 6,
    worlds,
    orgs,
    chars,
    templates,
    timeline,
    plots,
    scenes,
    glossary,
    stats,
    articles,
    ...(base?.promptTemplates || local.promptTemplates || remote.promptTemplates ? { promptTemplates } : {}),
    preferences,
    ui: {
      activeW: lUi.activeW && worlds[lUi.activeW] ? lUi.activeW : Object.keys(worlds)[0] || null,
      activeO: lUi.activeO && orgs[lUi.activeO] ? lUi.activeO : Object.keys(orgs)[0] || null,
      activeC: lUi.activeC && chars[lUi.activeC] ? lUi.activeC : Object.keys(chars)[0] || null,
      activeTpl: lUi.activeTpl || '',
      activeArticle:
        lUi.activeArticle && articles.some((a) => a.id === lUi.activeArticle)
          ? lUi.activeArticle
          : articles[0]?.id || null,
      nowYear: lUi.nowYear || remote.ui?.nowYear || 0
    }
  };

  const summary = summarizeDocDiff(local, remote);

  return {
    canAutoMerge: conflicts.length === 0,
    mergedDoc,
    conflicts,
    summary
  };
}


/**
 * Applies the user's per-conflict choices onto a merged document (used by the conflict dialog).
 * Whole-record conflicts (`fieldId === '*'`) replace the array item / template with the chosen
 * side's JSON; `$meta` conflicts set the metadata key; everything else sets `data[fieldId]`.
 */
export function applyConflictChoices(
  mergedDoc: DocV6,
  conflicts: FieldConflict[],
  choice: (conf: FieldConflict) => 'local' | 'remote'
): DocV6 {
  const doc: DocV6 = clone(mergedDoc);
  const arrayFor = (kind: ConflictKind): Array<{ id: string }> | null => {
    switch (kind) {
      case 'timeline':
        return doc.timeline;
      case 'plot':
        return doc.plots;
      case 'scene':
        return doc.scenes;
      case 'glossary':
        return doc.glossary;
      case 'prompt':
        return (doc.promptTemplates = doc.promptTemplates || []);
      case 'article':
        return (doc.articles = doc.articles || []);
      default:
        return null;
    }
  };
  for (const conf of conflicts) {
    const side = choice(conf);
    const raw = side === 'remote' ? conf.remoteVal : conf.localVal;
    if (conf.kind === 'preferences') {
      doc.preferences = { ...(doc.preferences || ({} as StudioPreferences)), [conf.fieldId]: raw } as StudioPreferences;
      continue;
    }
    if (conf.fieldId === WHOLE_RECORD) {
      let parsed: any = null;
      try {
        parsed = raw ? JSON.parse(raw) : null;
      } catch {
        parsed = null;
      }
      if (conf.kind === 'world' || conf.kind === 'org' || conf.kind === 'char') {
        const collection = conf.kind === 'world' ? doc.worlds : conf.kind === 'org' ? doc.orgs : doc.chars;
        if (parsed) collection[conf.entityId] = parsed;
        else delete collection[conf.entityId];
        continue;
      }
      if (conf.kind === 'template') {
        if (parsed) doc.templates[conf.entityId] = parsed;
        else delete doc.templates[conf.entityId];
        continue;
      }
      const arr = arrayFor(conf.kind);
      if (!arr) continue;
      const idx = arr.findIndex((x) => x.id === conf.entityId);
      if (parsed) {
        if (idx >= 0) arr[idx] = parsed;
        else arr.push(parsed);
      } else if (idx >= 0) {
        arr.splice(idx, 1);
      }
      continue;
    }
    const coll =
      conf.kind === 'world' ? doc.worlds : conf.kind === 'org' ? doc.orgs : conf.kind === 'char' ? doc.chars : null;
    const ent = coll?.[conf.entityId] as any;
    if (!ent) continue;
    if (conf.fieldId.startsWith('$')) {
      const key = conf.fieldId.slice(1);
      if (raw === '') delete ent[key];
      else if (key === 'canonRequested' || key === 'isCocreation') ent[key] = raw === 'true';
      else if (key === 'shareRev') ent[key] = Number(raw);
      else if (key === 'cocreationAdmins') ent[key] = raw.split(',').filter(Boolean);
      else ent[key] = raw;
      continue;
    }
    ent.data = ent.data || {};
    ent.data[conf.fieldId] = raw;
    if (conf.fieldId === 'w_name' || conf.fieldId === 'o_name' || conf.fieldId === 'name') {
      ent.name = raw.trim().slice(0, 24) || ent.name;
    }
  }
  return doc;
}
