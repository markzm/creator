import { uid as defaultUid } from './uid';
import { T } from './legacy/i18n';
import type { DocV6 } from './schema/types';
import { migrateToV6 } from './schema/migrations';

export interface NormalizedBackupPayload {
  worlds: Record<string, any>;
  orgs: Record<string, any>;
  chars: Record<string, any>;
  templates: Record<string, any>;
  timeline: any[];
  plots: any[];
  scenes: any[];
  glossary: any[];
  stats: any[];
}

/**
 * Normalizes any historical backup object (v4 / v5 / v5.1 / v5.3 / v6).
 * Matches legacy `CC.normalizeBackup` in legacy/index.html L2689-L2718.
 */
export function normalizeBackup(
  p: any,
  uidFn: (prefix?: string) => string = defaultUid,
  nowFn: () => number = Date.now
): NormalizedBackupPayload {
  if (!p || typeof p !== 'object' || Array.isArray(p)) {
    throw new Error(T.zh.restoreFormatErr);
  }
  const result: NormalizedBackupPayload = {
    worlds: {},
    orgs: {},
    chars: {},
    templates: {},
    timeline: [],
    plots: [],
    scenes: [],
    glossary: [],
    stats: []
  };

  if (
    p.version === 5 ||
    p.version === 5.1 ||
    p.version === 5.3 ||
    p.version === 6 ||
    p._version === 5.1 ||
    p._version === 5.3 ||
    p._version === 6
  ) {
    if (p.worlds) result.worlds = p.worlds;
    if (p.orgs) result.orgs = p.orgs;
    if (p.chars) result.chars = p.chars;
    if (p.templates) result.templates = p.templates;
    if (p.timeline) result.timeline = p.timeline;
    if (p.plots) result.plots = p.plots;
    if (p.scenes) result.scenes = p.scenes;
    if (p.glossary) result.glossary = p.glossary;
    if (p.stats) result.stats = p.stats;
    return result;
  }

  if (p.chars || p.orgs || p.worlds) {
    if (p.worlds) result.worlds = p.worlds;
    if (p.chars) result.chars = p.chars;
    if (p.orgs) result.orgs = p.orgs;
    if (p.templates) result.templates = p.templates;
    if (p.timeline) result.timeline = p.timeline;
    if (p.plots) result.plots = p.plots;
    if (p.scenes) result.scenes = p.scenes;
    if (p.glossary) result.glossary = p.glossary;
    if (p.stats) result.stats = p.stats;
    return result;
  }

  if (p.characters) {
    result.chars = p.characters;
    return result;
  }

  if (p.name && !p.chars) {
    const id = uidFn('ch_');
    result.chars[id] = { id, name: p.name, data: p, updatedAt: nowFn() };
    return result;
  }

  const keys = Object.keys(p);
  if (
    keys.length &&
    keys.every((k) => p[k] && typeof p[k] === 'object' && ('name' in p[k] || 'data' in p[k]))
  ) {
    keys.forEach((k) => {
      result.chars[k] = {
        id: k,
        name: p[k].name || T.zh.unnamed,
        data: p[k].data || p[k],
        updatedAt: p[k].updatedAt || nowFn()
      };
    });
    return result;
  }

  throw new Error(T.zh.restoreFormatErr);
}

/**
 * Merges an incoming backup payload (v4/v5/v6) into an existing `DocV6`.
 * Matches legacy `CC.restore` merge semantics in legacy/index.html L2726-L2751.
 */
export function mergeBackupIntoDoc(
  target: DocV6,
  incomingRaw: any,
  uidFn: (prefix?: string) => string = defaultUid
): DocV6 {
  const normalized = normalizeBackup(incomingRaw, uidFn);
  const incomingV6 = migrateToV6({ ...normalized, _version: 6 }, uidFn);
  const next: DocV6 = JSON.parse(JSON.stringify(target));

  Object.entries(incomingV6.worlds).forEach(([k, v]) => {
    next.worlds[k] = v;
  });
  Object.entries(incomingV6.orgs).forEach(([k, v]) => {
    next.orgs[k] = v;
  });
  Object.entries(incomingV6.chars).forEach(([k, v]) => {
    next.chars[k] = v;
  });
  Object.entries(normalized.templates || {}).forEach(([k, v]) => {
    if (incomingV6.templates[k]) {
      next.templates[k] = incomingV6.templates[k];
    } else if (v && typeof v === 'object') {
      next.templates[k] = {
        id: v.id || k,
        name: v.name || k,
        fields: Array.isArray(v.fields) ? v.fields : [],
        builtin: Boolean(v.builtin)
      };
    }
  });

  incomingV6.timeline.forEach((t) => {
    if (!next.timeline.some((x) => x.name === t.name && x.year === t.year)) {
      next.timeline.push(t);
    }
  });

  const mergeById = <T extends { id: string }>(arr: T[], items: T[]) => {
    items.forEach((x) => {
      if (!arr.some((y) => String(y.id) === String(x.id))) {
        arr.push(x);
      }
    });
  };

  mergeById(next.plots, incomingV6.plots);
  mergeById(next.scenes, incomingV6.scenes);
  mergeById(next.glossary, incomingV6.glossary);
  if (incomingV6.articles) {
    if (!next.articles) next.articles = [];
    mergeById(next.articles, incomingV6.articles);
  }

  incomingV6.stats.forEach((s) => {
    if (!next.stats.some((y) => y.date === s.date)) {
      next.stats.push(s);
    }
  });

  if (!next.ui.activeW || !next.worlds[next.ui.activeW]) {
    next.ui.activeW = Object.keys(next.worlds)[0] || null;
  }
  if (!next.ui.activeO || !next.orgs[next.ui.activeO]) {
    next.ui.activeO = Object.keys(next.orgs)[0] || null;
  }
  if (!next.ui.activeC || !next.chars[next.ui.activeC]) {
    next.ui.activeC = Object.keys(next.chars)[0] || null;
  }

  return next;
}

/**
 * Serializes a DocV6 document into a formatted JSON backup string.
 */
export function serializeBackupV6(doc: DocV6): string {
  const payload = {
    _version: 6 as const,
    version: 6 as const,
    ts: Date.now(),
    worlds: doc.worlds,
    orgs: doc.orgs,
    chars: doc.chars,
    templates: doc.templates,
    timeline: doc.timeline,
    plots: doc.plots,
    scenes: doc.scenes,
    glossary: doc.glossary,
    stats: doc.stats,
    ui: doc.ui
  };
  return JSON.stringify(payload, null, 2);
}
