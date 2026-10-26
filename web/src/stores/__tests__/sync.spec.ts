import 'fake-indexeddb/auto';
import { clear } from 'idb-keyval';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DocV6 } from '../../core/schema/types';

// ---- api mock -------------------------------------------------------------------------
const putCalls: Array<{ data: DocV6; baseRev: number }> = [];
let serverDoc: DocV6 | null = null;
let serverRev = 0;
let putGate: (() => void) | null = null;
let putEntered = false;
let failPutWith: any = null;

vi.mock('../../data/api', async () => {
  const actual = await vi.importActual<typeof import('../../data/api')>('../../data/api');
  return {
    ...actual,
    api: {
      ...actual.api,
      getMe: vi.fn(async () => ({ user: { id: 1, email: 'a@x', name: 'A', avatar: '', bio: '' } })),
      logout: vi.fn(async () => ({ ok: true })),
      getReferenceMaterials: vi.fn(async () => null),
      getAIStatus: vi.fn(async () => ({ publicReady: false, freeModels: [], presets: [] })),
      getUserAIConfig: vi.fn(async () => ({})),
      postPresence: vi.fn(async () => ({ ok: true })),
      getSync: vi.fn(async () => (serverDoc ? { data: serverDoc, rev: serverRev, updatedAt: 1_700_000_000 } : null)),
      putSync: vi.fn(async (data: DocV6, baseRev: number) => {
        if (failPutWith) {
          const e = failPutWith;
          failPutWith = null;
          throw e;
        }
        putEntered = true;
        if (putGate) {
          await new Promise<void>((resolve) => {
            putGate = resolve;
          });
        }
        putCalls.push({ data: JSON.parse(JSON.stringify(data)), baseRev });
        serverDoc = JSON.parse(JSON.stringify(data));
        serverRev += 1;
        return { rev: serverRev, updatedAt: 1_700_000_100 };
      })
    }
  };
});

async function stores() {
  const { useDocStore } = await import('../doc');
  const { useSyncStore } = await import('../sync');
  const { useAuthStore } = await import('../auth');
  return { doc: useDocStore(), sync: useSyncStore(), auth: useAuthStore() };
}

function userWorldCount(doc: DocV6) {
  return Object.values(doc.worlds).filter((w) => !w.isReference).length;
}

describe('stores/sync — data-safety contracts', () => {
  beforeEach(async () => {
    setActivePinia(createPinia());
    await clear();
    localStorage.clear();
    putCalls.length = 0;
    serverDoc = null;
    serverRev = 0;
    putGate = null;
    putEntered = false;
    failPutWith = null;
  });

  it('logout forgets the merge base and the next login adopts the cloud copy instead of wiping it', async () => {
    const { doc, sync, auth } = await stores();
    await doc.init();
    await sync.init();
    await auth.initSession();
    // user authors something and syncs
    doc.createWorld();
    const w = Object.values(doc.doc.worlds).find((x) => !x.isReference)!;
    w.data.w_name = '我的世界';
    w.data.w_core = '不可丢失';
    doc.touch(true, false);
    await sync.push(true);
    expect(sync.baseRev).toBeGreaterThan(0);
    const cloudWorlds = userWorldCount(serverDoc!);
    expect(cloudWorlds).toBeGreaterThan(0);

    await auth.logout();
    expect(sync.baseRev).toBe(0);
    expect(sync.baseDoc).toBeNull();
    expect(doc.undoSnapshot).toBeNull();
    // nothing was pushed as a side-effect of logging out
    expect(putCalls.length).toBe(1);

    // log back in on the same device (starter example is loaded locally)
    auth.user = { id: 1, email: 'a@x', name: 'A', avatar: '', bio: '' } as any;
    await sync.onAuthSuccess();
    expect(putCalls.length).toBe(1); // no destructive PUT
    expect(userWorldCount(doc.doc)).toBe(cloudWorlds);
    expect(JSON.stringify(doc.doc)).toContain('不可丢失');
  });

  it('coalesces concurrent pushes and keeps the doc dirty when it changed while a PUT was in flight', async () => {
    const { doc, sync, auth } = await stores();
    await doc.init();
    await sync.init();
    await auth.initSession();
    doc.createWorld();
    const w = Object.values(doc.doc.worlds).find((x) => !x.isReference)!;
    w.data.w_name = 'v1';
    doc.touch(true, false);

    putGate = () => {}; // make putSync wait until released
    const p1 = sync.push(true);
    const p2 = sync.push(true); // piggybacks on the in-flight request
    // wait until the snapshot has been taken and the PUT is actually on the wire
    await vi.waitFor(() => expect(putEntered).toBe(true));
    // edit while the request is on the wire
    w.data.w_name = 'v2';
    doc.touch(true, false);
    // release
    (putGate as () => void)();
    putGate = null;
    await Promise.all([p1, p2]);
    expect(putCalls.length).toBe(1);
    expect(putCalls[0].data.worlds[w.id].data.w_name).toBe('v1');
    expect(sync.status).toBe('dirty'); // v2 still has to go out
    expect(sync.baseDoc!.worlds[w.id].data.w_name).toBe('v1'); // base is what was SENT, not v2
  });

  it('never sends official reference items to the cloud', async () => {
    const { doc, sync, auth } = await stores();
    await doc.init();
    await sync.init();
    await auth.initSession();
    doc.doc.worlds.wd_ref = { id: 'wd_ref', name: '官方', isReference: true, customInsp: [], data: { w_name: '官方' }, createdAt: 1, updatedAt: 1 };
    doc.createWorld();
    const w = Object.values(doc.doc.worlds).find((x) => !x.isReference)!;
    w.data.w_name = 'mine';
    doc.touch(true, false);
    await sync.push(true);
    expect(putCalls[0].data.worlds.wd_ref).toBeUndefined();
    expect(putCalls[0].data.worlds[w.id]).toBeDefined();
  });

  it('a 401 during push suspends sync but keeps the local document and base', async () => {
    const { doc, sync, auth } = await stores();
    await doc.init();
    await sync.init();
    await auth.initSession();
    doc.createWorld();
    const w = Object.values(doc.doc.worlds).find((x) => !x.isReference)!;
    w.data.w_name = 'keep me';
    doc.touch(true, false);
    await sync.push(true);
    const baseRevBefore = sync.baseRev;
    const { ApiError } = await import('../../data/api');
    failPutWith = new ApiError('unauthorized', 401);
    w.data.w_name = 'after expiry';
    doc.touch(true, false);
    const ok = await sync.push(true);
    expect(ok).toBe(false);
    await auth.onSessionExpired();
    expect(auth.isLoggedIn).toBe(false);
    expect(auth.sessionState).toBe('expired');
    expect(sync.baseRev).toBe(baseRevBefore); // base kept for a normal 3-way on re-login
    expect(doc.doc.worlds[w.id].data.w_name).toBe('after expiry'); // document untouched
  });
});
