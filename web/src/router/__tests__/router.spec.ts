import 'fake-indexeddb/auto';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../data/api', async () => {
  const actual = await vi.importActual<typeof import('../../data/api')>('../../data/api');
  return {
    ...actual,
    api: {
      ...actual.api,
      getMe: vi.fn(async () => {
        throw new actual.ApiError('unauthorized', 401);
      }),
      getGlobalStats: vi.fn(async () => ({ totalUsers: 0, onlineUsers: 0, totalPublicShares: 0, kindCounts: {}, totalPublicWords: 0, totalSyncedWords: 0, recentCreations: [], activeCreators: [] }))
    }
  };
});

describe('router guards — guest gating', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('sends guests from auth-only pages to /welcome with ?next= and lets public pages through', async () => {
    const { router } = await import('../index');
    const { useAuthStore } = await import('../../stores/auth');
    const auth = useAuthStore();
    await auth.initSession(); // 401 -> guest
    expect(auth.sessionState).toBe('guest');

    await router.push('/me');
    await router.isReady();
    expect(router.currentRoute.value.name).toBe('welcome');
    expect(router.currentRoute.value.query.next).toBe('/me');

    await router.push('/');
    expect(router.currentRoute.value.name).toBe('welcome');
    expect(router.currentRoute.value.query.next).toBeUndefined();

    await router.push('/lobby');
    expect(router.currentRoute.value.name).toBe('lobby');
    await router.push('/char');
    expect(router.currentRoute.value.name).toBe('char');
  });

  it('bounces signed-in users away from /welcome to their intended page', async () => {
    const { router } = await import('../index');
    const { useAuthStore } = await import('../../stores/auth');
    const auth = useAuthStore();
    auth.user = { id: 1, email: 'a@x', name: 'A', avatar: '', bio: '' } as any;
    auth.initialized = true;
    await router.push({ name: 'welcome', query: { next: '/me' } });
    expect(router.currentRoute.value.path).toBe('/me');
  });
});
