import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { fileToAvatarBlob } from '../core/avatarCompress';
import { ApiNetworkError, api, type AuthUser, type ChallengeResponse } from '../data/api';

/** 'unknown' = could not reach the server yet (offline start); we retry instead of assuming guest. */
export type SessionState = 'unknown' | 'guest' | 'authed' | 'expired';

export const useAuthStore = defineStore('auth', () => {
  const user = ref<AuthUser | null>(null);
  const loading = ref(false);
  const initialized = ref(false);
  const sessionState = ref<SessionState>('unknown');
  const challenge = ref<ChallengeResponse | null>(null);

  let resolveReady: (() => void) | null = null;
  const ready = new Promise<void>((resolve) => {
    resolveReady = resolve;
  });
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let retryCount = 0;

  /** Resolves once the initial session probe has produced an answer (router guards await this). */
  function whenReady(): Promise<void> {
    return ready;
  }

  const isLoggedIn = computed(() => Boolean(user.value));
  const isAdmin = computed(() => Boolean(user.value?.isAdmin));
  const isSuperAdmin = computed(() => Boolean(user.value?.isSuperAdmin));
  const isMuted = computed(() => Boolean(user.value?.isMuted));

  const displayName = computed(() => {
    if (!user.value) return '创作者';
    if (user.value.name && user.value.name.trim()) {
      return user.value.name.trim().slice(0, 16);
    }
    if (user.value.email) {
      return user.value.email.split('@')[0].slice(0, 16);
    }
    return '创作者';
  });

  async function fetchChallenge(): Promise<ChallengeResponse | null> {
    try {
      const res = await api.getChallenge();
      challenge.value = res;
      return res;
    } catch {
      return null;
    }
  }

  async function initSession(): Promise<AuthUser | null> {
    if (initialized.value) return user.value;
    loading.value = true;
    try {
      const res = await api.getMe();
      user.value = res.user;
      sessionState.value = 'authed';
      retryCount = 0;
      return res.user;
    } catch (err: any) {
      user.value = null;
      if (err instanceof ApiNetworkError) {
        // Offline start: keep "unknown" and probe again when the network comes back.
        sessionState.value = 'unknown';
        scheduleSessionRetry();
      } else {
        sessionState.value = 'guest';
      }
      return null;
    } finally {
      loading.value = false;
      initialized.value = true;
      resolveReady?.();
    }
  }

  function scheduleSessionRetry() {
    if (typeof window === 'undefined' || retryCount >= 3) return;
    if (retryTimer) clearTimeout(retryTimer);
    retryCount++;
    retryTimer = setTimeout(() => {
      void reprobeSession();
    }, 30000 * retryCount);
  }

  /** Re-checks the session (used after `online` events and retry back-off). */
  async function reprobeSession(): Promise<AuthUser | null> {
    if (user.value) return user.value;
    try {
      const res = await api.getMe();
      user.value = res.user;
      sessionState.value = 'authed';
      retryCount = 0;
      return res.user;
    } catch (err: any) {
      if (err instanceof ApiNetworkError) {
        scheduleSessionRetry();
      } else {
        sessionState.value = 'guest';
      }
      return null;
    }
  }

  /**
   * The server rejected our cookie mid-session. We drop the user but deliberately keep the
   * local document and sync base so re-login resumes as a normal 3-way merge.
   */
  async function onSessionExpired(): Promise<void> {
    if (!user.value) return;
    user.value = null;
    sessionState.value = 'expired';
    try {
      const { useSyncStore } = await import('./sync');
      useSyncStore().suspend();
    } catch {
      // ignore
    }
  }

  async function login(email: string, password: string): Promise<AuthUser> {
    loading.value = true;
    try {
      const res = await api.login({ email: email.trim(), password });
      user.value = res.user;
      sessionState.value = 'authed';
      return res.user;
    } finally {
      loading.value = false;
    }
  }

  async function register(payload: {
    email: string;
    password: string;
    inviteCode?: string;
    challengeToken?: string;
    challengeAnswer?: string;
  }): Promise<AuthUser> {
    loading.value = true;
    try {
      const res = await api.register({
        ...payload,
        email: payload.email.trim()
      });
      user.value = res.user;
      sessionState.value = 'authed';
      return res.user;
    } finally {
      loading.value = false;
    }
  }

  async function logout(): Promise<void> {
    try {
      await api.logout();
    } catch {
      // Ignore logout network error
    } finally {
      user.value = null;
      sessionState.value = 'guest';
      // Order matters: forget the sync base BEFORE swapping the document, so nothing that
      // happens during the swap can be interpreted as a deletion against the old base.
      try {
        const { useSyncStore } = await import('./sync');
        await useSyncStore().onLogout();
      } catch {
        // Ignore sync teardown error
      }
      try {
        const { useDocStore } = await import('./doc');
        useDocStore().unloadForLogout();
      } catch {
        // Ignore reset error
      }
      try {
        const { useAIStore } = await import('./ai');
        useAIStore().clearLocal();
      } catch {
        // Ignore AI teardown error
      }
    }
  }

  async function updateProfile(patch: {
    name?: string;
    avatar?: string;
    bio?: string;
  }): Promise<AuthUser> {
    const res = await api.updateMe(patch);
    user.value = res.user;
    return res.user;
  }

  async function uploadAvatarFile(file: File): Promise<AuthUser> {
    const blob = await fileToAvatarBlob(file);
    const res = await api.uploadAvatar(blob);
    user.value = res.user;
    return res.user;
  }

  return {
    user,
    loading,
    initialized,
    sessionState,
    whenReady,
    reprobeSession,
    onSessionExpired,
    challenge,
    isLoggedIn,
    isAdmin,
    isSuperAdmin,
    isMuted,
    displayName,
    fetchChallenge,
    initSession,
    login,
    register,
    logout,
    updateProfile,
    uploadAvatarFile
  };
});
