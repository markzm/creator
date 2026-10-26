import { del, get, set } from 'idb-keyval';
import { extractReferenceSubset, mergeReferenceMaterials } from '../core/reference';
import { createEmptyDocV6, migrateToV6 } from '../core/schema/migrations';
import type { DocV6 } from '../core/schema/types';
import { createStarterExampleDoc } from '../core/starterExample';
import { uid } from '../core/uid';

export const IDB_DOC_KEY = 'creator_doc_v6';
export const IDB_BASE_DOC_KEY = 'creator_base_doc_v6';
export const IDB_BASE_REV_KEY = 'creator_base_rev_v6';
export const LEGACY_LS_KEY = 'cc_db_v5';
export const SEED_FLAG_KEY = 'cc_seeded_v6';
export const SYNC_CHANNEL_NAME = 'creator_v6_sync';

export const currentTabId = uid('tab_');

let syncChannel: BroadcastChannel | null = null;

function getSyncChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') return null;
  if (!syncChannel) {
    try {
      syncChannel = new BroadcastChannel(SYNC_CHANNEL_NAME);
    } catch {
      return null;
    }
  }
  return syncChannel;
}

/**
 * Requests persistent storage from the browser if supported.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persist) {
      return await navigator.storage.persist();
    }
  } catch {
    // Ignore errors in headless/restricted environments
  }
  return false;
}

async function tryFetchServerSeed(): Promise<any | null> {
  try {
    if (
      typeof window === 'undefined' ||
      !window.location ||
      !window.location.protocol.startsWith('http') ||
      typeof fetch === 'undefined'
    ) {
      return null;
    }
    const res = await fetch('/api/seed', { credentials: 'same-origin' });
    if (res.status === 200) {
      const data = await res.json();
      if (data && typeof data === 'object' && (data.worlds || data.chars || data.orgs)) {
        return data;
      }
    }
  } catch {
    // Ignore network/offline errors
  }
  return null;
}

/**
 * Loads `DocV6` from IndexedDB, or automatically migrates from legacy `localStorage.getItem('cc_db_v5')`,
 * or seeds from `/api/seed`, or initializes a new empty `DocV6`.
 */
export async function loadOrMigrateDoc(): Promise<DocV6> {
  const notSeededYet =
    typeof localStorage !== 'undefined' &&
    localStorage.getItem(SEED_FLAG_KEY) !== '1' &&
    !localStorage.getItem(LEGACY_LS_KEY);

  try {
    const existing = await get<DocV6>(IDB_DOC_KEY);
    if (existing && typeof existing === 'object' && existing._version === 6) {
      let doc = migrateToV6(existing);
      if (notSeededYet) {
        const seedRaw = await tryFetchServerSeed();
        if (seedRaw) {
          // Only official `isReference` items may enter a user's workspace from the seed.
          mergeReferenceMaterials(doc, extractReferenceSubset(migrateToV6(seedRaw)));
          localStorage.setItem(SEED_FLAG_KEY, '1');
          await saveDocToIDB(doc, false);
        }
      }
      return doc;
    }
  } catch (e) {
    console.warn('[repo] IndexedDB read failed, falling back:', e);
  }

  // Check legacy localStorage key `cc_db_v5` without deleting it
  try {
    if (typeof localStorage !== 'undefined') {
      const rawStr = localStorage.getItem(LEGACY_LS_KEY);
      if (rawStr) {
        const parsed = JSON.parse(rawStr);
        const migrated = migrateToV6(parsed);
        await saveDocToIDB(migrated, false);
        return migrated;
      }
    }
  } catch (e) {
    console.warn('[repo] legacy cc_db_v5 migration failed:', e);
  }

  if (notSeededYet) {
    const seedRaw = await tryFetchServerSeed();
    if (seedRaw) {
      const seeded = createStarterExampleDoc();
      mergeReferenceMaterials(seeded, extractReferenceSubset(migrateToV6(seedRaw)));
      try {
        localStorage.setItem(SEED_FLAG_KEY, '1');
        await saveDocToIDB(seeded, false);
      } catch {
        // Ignore IDB write error
      }
      return seeded;
    }
  }

  // Brand new fresh workspace gets the starter example
  const starter = createStarterExampleDoc();
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(SEED_FLAG_KEY, '1');
    }
    await saveDocToIDB(starter, false);
  } catch {
    // Ignore IDB write error on initial creation
  }
  return starter;
}

/**
 * Saves `DocV6` into IndexedDB and optionally broadcasts a notification to other open tabs.
 */
export async function saveDocToIDB(doc: DocV6, broadcast = true): Promise<void> {
  const plain: DocV6 = JSON.parse(JSON.stringify(doc));
  await set(IDB_DOC_KEY, plain);
  if (broadcast) {
    const ch = getSyncChannel();
    if (ch) {
      try {
        ch.postMessage({ senderTabId: currentTabId, updatedAt: Date.now() });
      } catch {
        // Ignore broadcast errors
      }
    }
  }
}

/**
 * Loads the last synced base document and revision number from IndexedDB.
 */
export async function loadBaseSyncState(): Promise<{ baseDoc: DocV6 | null; baseRev: number }> {
  try {
    const [baseDoc, baseRev] = await Promise.all([
      get<DocV6>(IDB_BASE_DOC_KEY),
      get<number>(IDB_BASE_REV_KEY)
    ]);
    return {
      baseDoc: baseDoc && baseDoc._version === 6 ? baseDoc : null,
      baseRev: typeof baseRev === 'number' ? baseRev : 0
    };
  } catch {
    return { baseDoc: null, baseRev: 0 };
  }
}

/**
 * Saves the last synced base document and revision number to IndexedDB.
 */
export async function saveBaseSyncState(
  baseDoc: DocV6 | null,
  baseRev: number
): Promise<void> {
  try {
    if (baseDoc) {
      await set(IDB_BASE_DOC_KEY, JSON.parse(JSON.stringify(baseDoc)));
    } else {
      await del(IDB_BASE_DOC_KEY);
    }
    await set(IDB_BASE_REV_KEY, baseRev);
  } catch (e) {
    console.warn('[repo] saveBaseSyncState failed:', e);
  }
}

/**
 * Subscribes to updates from other browser tabs via `BroadcastChannel('creator_v6_sync')`.
 */
export function subscribeMultiTabSync(onExternalUpdate: (doc: DocV6) => void): () => void {
  const ch = getSyncChannel();
  if (!ch) return () => {};

  const handler = async (ev: MessageEvent) => {
    const data = ev.data;
    if (!data || data.senderTabId === currentTabId) return;
    try {
      const latest = await get<DocV6>(IDB_DOC_KEY);
      if (latest && latest._version === 6) {
        onExternalUpdate(latest);
      }
    } catch {
      // Ignore read errors
    }
  };

  ch.addEventListener('message', handler);
  return () => {
    ch.removeEventListener('message', handler);
  };
}
