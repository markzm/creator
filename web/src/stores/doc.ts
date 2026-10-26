import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { buildEntityIndex, renameEntityEverywhere } from '../core/backlinks';
import { T } from '../core/legacy/i18n';
import { createEmptyDocV6, migrateToV6 } from '../core/schema/migrations';
import type {
  ArticleCategory,
  ArticleItem,
  BaseEntity,
  CharEntity,
  DocV6,
  EntityKind,
  OrgEntity,
  PlotVolume,
  SceneCard,
  StudioPreferences,
  TimelineEvent,
  WorldEntity
} from '../core/schema/types';
import { extractReferenceSubset, mergeReferenceMaterials } from '../core/reference';
import { createStarterExampleDoc } from '../core/starterExample';
import { recordDailyStats } from '../core/stats';
import { uid } from '../core/uid';
import {
  loadOrMigrateDoc,
  requestPersistentStorage,
  saveDocToIDB,
  subscribeMultiTabSync
} from '../data/repo';
import { useAuthStore } from './auth';
import { useUIStore } from './ui';
import { trStatic } from '../composables/useI18n';
import { useToast } from '../composables/useToast';
import { api } from '../data/api';

const GENTLE_REF_MSG = () =>
  trStatic(
    '此条目为官方公共参考素材，仅供查阅与引用。如需在此基础上修改，请点击「复制为衍生副本」。',
    'This is an official reference item (read-only). Use “Fork a copy” to edit it in your own library.'
  );

export const useDocStore = defineStore('doc', () => {
  const authStore = useAuthStore();
  const { toast } = useToast();
  const doc = ref<DocV6>(createEmptyDocV6());
  const ready = ref(false);
  const saving = ref(false);
  const lastSavedAt = ref<number | null>(null);
  const undoSnapshot = ref<DocV6 | null>(null);

  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  let unsubMultiTab: (() => void) | null = null;
  const dirtyListeners = new Set<() => void>();

  function onDirty(cb: () => void) {
    dirtyListeners.add(cb);
    return () => dirtyListeners.delete(cb);
  }

  function notifyDirty() {
    dirtyListeners.forEach((cb) => {
      try {
        cb();
      } catch {
        // Ignore listener error
      }
    });
  }

  const entityIndex = computed(() => buildEntityIndex(doc.value));

  const activeWorld = computed<WorldEntity | null>(() => {
    const id = doc.value.ui.activeW;
    if (id && doc.value.worlds[id]) return doc.value.worlds[id];
    const first = Object.values(doc.value.worlds)[0];
    return first || null;
  });

  const activeOrg = computed<OrgEntity | null>(() => {
    const id = doc.value.ui.activeO;
    if (id && doc.value.orgs[id]) return doc.value.orgs[id];
    const first = Object.values(doc.value.orgs)[0];
    return first || null;
  });

  const activeChar = computed<CharEntity | null>(() => {
    const id = doc.value.ui.activeC;
    if (id && doc.value.chars[id]) return doc.value.chars[id];
    const first = Object.values(doc.value.chars)[0];
    return first || null;
  });

  const activeArticle = computed<ArticleItem | null>(() => {
    const id = doc.value.ui.activeArticle;
    if (id) {
      const found = (doc.value.articles || []).find((a) => a.id === id);
      if (found) return found;
    }
    return (doc.value.articles || [])[0] || null;
  });

  async function init() {
    if (ready.value) return;
    requestPersistentStorage();
    const loaded = await loadOrMigrateDoc();
    doc.value = loaded;
    ensureActiveIds();
    ready.value = true;
    lastSavedAt.value = Date.now();

    void fetchAndMergeReferenceMaterials();

    if (unsubMultiTab) unsubMultiTab();
    unsubMultiTab = subscribeMultiTabSync((externalDoc) => {
      doc.value = migrateToV6(externalDoc);
      ensureActiveIds();
      lastSavedAt.value = Date.now();
    });
  }

  /** Last official reference document fetched from the server (used to re-apply after sync). */
  let lastReferenceDoc: DocV6 | null = null;

  async function fetchAndMergeReferenceMaterials() {
    try {
      const refDoc = await api.getReferenceMaterials();
      if (refDoc && typeof refDoc === 'object' && (refDoc.worlds || refDoc.chars || refDoc.orgs)) {
        lastReferenceDoc = migrateToV6(refDoc);
        reapplyReferences();
      }
    } catch {
      // Ignore network errors
    }
  }

  /**
   * Re-merges the cached official reference materials into the current document.
   * Reference items are never part of the synced payload, so this must run after any
   * cloud document replaces the local one.
   */
  function reapplyReferences() {
    if (!lastReferenceDoc) return;
    const res = mergeReferenceMaterials(doc.value, lastReferenceDoc);
    if (res.added || res.updated || res.removed) {
      ensureActiveIds();
      touch(false, false);
    }
  }

  function ensureActiveIds() {
    const wIds = Object.keys(doc.value.worlds);
    if (!wIds.length) {
      const id = uid('wd_');
      const now = Date.now();
      doc.value.worlds[id] = {
        id,
        name: T.zh.unnamed,
        data: {},
        customInsp: [],
        createdAt: now,
        updatedAt: now
      };
      doc.value.ui.activeW = id;
    } else if (!doc.value.ui.activeW || !doc.value.worlds[doc.value.ui.activeW]) {
      doc.value.ui.activeW = wIds[0];
    }

    const oIds = Object.keys(doc.value.orgs);
    if (!oIds.length) {
      const id = uid('og_');
      const now = Date.now();
      doc.value.orgs[id] = {
        id,
        name: T.zh.unnamed,
        data: {},
        createdAt: now,
        updatedAt: now
      };
      doc.value.ui.activeO = id;
    } else if (!doc.value.ui.activeO || !doc.value.orgs[doc.value.ui.activeO]) {
      doc.value.ui.activeO = oIds[0];
    }

    const cIds = Object.keys(doc.value.chars);
    if (!cIds.length) {
      const id = uid('ch_');
      const now = Date.now();
      doc.value.chars[id] = {
        id,
        name: T.zh.unnamed,
        data: {},
        createdAt: now,
        updatedAt: now
      };
      doc.value.ui.activeC = id;
    } else if (!doc.value.ui.activeC || !doc.value.chars[doc.value.ui.activeC]) {
      doc.value.ui.activeC = cIds[0];
    }
  }

  async function flushSave(broadcast = true) {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    try {
      recordDailyStats(doc.value);
      await saveDocToIDB(doc.value, broadcast);
      lastSavedAt.value = Date.now();
    } finally {
      saving.value = false;
    }
  }

  function touch(immediate = false, markSyncDirty = true) {
    saving.value = true;
    if (markSyncDirty) {
      notifyDirty();
    }
    if (immediate) {
      void flushSave(true);
      return;
    }
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      void flushSave(true);
    }, 300);
  }

  function saveUndoSnapshot() {
    undoSnapshot.value = JSON.parse(JSON.stringify(doc.value));
  }

  function undoLastOperation(): boolean {
    if (!undoSnapshot.value) return false;
    doc.value = JSON.parse(JSON.stringify(undoSnapshot.value));
    undoSnapshot.value = null;
    ensureActiveIds();
    touch(true);
    return true;
  }

  function replaceDoc(nextDoc: DocV6, saveUndo = true, markSyncDirty = true) {
    if (saveUndo) saveUndoSnapshot();
    doc.value = migrateToV6(nextDoc);
    ensureActiveIds();
    touch(true, markSyncDirty);
  }

  function syncEntityName(kind: EntityKind, entity: BaseEntity) {
    const now = Date.now();
    entity.updatedAt = now;
    if (kind === 'world') {
      entity.name = (entity.data.w_name || '').trim().slice(0, 24) || T.zh.unnamed;
    } else if (kind === 'org') {
      entity.name = (entity.data.o_name || '').trim().slice(0, 24) || T.zh.unnamed;
    } else {
      const firstKey = Object.keys(entity.data)[0];
      const rawName = entity.data.name || (firstKey ? entity.data[firstKey] : '') || '';
      entity.name = rawName.trim().slice(0, 24) || T.zh.unnamed;
    }
  }

  // World CRUD
  function createWorld(initialName?: string): WorldEntity {
    const id = uid('wd_');
    const now = Date.now();
    const name = (initialName || '').trim() || T.zh.unnamed;
    const w: WorldEntity = {
      id,
      name,
      visibility: 'private',
      data: initialName ? { w_name: initialName.trim() } : {},
      customInsp: [],
      createdAt: now,
      updatedAt: now
    };
    doc.value.worlds[id] = w;
    doc.value.ui.activeW = id;
    touch(true);
    return w;
  }

  function duplicateWorld(sourceId?: string): WorldEntity | null {
    const src = doc.value.worlds[sourceId || doc.value.ui.activeW || ''];
    if (!src) return null;
    const id = uid('wd_');
    const now = Date.now();
    const copyName = (src.name || T.zh.unnamed) + ' copy';
    const w: WorldEntity = {
      id,
      name: copyName,
      visibility: 'private',
      data: { ...src.data, ...(src.data.w_name ? { w_name: copyName } : {}) },
      customInsp: [...(src.customInsp || [])],
      createdAt: now,
      updatedAt: now
    };
    doc.value.worlds[id] = w;
    doc.value.ui.activeW = id;
    touch(true);
    return w;
  }

  function deleteWorld(targetId?: string): boolean {
    const id = targetId || doc.value.ui.activeW;
    if (!id || Object.keys(doc.value.worlds).length <= 1) return false;
    const ent = doc.value.worlds[id];
    if (ent?.isReference && !authStore.isAdmin) {
      toast(GENTLE_REF_MSG(), 'warn');
      return false;
    }
    delete doc.value.worlds[id];
    ensureActiveIds();
    touch(true);
    return true;
  }

  function selectWorld(id: string) {
    if (doc.value.worlds[id]) {
      doc.value.ui.activeW = id;
      touch(false, false);
    }
  }

  // Org CRUD
  function createOrg(initialName?: string): OrgEntity {
    const id = uid('og_');
    const now = Date.now();
    const name = (initialName || '').trim() || T.zh.unnamed;
    const o: OrgEntity = {
      id,
      name,
      visibility: 'private',
      data: initialName ? { o_name: initialName.trim() } : {},
      createdAt: now,
      updatedAt: now
    };
    doc.value.orgs[id] = o;
    doc.value.ui.activeO = id;
    touch(true);
    return o;
  }

  function duplicateOrg(sourceId?: string): OrgEntity | null {
    const src = doc.value.orgs[sourceId || doc.value.ui.activeO || ''];
    if (!src) return null;
    const id = uid('og_');
    const now = Date.now();
    const copyName = (src.name || T.zh.unnamed) + ' copy';
    const o: OrgEntity = {
      id,
      name: copyName,
      visibility: 'private',
      data: { ...src.data, ...(src.data.o_name ? { o_name: copyName } : {}) },
      createdAt: now,
      updatedAt: now
    };
    doc.value.orgs[id] = o;
    doc.value.ui.activeO = id;
    touch(true);
    return o;
  }

  function deleteOrg(targetId?: string): boolean {
    const id = targetId || doc.value.ui.activeO;
    if (!id || Object.keys(doc.value.orgs).length <= 1) return false;
    const ent = doc.value.orgs[id];
    if (ent?.isReference && !authStore.isAdmin) {
      toast(GENTLE_REF_MSG(), 'warn');
      return false;
    }
    delete doc.value.orgs[id];
    ensureActiveIds();
    touch(true);
    return true;
  }

  function selectOrg(id: string) {
    if (doc.value.orgs[id]) {
      doc.value.ui.activeO = id;
      touch(false, false);
    }
  }

  // Char CRUD
  function createChar(templateId?: string, initialName?: string): CharEntity {
    const id = uid('ch_');
    const now = Date.now();
    const name = (initialName || '').trim() || T.zh.unnamed;
    const c: CharEntity = {
      id,
      name,
      visibility: 'private',
      data: initialName ? { name: initialName.trim() } : {},
      ...(templateId ? { templateId } : {}),
      createdAt: now,
      updatedAt: now
    };
    doc.value.chars[id] = c;
    doc.value.ui.activeC = id;
    touch(true);
    return c;
  }

  function duplicateChar(sourceId?: string): CharEntity | null {
    const src = doc.value.chars[sourceId || doc.value.ui.activeC || ''];
    if (!src) return null;
    const id = uid('ch_');
    const now = Date.now();
    const copyName = (src.name || T.zh.unnamed) + ' copy';
    const c: CharEntity = {
      id,
      name: copyName,
      visibility: 'private',
      data: { ...src.data, ...(src.data.name ? { name: copyName } : {}) },
      ...(src.templateId ? { templateId: src.templateId } : {}),
      createdAt: now,
      updatedAt: now
    };
    doc.value.chars[id] = c;
    doc.value.ui.activeC = id;
    touch(true);
    return c;
  }

  function deleteChar(targetId?: string): boolean {
    const id = targetId || doc.value.ui.activeC;
    if (!id || Object.keys(doc.value.chars).length <= 1) return false;
    const ent = doc.value.chars[id];
    if (ent?.isReference && !authStore.isAdmin) {
      toast(GENTLE_REF_MSG(), 'warn');
      return false;
    }
    delete doc.value.chars[id];
    ensureActiveIds();
    touch(true);
    return true;
  }

  function selectChar(id: string) {
    if (doc.value.chars[id]) {
      doc.value.ui.activeC = id;
      touch(false, false);
    }
  }

  function renameEntity(oldName: string, newName: string): number {
    if (!authStore.isAdmin) {
      const isRef =
        Object.values(doc.value.worlds).some((w) => w.name === oldName && w.isReference) ||
        Object.values(doc.value.orgs).some((o) => o.name === oldName && o.isReference) ||
        Object.values(doc.value.chars).some((c) => c.name === oldName && c.isReference);
      if (isRef) {
        toast(GENTLE_REF_MSG(), 'warn');
        return 0;
      }
    }
    saveUndoSnapshot();
    const { doc: updated, count } = renameEntityEverywhere(doc.value, oldName, newName);
    doc.value = updated;
    touch(true);
    return count;
  }

  // Articles CRUD
  function createArticle(title?: string, category: ArticleCategory = '小说正文'): ArticleItem {
    const id = uid('art_');
    const now = Date.now();
    const art: ArticleItem = {
      id,
      title: (title || '').trim() || T.zh.unnamed,
      category,
      summary: '',
      content: '',
      worldId: doc.value.ui.activeW || undefined,
      orgIds: doc.value.ui.activeO ? [doc.value.ui.activeO] : [],
      charIds: doc.value.ui.activeC ? [doc.value.ui.activeC] : [],
      visibility: 'private',
      wordCount: 0,
      createdAt: now,
      updatedAt: now
    };
    if (!doc.value.articles) doc.value.articles = [];
    doc.value.articles.unshift(art);
    doc.value.ui.activeArticle = id;
    touch(true);
    return art;
  }

  function duplicateArticle(sourceId?: string): ArticleItem | null {
    const src = (doc.value.articles || []).find((a) => a.id === (sourceId || doc.value.ui.activeArticle));
    if (!src) return null;
    const id = uid('art_');
    const now = Date.now();
    const art: ArticleItem = {
      ...JSON.parse(JSON.stringify(src)),
      id,
      title: src.title + ' (副本)',
      visibility: 'private',
      shareId: undefined,
      createdAt: now,
      updatedAt: now
    };
    doc.value.articles.unshift(art);
    doc.value.ui.activeArticle = id;
    touch(true);
    return art;
  }

  function deleteArticle(id: string): boolean {
    if (!doc.value.articles) return false;
    const found = doc.value.articles.find((a) => a.id === id);
    if (found?.isReference && !authStore.isAdmin) {
      toast(GENTLE_REF_MSG(), 'warn');
      return false;
    }
    const prevLen = doc.value.articles.length;
    doc.value.articles = doc.value.articles.filter((a) => a.id !== id);
    if (doc.value.articles.length !== prevLen) {
      if (doc.value.ui.activeArticle === id) {
        doc.value.ui.activeArticle = doc.value.articles[0]?.id || null;
      }
      touch(true);
      return true;
    }
    return false;
  }

  function selectArticle(id: string) {
    const exists = (doc.value.articles || []).some((a) => a.id === id);
    if (exists) {
      doc.value.ui.activeArticle = id;
      touch(false, false);
    }
  }

  function updateArticle(id: string, patch: Partial<ArticleItem>) {
    const art = (doc.value.articles || []).find((a) => a.id === id);
    if (art) {
      Object.assign(art, patch);
      if (patch.content !== undefined) {
        art.wordCount = patch.content.length;
      }
      art.updatedAt = Date.now();
      touch();
    }
  }

  function toggleArticleVisibility(id: string): 'public' | 'private' | null {
    const art = (doc.value.articles || []).find((a) => a.id === id);
    if (!art) return null;
    art.visibility = art.visibility === 'public' ? 'private' : 'public';
    art.updatedAt = Date.now();
    touch(true);
    return art.visibility;
  }

  function updatePreferences(patch: Partial<StudioPreferences>) {
    if (!doc.value.preferences) {
      doc.value.preferences = {
        preferredGenre: '奇幻架空',
        writingTone: '细腻生动',
        defaultPerspective: '第三人称',
        aiCustomInstruction: ''
      };
    }
    Object.assign(doc.value.preferences, patch);
    touch(true);
  }

  /**
   * Replaces the workspace with the starter example. Local-only: the cloud document is untouched
   * (the caller resets the sync base so the next pull adopts the cloud copy again).
   */
  function resetToStarterExample() {
    saveUndoSnapshot();
    const starter = createStarterExampleDoc();
    doc.value = starter;
    reapplyReferences();
    touch(true, false);
  }

  /**
   * Called on logout. Drops the undo snapshot (so the next person on this device cannot
   * restore the previous user's data) and loads the starter example without marking the
   * document dirty, so nothing is ever pushed to the cloud as a side effect of logging out.
   */
  function unloadForLogout() {
    undoSnapshot.value = null;
    doc.value = createStarterExampleDoc();
    reapplyReferences();
    ensureActiveIds();
    touch(true, false);
  }

  function forkReferenceEntity(kind: EntityKind, sourceId: string): BaseEntity | null {
    const now = Date.now();
    if (kind === 'world') {
      const src = doc.value.worlds[sourceId];
      if (!src) return null;
      const id = uid('wd_');
      const copyName = (src.name || T.zh.unnamed) + ' (衍生副本)';
      const w: WorldEntity = {
        id,
        name: copyName,
        isReference: false,
        visibility: 'private',
        customInsp: [...(src.customInsp || [])],
        data: {
          ...src.data,
          w_name: copyName
        },
        createdAt: now,
        updatedAt: now
      };
      doc.value.worlds[id] = w;
      doc.value.ui.activeW = id;
      touch(true);
      toast('已复制为您的专属副本，您现在可以自由修改~', 'ok');
      return w;
    } else if (kind === 'org') {
      const src = doc.value.orgs[sourceId];
      if (!src) return null;
      const id = uid('og_');
      const copyName = (src.name || T.zh.unnamed) + ' (衍生副本)';
      const o: OrgEntity = {
        id,
        name: copyName,
        isReference: false,
        visibility: 'private',
        data: {
          ...src.data,
          o_name: copyName
        },
        createdAt: now,
        updatedAt: now
      };
      doc.value.orgs[id] = o;
      doc.value.ui.activeO = id;
      touch(true);
      toast('已复制为您的专属副本，您现在可以自由修改~', 'ok');
      return o;
    } else if (kind === 'char') {
      const src = doc.value.chars[sourceId];
      if (!src) return null;
      const id = uid('ch_');
      const copyName = (src.name || T.zh.unnamed) + ' (衍生副本)';
      const c: CharEntity = {
        id,
        name: copyName,
        isReference: false,
        visibility: 'private',
        templateId: src.templateId,
        data: {
          ...src.data,
          name: copyName
        },
        createdAt: now,
        updatedAt: now
      };
      doc.value.chars[id] = c;
      doc.value.ui.activeC = id;
      touch(true);
      toast('已复制为您的专属副本，您现在可以自由修改~', 'ok');
      return c;
    }
    return null;
  }

  function forkReferenceArticle(sourceId: string): ArticleItem | null {
    const src = (doc.value.articles || []).find((a) => a.id === sourceId);
    if (!src) return null;
    const id = uid('art_');
    const now = Date.now();
    const art: ArticleItem = {
      ...JSON.parse(JSON.stringify(src)),
      id,
      title: src.title + ' (衍生副本)',
      isReference: false,
      visibility: 'private',
      shareId: undefined,
      createdAt: now,
      updatedAt: now
    };
    if (!doc.value.articles) doc.value.articles = [];
    doc.value.articles.unshift(art);
    doc.value.ui.activeArticle = id;
    touch(true);
    toast('已复制为您的个人文章草稿，可自由编辑与续写~', 'ok');
    return art;
  }

  function forkReferencePlot(sourceId: string): PlotVolume | null {
    const src = (doc.value.plots || []).find((p) => p.id === sourceId);
    if (!src) return null;
    const id = uid('plot_');
    const now = Date.now();
    const copy: PlotVolume = {
      ...JSON.parse(JSON.stringify(src)),
      id,
      title: src.title + ' (衍生副本)',
      isReference: false,
      updatedAt: now,
      acts: (src.acts || []).map((act) => ({
        ...act,
        id: uid('act_'),
        chapters: (act.chapters || []).map((ch) => ({
          ...ch,
          id: uid('chp_')
        }))
      }))
    };
    if (!doc.value.plots) doc.value.plots = [];
    doc.value.plots.unshift(copy);
    touch(true);
    toast('已复制为您的专属剧情大纲卷，可自由规划章节与情节~', 'ok');
    return copy;
  }

  function forkReferenceScene(sourceId: string): SceneCard | null {
    const src = (doc.value.scenes || []).find((s) => s.id === sourceId);
    if (!src) return null;
    const id = uid('scn_');
    const now = Date.now();
    const copy: SceneCard = {
      ...JSON.parse(JSON.stringify(src)),
      id,
      title: src.title + ' (衍生副本)',
      isReference: false,
      updatedAt: now
    };
    if (!doc.value.scenes) doc.value.scenes = [];
    doc.value.scenes.unshift(copy);
    touch(true);
    toast('已复制为您的专属场景卡，可自由调整细节~', 'ok');
    return copy;
  }

  function forkReferenceTimeline(sourceId: string): TimelineEvent | null {
    const src = (doc.value.timeline || []).find((e) => e.id === sourceId);
    if (!src) return null;
    const id = uid('ev_');
    const now = Date.now();
    const copy: TimelineEvent = {
      ...JSON.parse(JSON.stringify(src)),
      id,
      name: src.name + ' (衍生副本)',
      src: 'manual',
      isReference: false,
      updatedAt: now
    };
    if (!doc.value.timeline) doc.value.timeline = [];
    doc.value.timeline.push(copy);
    touch(true);
    toast('已复制为您的专属纪年事件，可自由编排~', 'ok');
    return copy;
  }

  async function saveOfficialReferenceMaterials(): Promise<boolean> {
    if (!authStore.isAdmin) {
      toast(trStatic('只有网站管理员才能保存官方公共素材', 'Only site admins can save official materials'), 'err');
      return false;
    }
    try {
      toast(trStatic('正在保存官方公共参考素材…', 'Saving official materials…'), 'ok');
      const refDoc: DocV6 = extractReferenceSubset(JSON.parse(JSON.stringify(doc.value)));
      const res = await api.updateReferenceMaterials(refDoc);
      toast(res.message || trStatic('官方公共素材已更新 ✓', 'Official materials updated ✓'), 'ok');
      return true;
    } catch (err: any) {
      toast(err?.message || trStatic('保存失败', 'Save failed'), 'err');
      return false;
    }
  }

  /** Clears the local workspace only. See `resetToStarterExample` for the cloud contract. */
  function clearAllData() {
    saveUndoSnapshot();
    const empty = createEmptyDocV6();
    doc.value = empty;
    reapplyReferences();
    touch(true, false);
  }

  return {
    doc,
    ready,
    saving,
    lastSavedAt,
    undoSnapshot,
    entityIndex,
    activeWorld,
    activeOrg,
    activeChar,
    activeArticle,
    init,
    ensureActiveIds,
    flushSave,
    touch,
    onDirty,
    saveUndoSnapshot,
    undoLastOperation,
    replaceDoc,
    syncEntityName,
    createWorld,
    duplicateWorld,
    deleteWorld,
    selectWorld,
    createOrg,
    duplicateOrg,
    deleteOrg,
    selectOrg,
    createChar,
    duplicateChar,
    deleteChar,
    selectChar,
    renameEntity,
    createArticle,
    duplicateArticle,
    deleteArticle,
    selectArticle,
    updateArticle,
    toggleArticleVisibility,
    updatePreferences,
    forkReferenceEntity,
    forkReferenceArticle,
    forkReferencePlot,
    forkReferenceScene,
    forkReferenceTimeline,
    saveOfficialReferenceMaterials,
    reapplyReferences,
    resetToStarterExample,
    unloadForLogout,
    clearAllData
  };
});
