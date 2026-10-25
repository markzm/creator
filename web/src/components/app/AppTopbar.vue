<template>
  <header class="topbar">
    <button
      v-if="route.path !== '/'"
      type="button"
      class="btn sm"
      @click="router.push('/')"
    >
      ← <span class="hide-mobile">{{ tr('主页', 'Home') }}</span>
    </button>
    <span class="brand" @click="router.push('/')">
      {{ tr('设定创作器', 'Worldbuilding Studio') }}
    </span>

    <span class="spacer" />

    <button
      v-if="docStore.undoSnapshot"
      type="button"
      class="btn sm"
      @click="onUndo"
    >
      ↩ <span class="hide-mobile">{{ tr('撤销', 'Undo') }}</span>
    </button>

    <button
      type="button"
      class="btn sm"
      title="⌘K / Ctrl+K"
      @click="uiStore.openModal('commandPalette')"
    >
      🔍 <span class="hide-mobile">{{ tr('搜索', 'Search') }}</span>
      <span class="hide-mobile" style="font-size: 10px; color: var(--mu)">⌘K</span>
    </button>

    <button
      type="button"
      class="btn sm hide-mobile"
      @click="uiStore.openModal('backup')"
    >
      💾 {{ tr('备份 / 导出', 'Backup / Export') }}
    </button>

    <button
      type="button"
      class="btn sm hide-mobile"
      @click="uiStore.openModal('tutorial')"
    >
      📖 {{ tr('教程', 'Tutorial') }}
    </button>

    <button
      type="button"
      class="btn sm"
      @click="uiStore.toggleDark()"
    >
      {{ uiStore.dark ? '☀️' : '🌙' }}
    </button>

    <button
      type="button"
      class="btn sm hide-mobile"
      @click="onToggleLang"
    >
      🌐 {{ uiStore.lang === 'zh' ? 'EN' : '中' }}
    </button>

    <SyncIndicator />
  </header>
</template>

<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from '../../composables/useI18n';
import { useToast } from '../../composables/useToast';
import { useDocStore } from '../../stores/doc';
import { useUIStore } from '../../stores/ui';
import SyncIndicator from './SyncIndicator.vue';

const route = useRoute();
const router = useRouter();
const docStore = useDocStore();
const uiStore = useUIStore();
const { tr } = useI18n();
const { toast } = useToast();

function onToggleLang() {
  uiStore.toggleLang();
  toast(uiStore.lang === 'zh' ? '已切换到中文' : 'Switched to English', 'ok');
}

function onUndo() {
  if (docStore.undoLastOperation()) {
    toast(tr('已撤销上次替换', 'Undo complete'), 'ok');
  }
}
</script>

<style scoped>
@media (max-width: 768px) {
  .hide-mobile {
    display: none !important;
  }
}
</style>
