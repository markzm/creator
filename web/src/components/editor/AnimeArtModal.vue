<template>
  <Modal
    :model-value="uiStore.modals.animeArt"
    title="🎨 二次元 AI 绘画与立绘生成器"
    max-width="720px"
    @update:model-value="(v) => !v && uiStore.closeModal('animeArt')"
  >
    <div style="display: flex; flex-direction: column; gap: 16px">
      <!-- Top Tip -->
      <div class="card" style="padding: 10px 14px; background: var(--acs); border-left: 3px solid var(--ac); font-size: 12.5px">
        💡 专为二次元创作者打造：支持自动从当前角色卡片（外貌、衣着、性格、发色等）提炼高精提示词，一键生成头像与全身立绘。
      </div>

      <!-- Controls Grid -->
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px">
        <!-- Style selection -->
        <div>
          <label style="display: block; font-size: 12px; font-weight: 700; margin-bottom: 6px">
            🖌️ 二次元画风预设
          </label>
          <select v-model="selectedStyle" class="input" style="width: 100%; font-size: 13px">
            <option value="anime_classic">✨ 日系经典二次元 (Classic Anime)</option>
            <option value="makoto_shinkai">🌤️ 新海诚梦幻光影 (Makoto Shinkai Sky)</option>
            <option value="cyberpunk_anime">⚡ 赛博朋克二次元 (Cyberpunk Anime)</option>
            <option value="gothic_anime">🥀 暗黑哥特二次元 (Dark Gothic Anime)</option>
            <option value="chibi_anime">🎀 Q版萌系二次元 (Chibi Kawaii)</option>
            <option value="otome_anime">🌸 乙女治愈系 (Otome Gentle)</option>
            <option value="pixel_anime">👾 复古像素二次元 (Pixel Retro)</option>
          </select>
        </div>

        <!-- Aspect ratio -->
        <div>
          <label style="display: block; font-size: 12px; font-weight: 700; margin-bottom: 6px">
            📐 画面画幅比例
          </label>
          <select v-model="selectedRatio" class="input" style="width: 100%; font-size: 13px">
            <option value="1:1">👤 角色头像 (1:1 正方)</option>
            <option value="9:16">🧍 角色立绘 (9:16 全身竖版)</option>
            <option value="3:4">🖼️ 半身立绘 (3:4 经典构图)</option>
          </select>
        </div>
      </div>

      <!-- Prompt Builder Area -->
      <div>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px">
          <label style="font-size: 12px; font-weight: 700">
            📝 画面画面提示词 (Prompt)
          </label>
          <button
            v-if="currentChar"
            type="button"
            class="btn sm"
            style="font-size: 11.5px; padding: 2px 8px"
            @click="extractCharPrompt"
          >
            ⚡ 从当前角色《{{ currentChar.name }}》一键提炼
          </button>
        </div>
        <textarea
          v-model="promptText"
          class="input"
          rows="3"
          placeholder="例如：银色长发，淡紫色的双瞳，星界测绘法师斗篷，手持星象仪，柔和晨光…"
          style="width: 100%; box-sizing: border-box; font-size: 13px; line-height: 1.5"
        />
      </div>

      <!-- Generate Action -->
      <div style="display: flex; justify-content: flex-end; gap: 10px">
        <button
          type="button"
          class="btn primary"
          :disabled="generating || !promptText.trim()"
          style="padding: 8px 20px; font-weight: 700"
          @click="generateArtwork"
        >
          {{ generating ? 'AI 正在绘制二次元立绘中…' : '✨ 开始生成二次元立绘' }}
        </button>
      </div>

      <!-- Preview & Result Area -->
      <div v-if="generating" class="card" style="padding: 40px; text-align: center; background: var(--soft)">
        <div style="font-size: 28px; margin-bottom: 10px">🎨</div>
        <div style="font-weight: 700; font-size: 14px">二次元神经画师正在构想光影与线条…</div>
        <div class="hint" style="margin-top: 6px; font-size: 12px">通常耗时 3~8 秒，请稍候</div>
      </div>

      <div v-else-if="resultImage" class="card" style="padding: 16px; background: var(--soft); text-align: center">
        <div style="font-size: 13px; font-weight: 700; margin-bottom: 10px">🎉 生成效果预览</div>
        <div style="display: flex; justify-content: center; margin-bottom: 14px">
          <img
            :src="resultImage"
            alt="AI Anime Art"
            style="max-width: 100%; max-height: 380px; border-radius: 8px; box-shadow: 0 4px 15px rgba(0, 0, 0, 0.15); object-fit: contain"
          />
        </div>
        <div style="display: flex; justify-content: center; gap: 10px; flex-wrap: wrap">
          <button type="button" class="btn primary sm" @click="applyAsAvatar">
            👤 设为当前角色头像
          </button>
          <button type="button" class="btn primary sm" @click="applyAsTachiE">
            🧍 设为当前角色全身立绘
          </button>
          <a :href="resultImage" target="_blank" download="anime_art.png" class="btn sm" style="text-decoration: none">
            💾 下载原图
          </a>
        </div>
      </div>
    </div>

    <template #footer>
      <button type="button" class="btn sm" @click="uiStore.closeModal('animeArt')">
        关闭
      </button>
    </template>
  </Modal>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import Modal from '../base/Modal.vue';
import { useToast } from '../../composables/useToast';
import { api } from '../../data/api';
import { useAuthStore } from '../../stores/auth';
import { useDocStore } from '../../stores/doc';
import { useUIStore } from '../../stores/ui';

const docStore = useDocStore();
const uiStore = useUIStore();
const authStore = useAuthStore();
const { toast } = useToast();

const selectedStyle = ref('makoto_shinkai');
const selectedRatio = ref('1:1');
const promptText = ref('');
const generating = ref(false);
const resultImage = ref('');

const currentChar = computed(() => docStore.activeChar);

function extractCharPrompt() {
  const c = currentChar.value;
  if (!c) return;
  const data = c.data || {};
  const tags: string[] = [];

  if (c.name) tags.push(`角色名: ${c.name}`);
  if (data.gender) tags.push(`${data.gender}`);
  if (data.age) tags.push(`${data.age}`);
  if (data.race) tags.push(`${data.race}`);
  if (data.job) tags.push(`${data.job}`);
  if (data.feature) tags.push(`外貌特征: ${data.feature}`);
  if (data.clothes) tags.push(`衣着打扮: ${data.clothes}`);
  if (data.personality) tags.push(`神态气质: ${data.personality}`);
  if (data.power) tags.push(`能力气场: ${data.power}`);

  promptText.value = tags.join('，');
}

watch(() => uiStore.modals.animeArt, (open) => {
  if (open && !promptText.value && currentChar.value) {
    extractCharPrompt();
  }
});

async function generateArtwork() {
  if (!promptText.value.trim() || generating.value) return;
  if (!authStore.isLoggedIn) {
    toast('AI 立绘生成需要登录后使用', 'warn');
    uiStore.openModal('auth');
    return;
  }
  generating.value = true;
  resultImage.value = '';
  try {
    const res = await api.paintAnime({
      prompt: promptText.value.trim(),
      style: selectedStyle.value,
      aspectRatio: selectedRatio.value,
      charName: currentChar.value?.name,
      features: currentChar.value?.data?.feature
    });
    resultImage.value = res.imageUrl;
    toast('二次元立绘生成成功！', 'ok');
  } catch (err: any) {
    toast(err?.message || '生成失败，请重试', 'err');
  } finally {
    generating.value = false;
  }
}

function applyAsAvatar() {
  if (!currentChar.value || !resultImage.value) return;
  currentChar.value.avatar = resultImage.value;
  docStore.touch(true);
  toast('已成功设为角色头像 ✓', 'ok');
  uiStore.closeModal('animeArt');
}

function applyAsTachiE() {
  if (!currentChar.value || !resultImage.value) return;
  currentChar.value.tachiE = resultImage.value;
  docStore.touch(true);
  toast('已成功设为角色全身立绘 ✓', 'ok');
  uiStore.closeModal('animeArt');
}
</script>
