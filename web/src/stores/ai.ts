import { defineStore } from 'pinia';
import { ref } from 'vue';
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

    // If logged in, optionally load cloud config
    if (authStore.isLoggedIn) {
      try {
        const cloud = await api.getUserAIConfig();
        if (cloud.customAi && cloud.customAi.apiKey) {
          customAi.value = { ...customAi.value, ...cloud.customAi };
          syncCloud.value = true;
        }
        if (cloud.preferences && cloud.preferences.preferredGenre) {
          preferences.value = { ...preferences.value, ...cloud.preferences };
        }
      } catch {
        // Ignore
      }
    }
  }

  function saveLocal() {
    try {
      localStorage.setItem(
        LS_AI_CONFIG_KEY,
        JSON.stringify({
          activeProvider: activeProvider.value,
          selectedFreeModel: selectedFreeModel.value,
          customAi: customAi.value
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
      await api.updateUserAIConfig({
        customAi: customAi.value,
        preferences: preferences.value
      });
    }
  }

  async function generate(req: Omit<AIGenerateRequest, 'customAi' | 'preferences'>): Promise<AIGenerateResponse> {
    requireLogin(authStore);
    loading.value = true;
    try {
      const fullReq: AIGenerateRequest = {
        ...req,
        preferences: preferences.value
      };
      if (activeProvider.value === 'custom' && customAi.value.apiKey) {
        fullReq.customAi = customAi.value;
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
    saveConfig,
    clearLocal,
    generate,
    testConnection
  };
});
