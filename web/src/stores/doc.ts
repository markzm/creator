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
  StudioPreferences,
  WorldEntity
} from '../core/schema/types';
import { createStarterExampleDoc } from '../core/starterExample';
import { recordDailyStats } from '../core/stats';
import { uid } from '../core/uid';
import {
  loadOrMigrateDoc,
  requestPersistentStorage,
  saveDocToIDB,
  subscribeMultiTabSync
} from '../data/repo';

export const useDocStore = defineStore('doc', () => {
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

    if (unsubMultiTab) unsubMultiTab();
    unsubMultiTab = subscribeMultiTabSync((externalDoc) => {
      doc.value = migrateToV6(externalDoc);
      ensureActiveIds();
      lastSavedAt.value = Date.now();
    });
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

  function resetToStarterExample() {
    saveUndoSnapshot();
    const starter = createStarterExampleDoc();
    doc.value = starter;
    touch(true);
  }

  function clearAllData() {
    saveUndoSnapshot();
    const empty = createEmptyDocV6();
    doc.value = empty;
    touch(true);
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
    resetToStarterExample,
    clearAllData
  };
});
