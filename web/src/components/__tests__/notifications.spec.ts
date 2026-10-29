import { createPinia, setActivePinia } from 'pinia';
import { createApp, nextTick } from 'vue';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import NotificationDropdown from '../app/NotificationDropdown.vue';
import { api } from '../../data/api';
import { useAuthStore } from '../../stores/auth';
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('../../data/api', async () => {
  const actual = await vi.importActual<typeof import('../../data/api')>('../../data/api');
  return { ...actual, api: { ...actual.api, getNotificationCount: vi.fn(async () => ({ unreadCount: 2 })), getNotifications: vi.fn(async () => ({ notifications: [], unreadCount: 2 })) } };
});
let app: ReturnType<typeof createApp>, host: HTMLElement;
let hidden = false;
const original = Object.getOwnPropertyDescriptor(document, 'hidden');
const flush = async () => { for (let i = 0; i < 5; i++) { await Promise.resolve(); await nextTick(); } };
beforeEach(() => {
  vi.useFakeTimers(); vi.clearAllMocks(); hidden = false;
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
  const pinia = createPinia(); setActivePinia(pinia);
  host = document.createElement('div'); document.body.append(host);
  app = createApp(NotificationDropdown); app.use(pinia); app.mount(host);
});
afterEach(() => {
  app.unmount(); host.remove(); vi.useRealTimers();
  if (original) Object.defineProperty(document, 'hidden', original); else delete (document as any).hidden;
});
it('starts after login, polls counts only, loads details on open, and pauses on hidden pages or logout', async () => {
  expect(api.getNotificationCount).not.toHaveBeenCalled();
  const auth = useAuthStore(); auth.user = { id: 2 } as any; await flush();
  expect(api.getNotificationCount).toHaveBeenCalledTimes(1);
  (host.querySelector('button') as HTMLButtonElement).click(); await flush();
  expect(api.getNotifications).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(30000); await flush();
  expect(api.getNotifications).toHaveBeenCalledTimes(1); expect(api.getNotificationCount).toHaveBeenCalledTimes(2);
  hidden = true; await vi.advanceTimersByTimeAsync(60000); await flush();
  expect(api.getNotificationCount).toHaveBeenCalledTimes(2); expect(api.getNotifications).toHaveBeenCalledTimes(1);
  hidden = false; document.dispatchEvent(new Event('visibilitychange')); await flush();
  expect(api.getNotificationCount).toHaveBeenCalledTimes(3);
  auth.user = null; await flush(); await vi.advanceTimersByTimeAsync(30000);
  expect(api.getNotificationCount).toHaveBeenCalledTimes(3);
});
