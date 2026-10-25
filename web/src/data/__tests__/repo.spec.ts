import 'fake-indexeddb/auto';
import { clear, get } from 'idb-keyval';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  IDB_DOC_KEY,
  LEGACY_LS_KEY,
  loadBaseSyncState,
  loadOrMigrateDoc,
  saveBaseSyncState,
  saveDocToIDB
} from '../repo';

describe('data/repo — IndexedDB persistence & legacy cc_db_v5 migration', () => {
  beforeEach(async () => {
    await clear();
    localStorage.clear();
  });

  it('creates and persists a fresh DocV6 when both IDB and localStorage are empty', async () => {
    const doc = await loadOrMigrateDoc();
    expect(doc._version).toBe(6);
    expect(Object.keys(doc.worlds)).toHaveLength(1);
    expect(Object.keys(doc.orgs)).toHaveLength(1);
    expect(Object.keys(doc.chars).length).toBeGreaterThanOrEqual(1);
    expect(doc.articles?.length).toBeGreaterThanOrEqual(1);

    const stored = await get(IDB_DOC_KEY);
    expect(stored).toBeDefined();
    expect(stored._version).toBe(6);
  });

  it('automatically migrates legacy cc_db_v5 from localStorage into IndexedDB without deleting cc_db_v5', async () => {
    const legacyV5 = {
      _version: 5.1,
      worlds: {
        w_legacy: { id: 'w_legacy', name: '旧世', data: { w_name: '旧世' } }
      },
      orgs: {},
      chars: {
        c_legacy: { id: 'c_legacy', name: '古人', data: { name: '古人' } }
      },
      activeW: 'w_legacy',
      activeC: 'c_legacy'
    };
    localStorage.setItem(LEGACY_LS_KEY, JSON.stringify(legacyV5));

    const migrated = await loadOrMigrateDoc();
    expect(migrated._version).toBe(6);
    expect(migrated.worlds.w_legacy.name).toBe('旧世');
    expect(migrated.chars.c_legacy.name).toBe('古人');
    expect(migrated.ui.activeW).toBe('w_legacy');
    expect(migrated.ui.activeC).toBe('c_legacy');

    // Original localStorage key is preserved for rollback safety
    expect(localStorage.getItem(LEGACY_LS_KEY)).toBeTruthy();

    // Subsequent loads read directly from IndexedDB
    migrated.worlds.w_legacy.data.w_core = '新核心设定';
    await saveDocToIDB(migrated, false);

    const reloaded = await loadOrMigrateDoc();
    expect(reloaded.worlds.w_legacy.data.w_core).toBe('新核心设定');
  });

  it('persists and loads base sync state (baseDoc & baseRev)', async () => {
    const doc = await loadOrMigrateDoc();
    await saveBaseSyncState(doc, 7);

    const state = await loadBaseSyncState();
    expect(state.baseRev).toBe(7);
    expect(state.baseDoc?._version).toBe(6);
  });
});
