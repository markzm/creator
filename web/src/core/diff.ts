import { h32 } from './draftCode';
import type {
  BaseEntity,
  DailyStat,
  DiffSummary,
  DocV6,
  EntityKind,
  FieldConflict,
  TemplateDef
} from './schema/types';

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
export function stripUIForSync(doc: DocV6): Omit<DocV6, 'ui'> {
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
    stats: doc.stats || []
  };
}

/**
 * Computes a deterministic sync fingerprint ignoring `doc.ui` (active tabs, nowYear).
 */
export function computeSyncHash(doc: DocV6): string {
  const canonical = canonicalStringify(stripUIForSync(doc));
  const bytes = new TextEncoder().encode(canonical);
  return h32(bytes).toString(16).padStart(8, '0') + ':' + bytes.length;
}

function entityChanged(a: BaseEntity, b: BaseEntity): boolean {
  if (a.name !== b.name) return true;
  return canonicalStringify(a.data || {}) !== canonicalStringify(b.data || {});
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
    glossaryDelta: diffArrayDelta(local.glossary || [], remote.glossary || [])
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
      // Modified remotely, keep remote
      merged[id] = clone(rEnt);
      continue;
    }

    if (bEnt && lEnt && !rEnt) {
      if (!entityChanged(bEnt, lEnt)) {
        // Deleted remotely and untouched locally -> honor deletion
        continue;
      }
      // Modified locally, keep local
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

      const entityObj: any = {
        ...clone(rEnt),
        ...clone(lEnt),
        id,
        name: mergedName,
        data: mergedData,
        createdAt: Math.min(lEnt.createdAt || Date.now(), rEnt.createdAt || Date.now()),
        updatedAt: Math.max(lEnt.updatedAt || 0, rEnt.updatedAt || 0)
      };

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
  baseArr: T[] | undefined,
  localArr: T[],
  remoteArr: T[]
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
      out.push(clone(r));
    } else if (b && l && !r) {
      if (canonicalStringify(b) === canonicalStringify(l)) continue;
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
        const pick = (r.updatedAt || 0) > (l.updatedAt || 0) ? r : l;
        out.push(clone(pick));
      }
    }
  }
  return out;
}

function mergeTemplates(
  baseMap: Record<string, TemplateDef> | undefined,
  localMap: Record<string, TemplateDef>,
  remoteMap: Record<string, TemplateDef>
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
      if (b && canonicalStringify(l) === canonicalStringify(b)) out[id] = clone(r);
      else if (b && canonicalStringify(r) === canonicalStringify(b)) out[id] = clone(l);
      else out[id] = clone((r.updatedAt || 0) > (l.updatedAt || 0) ? r : l);
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

  const templates = mergeTemplates(base?.templates, local.templates || {}, remote.templates || {});
  const timeline = mergeByIdArray(base?.timeline, local.timeline || [], remote.timeline || []);
  const plots = mergeByIdArray(base?.plots, local.plots || [], remote.plots || []);
  const scenes = mergeByIdArray(base?.scenes, local.scenes || [], remote.scenes || []);
  const glossary = mergeByIdArray(base?.glossary, local.glossary || [], remote.glossary || []);
  const stats = mergeStats(local.stats || [], remote.stats || []);

  const lUi = local.ui || { activeW: null, activeO: null, activeC: null, activeTpl: '', nowYear: 0 };
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
    ui: {
      activeW: lUi.activeW && worlds[lUi.activeW] ? lUi.activeW : Object.keys(worlds)[0] || null,
      activeO: lUi.activeO && orgs[lUi.activeO] ? lUi.activeO : Object.keys(orgs)[0] || null,
      activeC: lUi.activeC && chars[lUi.activeC] ? lUi.activeC : Object.keys(chars)[0] || null,
      activeTpl: lUi.activeTpl || '',
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
