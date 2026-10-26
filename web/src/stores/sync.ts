import { defineStore } from 'pinia';
import { ref } from 'vue';
import { showToast } from '../composables/useToast';
import { computeSyncHash, threeWayMerge, isDocEffectivelyEmpty } from '../core/diff';
import { migrateToV6 } from '../core/schema/migrations';
import type { DiffSummary, DocV6, FieldConflict } from '../core/schema/types';
import { ApiConflictError, ApiNetworkError, api, toMs } from '../data/api';
import { stripReferenceItems } from '../core/reference';
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
  /** The PUT currently on the wire (if any); further pushes coalesce behind it. */
  let inFlight: Promise<boolean> | null = null;
  let queued = false;
  /** Set after a 401: no automatic pushes until the user signs in again. */
  let suspended = false;
  let focusLabelProvider: (() => string) | null = null;

  function clone(doc: DocV6): DocV6 {
    return JSON.parse(JSON.stringify(doc));
  }

  /** The document exactly as it goes over the wire (no UI state, no reference items). */
  function wireDoc(doc: DocV6): DocV6 {
    return stripReferenceItems(doc);
  }

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

    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        const authStore = useAuthStore();
        if (authStore.isLoggedIn && !suspended && status.value === 'dirty') {
          schedulePush(500);
        }
      });
    }
  }

  function markDirty() {
    const authStore = useAuthStore();
    if (!authStore.isLoggedIn || suspended) {
      status.value = 'offline';
      return;
    }
    // While a conflict is open, keep editing local-only: another PUT would just 409 again and
    // reset the user's choices in the dialog.
    if (status.value === 'conflict') return;
    status.value = 'dirty';
    schedulePush();
  }

  /** Stops automatic syncing (session expired). State is kept so a re-login can resume. */
  function suspend() {
    suspended = true;
    if (pushTimer) {
      clearTimeout(pushTimer);
      pushTimer = null;
    }
    stopPresenceHeartbeat();
    status.value = 'offline';
  }

  function setFocusLabelProvider(fn: () => string) {
    focusLabelProvider = fn;
  }

  function schedulePush(delayMs = 1800) {
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(() => {
      void push(false);
    }, delayMs);
  }

  async function updateBaseState(doc: DocV6, rev: number, syncedAt?: number) {
    baseDoc.value = wireDoc(clone(doc));
    baseRev.value = rev;
    lastSyncedAt.value = syncedAt ? toMs(syncedAt) : Date.now();
    await saveBaseSyncState(baseDoc.value, rev);
  }

  /**
   * Sends a snapshot of the current document. Edits made while the request is in flight are
   * detected by hash and leave the status `dirty` so they get pushed next.
   */
  async function putSnapshot(baseRevToUse: number): Promise<{ rev: number; updatedAt: number; changedMeanwhile: boolean }> {
    const docStore = useDocStore();
    const snapshot = clone(docStore.doc);
    const sentHash = computeSyncHash(snapshot);
    const res = await api.putSync(wireDoc(snapshot), baseRevToUse);
    await updateBaseState(snapshot, res.rev, res.updatedAt);
    return { rev: res.rev, updatedAt: res.updatedAt, changedMeanwhile: computeSyncHash(docStore.doc) !== sentHash };
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

    // Run 3-way merge (reference items are stripped on all three sides)
    const mergeRes = threeWayMerge(
      baseDoc.value ? wireDoc(baseDoc.value) : null,
      wireDoc(docStore.doc),
      wireDoc(serverDoc)
    );
    if (mergeRes.canAutoMerge) {
      docStore.replaceDoc(mergeRes.mergedDoc, false, false);
      docStore.reapplyReferences();
      await updateBaseState(serverDoc, serverRev, serverUpdatedAt);
      // Push merged result with baseRev = serverRev
      const putRes = await putSnapshot(serverRev);
      conflictState.value = null;
      status.value = putRes.changedMeanwhile ? 'dirty' : 'synced';
      if (putRes.changedMeanwhile) schedulePush(500);
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
    const uiStore = useUIStore();
    if (!authStore.isLoggedIn) {
      status.value = 'offline';
      if (manual) uiStore.openModal('auth');
      return false;
    }
    if (manual) suspended = false;
    if (suspended) return false;
    if (pushTimer) {
      clearTimeout(pushTimer);
      pushTimer = null;
    }
    // Coalesce: one PUT on the wire at a time; a request made meanwhile runs right after.
    if (inFlight) {
      queued = true;
      return inFlight;
    }
    inFlight = doPush(manual).finally(() => {
      inFlight = null;
      if (queued) {
        queued = false;
        schedulePush(200);
      }
    });
    return inFlight;
  }

  async function doPush(manual: boolean): Promise<boolean> {
    const docStore = useDocStore();
    const uiStore = useUIStore();
    status.value = 'syncing';
    lastError.value = '';
    try {
      await docStore.flushSave(false);
      const res = await putSnapshot(baseRev.value);
      conflictState.value = null;
      if (res.changedMeanwhile) {
        status.value = 'dirty';
        schedulePush(500);
      } else {
        status.value = 'synced';
      }
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
      if (err?.status === 401) {
        // onSessionExpired() (via the api event) suspends us; nothing else to do here.
        return false;
      }
      if (err instanceof ApiNetworkError) {
        // Offline: wait for the `online` event instead of hammering the network.
        if (manual) {
          showToast(uiStore.lang === 'zh' ? '当前离线，恢复网络后会自动同步' : 'Offline – will sync when back online', 'warn');
        }
        return false;
      }
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

    if (manual) suspended = false;
    status.value = 'syncing';
    lastError.value = '';
    try {
      const remote = await api.getSync();
      if (!remote || !remote.data) {
        // Server has no document yet -> initial push with baseRev=0
        baseRev.value = 0;
        baseDoc.value = null;
        suspended = false;
        return await push(manual);
      }
      suspended = false;
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
    status.value = 'dirty';
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

  function startPresenceHeartbeat(getFocusLabel?: () => string) {
    if (getFocusLabel) focusLabelProvider = getFocusLabel;
    const provider = focusLabelProvider || (() => 'studio');
    if (presenceTimer) clearInterval(presenceTimer);
    void sendPresence(provider());
    presenceTimer = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      void sendPresence(provider());
    }, 60000);
  }

  function stopPresenceHeartbeat() {
    if (presenceTimer) {
      clearInterval(presenceTimer);
      presenceTimer = null;
    }
  }

  async function onAuthSuccess(getFocusLabel?: () => string) {
    suspended = false;
    await init();
    await pull(false);
    startPresenceHeartbeat(getFocusLabel);
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
    suspended = false;
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
    suspend,
    setFocusLabelProvider,
    sendPresence,
    startPresenceHeartbeat,
    stopPresenceHeartbeat,
    onAuthSuccess,
    onLogout
  };
});
