import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import type { StudioPreferences } from '../core/schema/types';
import {
  api,
  type AIGenerateRequest,
  type AIGenerateResponse,
  type AIPreset,
  type UserAIConfig
} from '../data/api';
import { useAuthStore } from './auth';
import { useUIStore } from './ui';

/** AI generation is a logged-in feature (the server enforces it too); guests are sent to sign in. */
function requireLogin(authStore: ReturnType<typeof useAuthStore>): void {
  if (authStore.isLoggedIn) return;
  try {
    useUIStore().openModal('auth');
  } catch {
    // UI store may be unavailable in tests
  }
  throw new Error('AI 功能需要登录后使用，请先登录或注册账号');
}

const LS_AI_CONFIG_KEY = 'cc_user_ai_cfg';
const LS_AI_PREFS_KEY = 'cc_user_ai_prefs';

export const useAIStore = defineStore('ai', () => {
  const authStore = useAuthStore();

  const publicReady = ref(false);
  const freeModels = ref<string[]>([]);
  const selectedFreeModel = ref('deepseek/deepseek-chat-v3-0324:free');
  const presets = ref<AIPreset[]>([]);
  const loading = ref(false);

  // Active provider: 'public' or 'custom'
  const activeProvider = ref<'public' | 'custom'>('public');

  const customAi = ref<UserAIConfig>({
    provider: 'deepseek',
    baseUrl: 'https://api.deepseek.com/v1',
    apiKey: '',
    model: 'deepseek-chat'
  });

  const syncCloud = ref(true);
  /** The server holds an encrypted key for this account (the key itself never comes back). */
  const cloudHasKey = ref(false);
  const cloudKeyMasked = ref('');

  const preferences = ref<StudioPreferences>({
    preferredGenre: '奇幻架空',
    writingTone: '细腻生动',
    defaultPerspective: '第三人称',
    aiCustomInstruction: ''
  });

  async function init() {
    try {
      const st = await api.getAIStatus();
      publicReady.value = st.publicReady;
      freeModels.value = st.freeModels || [];
      presets.value = st.presets || [];
      if (freeModels.value.length > 0 && !freeModels.value.includes(selectedFreeModel.value)) {
        selectedFreeModel.value = freeModels.value[0];
      }
    } catch {
      // Offline fallback
    }

    // Load local config
    try {
      const raw = localStorage.getItem(LS_AI_CONFIG_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.customAi) customAi.value = { ...customAi.value, ...parsed.customAi };
        if (parsed.activeProvider) activeProvider.value = parsed.activeProvider;
        if (parsed.selectedFreeModel) selectedFreeModel.value = parsed.selectedFreeModel;
      }
      const rawPrefs = localStorage.getItem(LS_AI_PREFS_KEY);
      if (rawPrefs) {
        preferences.value = { ...preferences.value, ...JSON.parse(rawPrefs) };
      }
    } catch {
      // Ignore
    }

    if (authStore.isLoggedIn) {
      await loadCloudConfig();
    }
  }

  /** Pulls provider/model/preferences from the account. Safe to call after an interactive login. */
  async function loadCloudConfig() {
    if (!authStore.isLoggedIn) return;
    try {
      const cloud = await api.getUserAIConfig();
      if (cloud.customAi && cloud.customAi.hasKey) {
        cloudHasKey.value = true;
        cloudKeyMasked.value = cloud.customAi.apiKeyMasked || '';
        customAi.value = {
          ...customAi.value,
          provider: cloud.customAi.provider || customAi.value.provider,
          baseUrl: cloud.customAi.baseUrl || customAi.value.baseUrl,
          model: cloud.customAi.model || customAi.value.model
        };
        syncCloud.value = true;
      } else {
        cloudHasKey.value = false;
        cloudKeyMasked.value = '';
      }
      if (cloud.preferences && cloud.preferences.preferredGenre) {
        preferences.value = { ...preferences.value, ...cloud.preferences };
      }
    } catch {
      // Ignore
    }
  }

  /** True when generation will actually go through the user's own provider. */
  const effectiveProvider = computed<'public' | 'custom'>(() =>
    activeProvider.value === 'custom' && (Boolean(customAi.value.apiKey) || cloudHasKey.value) ? 'custom' : 'public'
  );

  function saveLocal() {
    try {
      // When the key lives in the account we keep it out of localStorage entirely.
      const persistKey = !(authStore.isLoggedIn && syncCloud.value);
      localStorage.setItem(
        LS_AI_CONFIG_KEY,
        JSON.stringify({
          activeProvider: activeProvider.value,
          selectedFreeModel: selectedFreeModel.value,
          customAi: persistKey ? customAi.value : { ...customAi.value, apiKey: '' }
        })
      );
      localStorage.setItem(LS_AI_PREFS_KEY, JSON.stringify(preferences.value));
    } catch {
      // Ignore
    }
  }

  /** Forgets device-local AI settings (including any API key) so they never leak to the next user. */
  function clearLocal() {
    try {
      localStorage.removeItem(LS_AI_CONFIG_KEY);
      localStorage.removeItem(LS_AI_PREFS_KEY);
    } catch {
      // Ignore
    }
    activeProvider.value = 'public';
    cloudHasKey.value = false;
    cloudKeyMasked.value = '';
    customAi.value = {
      provider: 'deepseek',
      baseUrl: 'https://api.deepseek.com/v1',
      apiKey: '',
      model: 'deepseek-chat'
    };
  }

  async function saveConfig() {
    saveLocal();
    if (authStore.isLoggedIn && syncCloud.value) {
      const typedKey = (customAi.value.apiKey || '').trim();
      // Partial update: only send the key when the user typed a new one this session.
      await api.updateUserAIConfig({
        ...(typedKey ? { customAi: { ...customAi.value, apiKey: typedKey } } : {}),
        preferences: preferences.value
      });
      if (typedKey) {
        cloudHasKey.value = true;
        cloudKeyMasked.value = typedKey.length > 8 ? typedKey.slice(0, 3) + '…' + typedKey.slice(-4) : '****';
        customAi.value.apiKey = '';
        saveLocal();
      }
    }
  }

  /** Removes the key stored in the account (local copy too). */
  async function clearCloudKey() {
    if (authStore.isLoggedIn) {
      await api.updateUserAIConfig({ clearKey: true });
    }
    cloudHasKey.value = false;
    cloudKeyMasked.value = '';
    customAi.value.apiKey = '';
    saveLocal();
  }

  async function generate(req: Omit<AIGenerateRequest, 'customAi' | 'preferences'>): Promise<AIGenerateResponse> {
    requireLogin(authStore);
    loading.value = true;
    try {
      const fullReq: AIGenerateRequest = {
        ...req,
        preferences: preferences.value,
        publicModel: selectedFreeModel.value || undefined
      };
      if (activeProvider.value === 'custom') {
        if (customAi.value.apiKey) {
          fullReq.customAi = customAi.value;
        }
        // With a cloud-stored key the server resolves it from the account.
      }
      return await api.generateAI(fullReq);
    } finally {
      loading.value = false;
    }
  }

  async function testConnection(cfg?: UserAIConfig): Promise<string> {
    requireLogin(authStore);
    const target = cfg || customAi.value;
    const res = await api.testAIConnection(target);
    return res.message;
  }

  return {
    publicReady,
    freeModels,
    selectedFreeModel,
    presets,
    loading,
    activeProvider,
    customAi,
    syncCloud,
    preferences,
    init,
    cloudHasKey,
    cloudKeyMasked,
    effectiveProvider,
    loadCloudConfig,
    clearCloudKey,
    saveConfig,
    clearLocal,
    generate,
    testConnection
  };
});
