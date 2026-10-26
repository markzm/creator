<template>
  <Modal
    v-model="uiStore.modals.aiConfig"
    :title="'🤖 ' + tr('AI 引擎与量身定制设定器偏好', 'AI Engines & Studio Preferences')"
    max-width="560px"
  >
    <div style="display: flex; flex-direction: column; gap: 16px">
      <!-- AI Engine Channel Tabs -->
      <div style="display: flex; gap: 8px">
        <button
          type="button"
          class="btn sm"
          :class="aiStore.activeProvider === 'public' ? 'primary' : ''"
          style="flex: 1"
          @click="aiStore.activeProvider = 'public'"
        >
          🌐 {{ tr('公共免费 AI (OpenRouter)', 'Public Free AI') }}
        </button>
        <button
          type="button"
          class="btn sm"
          :class="aiStore.activeProvider === 'custom' ? 'primary' : ''"
          style="flex: 1"
          @click="aiStore.activeProvider = 'custom'"
        >
          🔑 {{ tr('个人外部 AI (DeepSeek等)', 'Custom External AI') }}
        </button>
      </div>

      <!-- Public Free AI Panel -->
      <div v-if="aiStore.activeProvider === 'public'" class="card open" style="padding: 14px; margin: 0">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px">
          <strong style="font-size: 13.5px">⚡ {{ tr('OpenRouter 免费大模型池', 'OpenRouter Free Model Pool') }}</strong>
          <span
            class="pill"
            :style="{
              background: aiStore.publicReady ? 'var(--oks)' : 'var(--dns)',
              color: aiStore.publicReady ? 'var(--ok)' : 'var(--dn)'
            }"
          >
            {{ aiStore.publicReady ? tr('服务端已就绪 ✓', 'Ready ✓') : tr('未配置 Key', 'Unconfigured') }}
          </span>
        </div>
        <p class="hint" style="margin: 0 0 10px; font-size: 12px; line-height: 1.5">
          {{ tr('系统内置 OpenRouter 免费大模型链路，无需输入 Key 即可免费生成设定与故事；若首选模型遇到上游拥堵，自动切换备选免费模型。', 'Free public models via OpenRouter with automatic failover fallback.') }}
        </p>

        <label style="display: block; font-weight: 600; font-size: 12.5px; margin-bottom: 4px">
          {{ tr('首选免费模型', 'Preferred Free Model') }}
        </label>
        <select v-model="aiStore.selectedFreeModel">
          <option v-for="m in aiStore.freeModels" :key="m" :value="m">
            {{ m }}
          </option>
        </select>
      </div>

      <!-- Custom External AI Panel -->
      <div v-if="aiStore.activeProvider === 'custom'" class="card open" style="padding: 14px; margin: 0">
        <h4 style="margin: 0 0 6px; font-size: 13.5px">🔑 {{ tr('个人外部 API 接入 (BYOK)', 'Bring Your Own Key') }}</h4>
        <p class="hint" style="margin: 0 0 10px; font-size: 12px">
          {{ tr('支持接入个人 DeepSeek 官方 API、硅基流动或任意 OpenAI 兼容端点，尊享独立额度与极速生成。', 'Connect DeepSeek official API or any OpenAI-compatible provider.') }}
        </p>

        <!-- Presets Buttons -->
        <div style="display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 12px">
          <button
            v-for="p in aiStore.presets"
            :key="p.id"
            type="button"
            class="btn sm"
            style="font-size: 11.5px"
            @click="applyPreset(p)"
          >
            {{ p.name }}
          </button>
        </div>

        <div style="display: flex; flex-direction: column; gap: 10px">
          <div>
            <label style="display: block; font-weight: 600; font-size: 12px; margin-bottom: 3px">
              API Base URL
            </label>
            <input
              v-model="aiStore.customAi.baseUrl"
              type="text"
              placeholder="https://api.deepseek.com/v1"
            />
          </div>

          <div>
            <label style="display: block; font-weight: 600; font-size: 12px; margin-bottom: 3px">
              API Key (sk-...)
            </label>
            <input
              v-model="aiStore.customAi.apiKey"
              type="password"
              :placeholder="aiStore.cloudHasKey ? tr('已保存于账号：', 'Saved in account: ') + (aiStore.cloudKeyMasked || '****') + tr('（留空保持不变）', ' (leave blank to keep)') : 'sk-••••••••••••••••'"
              autocomplete="off"
            />
            <div v-if="aiStore.cloudHasKey" style="display: flex; align-items: center; gap: 8px; margin-top: 4px">
              <span class="hint" style="margin: 0">🔐 {{ tr('密钥已加密保存在云端，不会再回传到浏览器。', 'Key is encrypted server-side and never sent back to the browser.') }}</span>
              <button type="button" class="btn sm ghost danger" style="margin-left: auto" @click="onClearCloudKey">
                {{ tr('清除云端密钥', 'Remove saved key') }}
              </button>
            </div>
          </div>

          <div>
            <label style="display: block; font-weight: 600; font-size: 12px; margin-bottom: 3px">
              {{ tr('模型名称', 'Model Name') }}
            </label>
            <input
              v-model="aiStore.customAi.model"
              type="text"
              placeholder="deepseek-chat"
            />
          </div>

          <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-top: 4px">
            <button
              type="button"
              class="btn sm"
              :disabled="testing || (!aiStore.customAi.apiKey && !aiStore.cloudHasKey)"
              @click="onTest"
            >
              {{ testing ? tr('测试中…', 'Testing…') : '⚡ ' + tr('测试连接', 'Test Connection') }}
            </button>
            <span v-if="testResult" style="font-size: 11.5px" :style="{ color: testOk ? 'var(--ok)' : 'var(--dn)' }">
              {{ testResult }}
            </span>
          </div>

          <div v-if="authStore.isLoggedIn" style="display: flex; align-items: center; gap: 8px; margin-top: 6px; font-size: 12px">
            <input id="syncCloudCheck" v-model="aiStore.syncCloud" type="checkbox" />
            <label for="syncCloudCheck" style="cursor: pointer">
              {{ tr('加密同步至我的云端账号（跨设备自动使用）', 'Sync securely to my cloud account') }}
            </label>
          </div>
        </div>
      </div>

      <!-- Studio Preferences / Customization -->
      <div class="card open" style="padding: 14px; margin: 0">
        <h4 style="margin: 0 0 6px; font-size: 13.5px">🎨 {{ tr('设定器量身定制偏好', 'Studio Customization') }}</h4>
        <p class="hint" style="margin: 0 0 10px; font-size: 12px">
          {{ tr('这些定制偏好将在所有设定生成与文章写作时自动注入给 AI，让输出契合你的专属风格。', 'Injected into AI prompts to tailor style to your preferences.') }}
        </p>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px">
          <div>
            <label style="display: block; font-weight: 600; font-size: 12px; margin-bottom: 3px">
              {{ tr('主打流派 / 题材', 'Preferred Genre') }}
            </label>
            <input
              v-model="aiStore.preferences.preferredGenre"
              type="text"
              :placeholder="tr('例：奇幻架空 / 蒸汽朋克 / 赛博朋克', 'e.g. Fantasy / Sci-fi')"
            />
          </div>
          <div>
            <label style="display: block; font-weight: 600; font-size: 12px; margin-bottom: 3px">
              {{ tr('文风倾向', 'Writing Tone') }}
            </label>
            <input
              v-model="aiStore.preferences.writingTone"
              type="text"
              :placeholder="tr('例：细腻生动、史诗厚重、冷峻考据', 'e.g. Vivid, Epic, Gritty')"
            />
          </div>
        </div>

        <div>
          <label style="display: block; font-weight: 600; font-size: 12px; margin-bottom: 3px">
            {{ tr('全局附加指令 (Custom Instructions)', 'Custom Instructions') }}
          </label>
          <textarea
            v-model="aiStore.preferences.aiCustomInstruction"
            rows="2"
            :placeholder="tr('例：侧重人物心理活动，避免浮夸形容词，用词考究自然。', 'e.g. Focus on sensory details and character psychology.')"
          />
        </div>
      </div>
    </div>

    <template #footer>
      <button type="button" class="btn sm" @click="uiStore.closeModal('aiConfig')">
        {{ tr('取消', 'Cancel') }}
      </button>
      <button type="button" class="btn primary sm" @click="onSave">
        {{ tr('保存设置', 'Save Settings') }}
      </button>
    </template>
  </Modal>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from '../../composables/useI18n';
import { useToast } from '../../composables/useToast';
import type { AIPreset } from '../../data/api';
import { useAIStore } from '../../stores/ai';
import { useAuthStore } from '../../stores/auth';
import { useUIStore } from '../../stores/ui';
import Modal from '../base/Modal.vue';

const uiStore = useUIStore();
const aiStore = useAIStore();
const authStore = useAuthStore();
const { tr } = useI18n();
const { toast } = useToast();

const testing = ref(false);
const testResult = ref('');
const testOk = ref(false);

function applyPreset(p: AIPreset) {
  aiStore.customAi.provider = p.id as any;
  aiStore.customAi.baseUrl = p.baseUrl;
  aiStore.customAi.model = p.model;
  testResult.value = '';
}

async function onClearCloudKey() {
  try {
    await aiStore.clearCloudKey();
    toast(tr('云端密钥已清除', 'Saved key removed'), 'ok');
  } catch (err: any) {
    toast(err?.message || tr('操作失败', 'Failed'), 'err');
  }
}

async function onTest() {
  testing.value = true;
  testResult.value = '';
  try {
    const msg = await aiStore.testConnection();
    testOk.value = true;
    testResult.value = msg;
    toast(tr('连接测试成功 ✓', 'Connection OK ✓'), 'ok');
  } catch (err: any) {
    testOk.value = false;
    testResult.value = err?.message || tr('连接失败', 'Failed');
    toast(tr('连接测试失败', 'Test Failed'), 'err');
  } finally {
    testing.value = false;
  }
}

async function onSave() {
  try {
    await aiStore.saveConfig();
    toast(tr('AI 设置与偏好已保存 ✓', 'Settings saved ✓'), 'ok');
    uiStore.closeModal('aiConfig');
  } catch (err: any) {
    toast((tr('保存失败：', 'Save failed: ')) + (err?.message || ''), 'err');
  }
}
</script>
