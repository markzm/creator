import { defineStore } from 'pinia';
import { ref } from 'vue';
import { showToast } from '../composables/useToast';
import { computeSyncHash, threeWayMerge, isDocEffectivelyEmpty } from '../core/diff';
import { migrateToV6 } from '../core/schema/migrations';
import type { DiffSummary, DocV6, FieldConflict } from '../core/schema/types';
import { ApiConflictError, api } from '../data/api';
import { loadBaseSyncState, saveBaseSyncState } from '../data/repo';
import { useAuthStore } from './auth';
import { useDocStore } from './doc';
import { useUIStore } from './ui';

export type SyncStatus = 'synced' | 'dirty' | 'syncing' | 'offline' | 'conflict';

export interface ActiveConflictState {
  serverDoc: DocV6;
  serverRev: number;
  serverUpdatedAt: number;
  mergedDoc: DocV6;
  conflicts: FieldConflict[];
  summary: DiffSummary;
}

export const useSyncStore = defineStore('sync', () => {
  const status = ref<SyncStatus>('offline');
  const baseRev = ref<number>(0);
  const baseDoc = ref<DocV6 | null>(null);
  const lastSyncedAt = ref<number | null>(null);
  const lastError = ref<string>('');
  const conflictState = ref<ActiveConflictState | null>(null);

  let pushTimer: ReturnType<typeof setTimeout> | null = null;
  let presenceTimer: ReturnType<typeof setInterval> | null = null;
  let initialized = false;

  async function init() {
    if (initialized) return;
    initialized = true;
    const baseState = await loadBaseSyncState();
    baseDoc.value = baseState.baseDoc;
    baseRev.value = baseState.baseRev;

    const docStore = useDocStore();
    docStore.onDirty(() => {
      markDirty();
    });
  }

  function markDirty() {
    const authStore = useAuthStore();
    if (!authStore.isLoggedIn) {
      status.value = 'offline';
      return;
    }
    if (status.value !== 'conflict') {
      status.value = 'dirty';
    }
    schedulePush();
  }

  function schedulePush(delayMs = 1800) {
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(() => {
      void push(false);
    }, delayMs);
  }

  async function updateBaseState(doc: DocV6, rev: number, syncedAt?: number) {
    baseDoc.value = JSON.parse(JSON.stringify(doc));
    baseRev.value = rev;
    lastSyncedAt.value = syncedAt || Date.now();
    await saveBaseSyncState(baseDoc.value, rev);
  }

  async function handleConflictOrMerge(
    serverRawDoc: DocV6,
    serverRev: number,
    serverUpdatedAt: number,
    manual = false
  ): Promise<boolean> {
    const docStore = useDocStore();
    const uiStore = useUIStore();
    const serverDoc = migrateToV6(serverRawDoc);

    // If local doc is completely empty, adopt server doc directly
    if (isDocEffectivelyEmpty(docStore.doc) && !isDocEffectivelyEmpty(serverDoc)) {
      docStore.replaceDoc(serverDoc, false, false);
      docStore.reapplyReferences();
      await updateBaseState(serverDoc, serverRev, serverUpdatedAt);
      status.value = 'synced';
      showToast(uiStore.lang === 'zh' ? '已从云端恢复 ✓' : 'Restored from cloud ✓', 'ok');
      return true;
    }

    // If content hash is identical, no push needed
    if (computeSyncHash(docStore.doc) === computeSyncHash(serverDoc)) {
      await updateBaseState(serverDoc, serverRev, serverUpdatedAt);
      status.value = 'synced';
      if (manual) {
        showToast(uiStore.lang === 'zh' ? '本地与云端一致 ✓' : 'Already in sync ✓', 'ok');
      }
      return true;
    }

    // Run 3-way merge
    const mergeRes = threeWayMerge(baseDoc.value, docStore.doc, serverDoc);
    if (mergeRes.canAutoMerge) {
      docStore.replaceDoc(mergeRes.mergedDoc, false, false);
      docStore.reapplyReferences();
      await updateBaseState(serverDoc, serverRev, serverUpdatedAt);
      // Push merged result with baseRev = serverRev
      const putRes = await api.putSync(docStore.doc, serverRev);
      await updateBaseState(docStore.doc, putRes.rev, putRes.updatedAt);
      conflictState.value = null;
      status.value = 'synced';
      showToast(
        uiStore.lang === 'zh' ? '已自动合并多端修改 ✓' : 'Auto-merged changes ✓',
        'ok'
      );
      return true;
    }

    // Hard field conflicts require user confirmation
    conflictState.value = {
      serverDoc,
      serverRev,
      serverUpdatedAt,
      mergedDoc: mergeRes.mergedDoc,
      conflicts: mergeRes.conflicts,
      summary: mergeRes.summary
    };
    status.value = 'conflict';
    uiStore.openModal('conflict');
    return false;
  }

  async function push(manual = false): Promise<boolean> {
    const authStore = useAuthStore();
    const docStore = useDocStore();
    const uiStore = useUIStore();
    if (!authStore.isLoggedIn) {
      status.value = 'offline';
      if (manual) uiStore.openModal('auth');
      return false;
    }
    if (pushTimer) {
      clearTimeout(pushTimer);
      pushTimer = null;
    }

    status.value = 'syncing';
    lastError.value = '';
    try {
      await docStore.flushSave(false);
      const res = await api.putSync(docStore.doc, baseRev.value);
      await updateBaseState(docStore.doc, res.rev, res.updatedAt);
      conflictState.value = null;
      status.value = 'synced';
      if (manual) {
        showToast(uiStore.lang === 'zh' ? '已同步到云端 ✓' : 'Synced to cloud ✓', 'ok');
      }
      return true;
    } catch (err: any) {
      if (err instanceof ApiConflictError) {
        try {
          return await handleConflictOrMerge(
            err.serverData,
            err.serverRev,
            err.updatedAt,
            manual
          );
        } catch (innerErr: any) {
          lastError.value = innerErr?.message || 'Merge push failed';
          status.value = 'dirty';
          return false;
        }
      }
      lastError.value = err?.message || 'Sync failed';
      status.value = 'dirty';
      if (manual) {
        showToast(
          (uiStore.lang === 'zh' ? '同步失败：' : 'Sync failed: ') + lastError.value,
          'err'
        );
      }
      return false;
    }
  }

  async function pull(manual = false): Promise<boolean> {
    const authStore = useAuthStore();
    const uiStore = useUIStore();
    if (!authStore.isLoggedIn) {
      status.value = 'offline';
      if (manual) uiStore.openModal('auth');
      return false;
    }

    status.value = 'syncing';
    lastError.value = '';
    try {
      const remote = await api.getSync();
      if (!remote || !remote.data) {
        // Server has no document yet -> initial push with baseRev=0
        baseRev.value = 0;
        baseDoc.value = null;
        return await push(manual);
      }
      return await handleConflictOrMerge(remote.data, remote.rev, remote.updatedAt, manual);
    } catch (err: any) {
      lastError.value = err?.message || 'Pull failed';
      status.value = 'dirty';
      if (manual) {
        showToast(
          (uiStore.lang === 'zh' ? '拉取云端失败：' : 'Pull failed: ') + lastError.value,
          'err'
        );
      }
      return false;
    }
  }

  async function resolveConflict(
    choice: 'local' | 'remote' | 'merged',
    customMergedDoc?: DocV6
  ): Promise<boolean> {
    const cState = conflictState.value;
    if (!cState) return false;

    const docStore = useDocStore();
    const uiStore = useUIStore();

    if (choice === 'remote') {
      docStore.replaceDoc(cState.serverDoc, false, false);
      docStore.reapplyReferences();
      await updateBaseState(cState.serverDoc, cState.serverRev, cState.serverUpdatedAt);
      conflictState.value = null;
      status.value = 'synced';
      uiStore.closeModal('conflict');
      showToast(uiStore.lang === 'zh' ? '已采用云端版本 ✓' : 'Adopted cloud version ✓', 'ok');
      return true;
    }

    const targetDoc =
      choice === 'local' ? docStore.doc : customMergedDoc || cState.mergedDoc;
    docStore.replaceDoc(targetDoc, false, false);
    docStore.reapplyReferences();
    await updateBaseState(cState.serverDoc, cState.serverRev, cState.serverUpdatedAt);
    conflictState.value = null;
    uiStore.closeModal('conflict');
    return await push(true);
  }

  async function sendPresence(focusLabel: string) {
    const authStore = useAuthStore();
    if (!authStore.isLoggedIn) return;
    try {
      await api.postPresence(focusLabel);
    } catch {
      // Ignore heartbeat network error
    }
  }

  function startPresenceHeartbeat(getFocusLabel: () => string) {
    if (presenceTimer) clearInterval(presenceTimer);
    void sendPresence(getFocusLabel());
    presenceTimer = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      void sendPresence(getFocusLabel());
    }, 60000);
  }

  function stopPresenceHeartbeat() {
    if (presenceTimer) {
      clearInterval(presenceTimer);
      presenceTimer = null;
    }
  }

  async function onAuthSuccess(getFocusLabel?: () => string) {
    await init();
    await pull(false);
    if (getFocusLabel) {
      startPresenceHeartbeat(getFocusLabel);
    }
  }

  /**
   * Forgets the merge base (memory + IndexedDB). Must run on logout and before any
   * local-only reset, otherwise a later 3-way merge would read the missing entities as
   * intentional local deletions and wipe them from the cloud.
   */
  async function resetBaseState() {
    if (pushTimer) {
      clearTimeout(pushTimer);
      pushTimer = null;
    }
    baseDoc.value = null;
    baseRev.value = 0;
    lastSyncedAt.value = null;
    conflictState.value = null;
    await saveBaseSyncState(null, 0);
  }

  async function onLogout() {
    stopPresenceHeartbeat();
    status.value = 'offline';
    await resetBaseState();
  }

  return {
    status,
    baseRev,
    baseDoc,
    lastSyncedAt,
    lastError,
    conflictState,
    init,
    markDirty,
    push,
    pull,
    resolveConflict,
    resetBaseState,
    sendPresence,
    startPresenceHeartbeat,
    stopPresenceHeartbeat,
    onAuthSuccess,
    onLogout
  };
});
