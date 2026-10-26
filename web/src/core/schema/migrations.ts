import { DEFAULT_TEMPLATES } from '../legacy/fields';
import { T } from '../legacy/i18n';
import { parseYear } from '../timeline';
import { uid as defaultUid } from '../uid';
import { normalizeBackup } from '../backup';
import type {
  ArticleItem,
  CharEntity,
  DailyStat,
  DocV6,
  GlossaryItem,
  OrgEntity,
  PlotAct,
  PlotChapter,
  PlotVolume,
  SceneCard,
  StudioPreferences,
  TemplateDef,
  TimelineEvent,
  WorldEntity
} from './types';

const ENTITY_META_KEYS = [
  'isReference',
  'visibility',
  'shareId',
  'refAuthorId',
  'refAuthorName',
  'avatar',
  'tachiE',
  'canonStatus',
  'cocreationId',
  'canonRequested'
] as const;

const WORLD_META_KEYS = ['isCocreation', 'cocreationAdmins', 'cocreationSummary'] as const;

const ITEM_META_KEYS = ['isReference', 'refAuthorId', 'refAuthorName'] as const;

/**
 * Copies optional metadata keys (visibility, shareId, avatar, co-creation flags, ...) from a raw
 * entity so that re-running the migration never strips data the UI has written.
 * Only keys that are present and truthy/defined are emitted so golden fixtures stay byte-identical.
 */
function pickMeta(val: Record<string, any>, keys: readonly string[]): Record<string, any> {
  const out: Record<string, any> = {};
  for (const k of keys) {
    const v = val[k];
    if (v === undefined || v === null || v === '' || v === false) continue;
    if (k === 'isReference' || k === 'canonRequested' || k === 'isCocreation') {
      out[k] = true;
    } else if (k === 'cocreationAdmins') {
      if (Array.isArray(v)) out[k] = v.map(String);
    } else if (k === 'refAuthorId') {
      const n = Number(v);
      if (!Number.isNaN(n)) out[k] = n;
    } else if (k === 'visibility') {
      if (v === 'public' || v === 'private') out[k] = v;
    } else if (k === 'canonStatus') {
      if (v === 'canon' || v === 'doujin') out[k] = v;
    } else {
      out[k] = String(v);
    }
  }
  return out;
}

export function pickEntityMeta(val: Record<string, any>): Record<string, any> {
  return pickMeta(val, ENTITY_META_KEYS);
}

export function pickWorldMeta(val: Record<string, any>): Record<string, any> {
  return { ...pickMeta(val, ENTITY_META_KEYS), ...pickMeta(val, WORLD_META_KEYS) };
}

export function pickItemMeta(val: Record<string, any>): Record<string, any> {
  return pickMeta(val, ITEM_META_KEYS);
}

function createBuiltinTemplates(
  uidFn: (prefix?: string) => string,
  now: number
): Record<string, TemplateDef> {
  const templates: Record<string, TemplateDef> = {};
  Object.entries(DEFAULT_TEMPLATES).forEach(([key, val]) => {
    const id = uidFn('tp_');
    templates[id] = {
      id,
      name: val.name || key,
      fields: [...val.fields],
      builtin: true,
      updatedAt: now
    };
  });
  return templates;
}

/**
 * Creates a clean empty DocV6 with 1 default world, 1 org, 1 char, and builtin templates.
 */
export function createEmptyDocV6(
  uidFn: (prefix?: string) => string = defaultUid,
  now: number = Date.now()
): DocV6 {
  const wId = uidFn('wd_');
  const oId = uidFn('og_');
  const cId = uidFn('ch_');
  const templates = createBuiltinTemplates(uidFn, now);

  return {
    _version: 6,
    worlds: {
      [wId]: {
        id: wId,
        name: T.zh.unnamed,
        data: {},
        customInsp: [],
        createdAt: now,
        updatedAt: now
      }
    },
    orgs: {
      [oId]: {
        id: oId,
        name: T.zh.unnamed,
        data: {},
        createdAt: now,
        updatedAt: now
      }
    },
    chars: {
      [cId]: {
        id: cId,
        name: T.zh.unnamed,
        data: {},
        createdAt: now,
        updatedAt: now
      }
    },
    templates,
    timeline: [],
    plots: [],
    scenes: [],
    glossary: [],
    articles: [],
    stats: [],
    preferences: {
      preferredGenre: '奇幻架空',
      writingTone: '细腻生动',
      defaultPerspective: '第三人称',
      aiCustomInstruction: ''
    },
    ui: {
      activeW: wId,
      activeO: oId,
      activeC: cId,
      activeTpl: '',
      activeArticle: null,
      nowYear: 0
    }
  };
}

function normalizeStringRecord(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (v !== undefined && v !== null) {
      out[k] = String(v);
    }
  }
  return out;
}

/**
 * Upgrades any v4 / v5 / v5.1 / v5.3 / v6 backup or `cc_db_v5` object into a strict `DocV6`.
 */
export function migrateToV6(
  raw: unknown,
  fixedUidFn?: (prefix?: string) => string,
  fixedNow?: number
): DocV6 {
  const uidFn = fixedUidFn || defaultUid;
  const now = fixedNow ?? Date.now();

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return createEmptyDocV6(uidFn, now);
  }

  const r = raw as Record<string, any>;
  let baseSource: Record<string, any> = r;

  // If raw looks like a v4 bare char or v4 characters map, normalize it first
  if (
    !('worlds' in r) &&
    !('orgs' in r) &&
    !('chars' in r) &&
    !('_version' in r) &&
    !('version' in r)
  ) {
    try {
      baseSource = normalizeBackup(r, uidFn, () => now);
    } catch {
      return createEmptyDocV6(uidFn, now);
    }
  }

  const worlds: Record<string, WorldEntity> = {};
  if (baseSource.worlds && typeof baseSource.worlds === 'object') {
    for (const [key, val] of Object.entries(baseSource.worlds as Record<string, any>)) {
      if (!val || typeof val !== 'object') continue;
      const id = String(val.id || key || uidFn('wd_'));
      const data = normalizeStringRecord(val.data);
      const updatedAt = typeof val.updatedAt === 'number' ? val.updatedAt : now;
      const createdAt = typeof val.createdAt === 'number' ? val.createdAt : updatedAt;
      worlds[id] = {
        id,
        name: String(data.w_name || val.name || T.zh.unnamed),
        data,
        customInsp: Array.isArray(val.customInsp) ? val.customInsp.map(String) : [],
        ...pickWorldMeta(val),
        createdAt,
        updatedAt
      };
    }
  }

  const orgs: Record<string, OrgEntity> = {};
  if (baseSource.orgs && typeof baseSource.orgs === 'object') {
    for (const [key, val] of Object.entries(baseSource.orgs as Record<string, any>)) {
      if (!val || typeof val !== 'object') continue;
      const id = String(val.id || key || uidFn('og_'));
      const data = normalizeStringRecord(val.data);
      const updatedAt = typeof val.updatedAt === 'number' ? val.updatedAt : now;
      const createdAt = typeof val.createdAt === 'number' ? val.createdAt : updatedAt;
      orgs[id] = {
        id,
        name: String(data.o_name || val.name || T.zh.unnamed),
        data,
        ...pickEntityMeta(val),
        createdAt,
        updatedAt
      };
    }
  }

  const chars: Record<string, CharEntity> = {};
  if (baseSource.chars && typeof baseSource.chars === 'object') {
    for (const [key, val] of Object.entries(baseSource.chars as Record<string, any>)) {
      if (!val || typeof val !== 'object') continue;
      const id = String(val.id || key || uidFn('ch_'));
      const data = normalizeStringRecord(val.data);
      const updatedAt = typeof val.updatedAt === 'number' ? val.updatedAt : now;
      const createdAt = typeof val.createdAt === 'number' ? val.createdAt : updatedAt;
      const entity: CharEntity = {
        id,
        name: String(data.name || val.name || T.zh.unnamed),
        data,
        ...pickEntityMeta(val),
        createdAt,
        updatedAt
      };
      if (val.templateId) {
        entity.templateId = String(val.templateId);
      }
      chars[id] = entity;
    }
  }

  let templates: Record<string, TemplateDef> = {};
  if (
    baseSource.templates &&
    typeof baseSource.templates === 'object' &&
    Object.keys(baseSource.templates).length > 0
  ) {
    for (const [key, val] of Object.entries(baseSource.templates as Record<string, any>)) {
      if (!val || typeof val !== 'object') continue;
      const id = String(val.id || key || uidFn('tp_'));
      templates[id] = {
        id,
        name: String(val.name || key),
        ...(val.desc ? { desc: String(val.desc) } : {}),
        ...(val.enName ? { enName: String(val.enName) } : {}),
        ...(val.enDesc ? { enDesc: String(val.enDesc) } : {}),
        fields: Array.isArray(val.fields) ? val.fields.map(String) : [],
        builtin: Boolean(val.builtin),
        ...pickItemMeta(val),
        updatedAt: typeof val.updatedAt === 'number' ? val.updatedAt : now
      };
    }
  } else {
    templates = createBuiltinTemplates(uidFn, now);
  }

  const timeline: TimelineEvent[] = [];
  if (Array.isArray(baseSource.timeline)) {
    for (const item of baseSource.timeline) {
      if (!item || typeof item !== 'object') continue;
      const parsedNum =
        typeof item.year === 'number' && !Number.isNaN(item.year)
          ? item.year
          : typeof item.yearNum === 'number' && !Number.isNaN(item.yearNum)
            ? item.yearNum
            : parseYear(item.year);
      const ev: TimelineEvent = {
        id: String(item.id || uidFn('ev_')),
        year: parsedNum ?? 0,
        yearNum: parsedNum,
        ...(typeof item.year === 'string' ? { yearStr: item.year } : {}),
        name: String(item.name || ''),
        ...(item.world ? { world: String(item.world) } : {}),
        ...(item.chars ? { chars: String(item.chars) } : {}),
        ...(item.desc !== undefined ? { desc: String(item.desc) } : {}),
        ...(item.link !== undefined ? { link: String(item.link) } : {}),
        ...pickItemMeta(item),
        src: item.src || 'manual',
        updatedAt: typeof item.updatedAt === 'number' ? item.updatedAt : now
      };
      timeline.push(ev);
    }
  }

  const plots: PlotVolume[] = [];
  if (Array.isArray(baseSource.plots)) {
    for (const p of baseSource.plots) {
      if (!p || typeof p !== 'object') continue;
      const acts: PlotAct[] = Array.isArray(p.acts)
        ? p.acts
            .filter((a: any) => a && typeof a === 'object')
            .map((a: any): PlotAct => {
              const chapters: PlotChapter[] = Array.isArray(a.chapters)
                ? a.chapters
                    .filter((ch: any) => ch && typeof ch === 'object')
                    .map((ch: any): PlotChapter => ({
                      id: String(ch.id || uidFn('chp_')),
                      title: String(ch.title || ''),
                      status:
                        ch.status === '写作中' || ch.status === '已完成' ? ch.status : '未写',
                      ...(ch.year !== undefined ? { year: String(ch.year) } : {}),
                      ...(ch.pov !== undefined ? { pov: String(ch.pov) } : {}),
                      ...(ch.chars !== undefined ? { chars: String(ch.chars) } : {}),
                      ...(ch.goal !== undefined ? { goal: String(ch.goal) } : {}),
                      ...(ch.twist !== undefined ? { twist: String(ch.twist) } : {}),
                      ...(ch.summary !== undefined ? { summary: String(ch.summary) } : {}),
                      updatedAt: typeof ch.updatedAt === 'number' ? ch.updatedAt : now
                    }))
                : [];
              return {
                id: String(a.id || uidFn('at_')),
                title: String(a.title || ''),
                chapters
              };
            })
        : [];
      plots.push({
        id: String(p.id || uidFn('pl_')),
        title: String(p.title || T.zh.unnamed),
        ...(p.note !== undefined ? { note: String(p.note) } : {}),
        ...pickItemMeta(p),
        acts,
        updatedAt: typeof p.updatedAt === 'number' ? p.updatedAt : now
      });
    }
  }

  const scenes: SceneCard[] = [];
  if (Array.isArray(baseSource.scenes)) {
    for (const s of baseSource.scenes) {
      if (!s || typeof s !== 'object') continue;
      // The UI edits `location` / `conflict` / `note`; the legacy keys are kept as aliases.
      const place = s.location ?? s.place;
      const purpose = s.conflict ?? s.purpose;
      const beat = s.note ?? s.beat;
      scenes.push({
        id: String(s.id || uidFn('sc_')),
        title: String(s.title || T.zh.unnamed),
        ...(s.time !== undefined ? { time: String(s.time) } : {}),
        ...(place !== undefined ? { place: String(place), location: String(place) } : {}),
        ...(s.chars !== undefined ? { chars: String(s.chars) } : {}),
        ...(s.mood !== undefined ? { mood: String(s.mood) } : {}),
        ...(purpose !== undefined ? { purpose: String(purpose), conflict: String(purpose) } : {}),
        ...(beat !== undefined ? { beat: String(beat), note: String(beat) } : {}),
        ...pickItemMeta(s),
        status: s.status === '写作中' || s.status === '已完成' ? s.status : '未写',
        updatedAt: typeof s.updatedAt === 'number' ? s.updatedAt : now
      });
    }
  }

  const glossary: GlossaryItem[] = [];
  if (Array.isArray(baseSource.glossary)) {
    for (const g of baseSource.glossary) {
      if (!g || typeof g !== 'object') continue;
      // The UI edits `std` / `note`; `cat` / `def` are legacy aliases.
      const cat = g.std ?? g.cat;
      const def = g.note ?? g.def;
      glossary.push({
        id: String(g.id || uidFn('gl_')),
        term: String(g.term || ''),
        ...(cat !== undefined ? { cat: String(cat), std: String(cat) } : {}),
        ...(def !== undefined ? { def: String(def), note: String(def) } : {}),
        ...pickItemMeta(g),
        updatedAt: typeof g.updatedAt === 'number' ? g.updatedAt : now
      });
    }
  }

  const stats: DailyStat[] = [];
  if (Array.isArray(baseSource.stats)) {
    for (const st of baseSource.stats) {
      if (!st || typeof st !== 'object') continue;
      const date = String(st.date || st.d || '').trim();
      if (!date) continue;
      const charsCount = Number(st.chars ?? st.n ?? 0) || 0;
      const entry: DailyStat = { date, chars: charsCount };
      if (st.done !== undefined) {
        entry.done = Number(st.done) || 0;
      }
      stats.push(entry);
    }
  }

  const articles: ArticleItem[] = [];
  if (Array.isArray(baseSource.articles)) {
    for (const a of baseSource.articles) {
      if (!a || typeof a !== 'object') continue;
      const content = String(a.content || '');
      articles.push({
        id: String(a.id || uidFn('art_')),
        title: String(a.title || T.zh.unnamed),
        category: a.category || '小说正文',
        summary: String(a.summary || ''),
        content,
        worldId: a.worldId ? String(a.worldId) : undefined,
        orgIds: Array.isArray(a.orgIds) ? a.orgIds.map(String) : [],
        charIds: Array.isArray(a.charIds) ? a.charIds.map(String) : [],
        visibility: a.visibility === 'public' ? 'public' : 'private',
        shareId: a.shareId ? String(a.shareId) : undefined,
        ...pickItemMeta(a),
        wordCount: typeof a.wordCount === 'number' ? a.wordCount : content.length,
        createdAt: typeof a.createdAt === 'number' ? a.createdAt : now,
        updatedAt: typeof a.updatedAt === 'number' ? a.updatedAt : now
      });
    }
  }

  const rawPrefs = (r.preferences && typeof r.preferences === 'object'
    ? r.preferences
    : (baseSource.preferences && typeof baseSource.preferences === 'object'
        ? baseSource.preferences
        : {})) as Record<string, any>;
  const preferences: StudioPreferences = {
    preferredGenre: String(rawPrefs.preferredGenre || '奇幻架空'),
    writingTone: String(rawPrefs.writingTone || '细腻生动'),
    defaultPerspective: String(rawPrefs.defaultPerspective || '第三人称'),
    aiCustomInstruction: String(rawPrefs.aiCustomInstruction || '')
  };

  const rawUi = (r.ui && typeof r.ui === 'object' ? r.ui : {}) as Record<string, any>;
  const candW = rawUi.activeW ?? r.activeW ?? null;
  const candO = rawUi.activeO ?? r.activeO ?? null;
  const candC = rawUi.activeC ?? r.activeC ?? null;
  const candTpl = rawUi.activeTpl ?? r.activeTpl ?? '';
  const candArt = rawUi.activeArticle ?? r.activeArticle ?? null;
  const candNowYear = rawUi.nowYear ?? r.nowYear ?? 0;

  const worldIds = Object.keys(worlds);
  const orgIds = Object.keys(orgs);
  const charIds = Object.keys(chars);

  return {
    _version: 6,
    worlds,
    orgs,
    chars,
    templates,
    timeline,
    plots,
    scenes,
    glossary,
    articles,
    stats,
    preferences,
    ui: {
      activeW: candW && worlds[candW] ? String(candW) : worldIds[0] || null,
      activeO: candO && orgs[candO] ? String(candO) : orgIds[0] || null,
      activeC: candC && chars[candC] ? String(candC) : charIds[0] || null,
      activeTpl: String(candTpl || ''),
      activeArticle: candArt ? String(candArt) : null,
      nowYear: Number(candNowYear) || 0
    }
  };
}
