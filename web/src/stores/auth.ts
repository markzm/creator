import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { fileToAvatarBlob } from '../core/avatarCompress';
import { api, type AuthUser, type ChallengeResponse } from '../data/api';

export const useAuthStore = defineStore('auth', () => {
  const user = ref<AuthUser | null>(null);
  const loading = ref(false);
  const initialized = ref(false);
  const challenge = ref<ChallengeResponse | null>(null);

  const isLoggedIn = computed(() => Boolean(user.value));
  const isAdmin = computed(() => Boolean(user.value?.isAdmin));
  const isSuperAdmin = computed(() => {
    if (!user.value) return false;
    if (user.value.isSuperAdmin) return true;
    const email = (user.value.email || '').toLowerCase();
    const name = (user.value.name || '').toLowerCase();
    return email.startsWith('markzm@') || email === 'markzm' || name === 'markzm';
  });
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
      return res.user;
    } catch {
      user.value = null;
      return null;
    } finally {
      loading.value = false;
      initialized.value = true;
    }
  }

  async function login(email: string, password: string): Promise<AuthUser> {
    loading.value = true;
    try {
      const res = await api.login({ email: email.trim(), password });
      user.value = res.user;
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
      try {
        const { useDocStore } = await import('./doc');
        const docStore = useDocStore();
        docStore.resetToStarterExample();
      } catch {
        // Ignore reset error
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
