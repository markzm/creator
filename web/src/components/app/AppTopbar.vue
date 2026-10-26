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

    <!-- Guest / Offline Mode Badge -->
    <button
      v-if="!authStore.isLoggedIn"
      type="button"
      class="btn sm"
      style="background: rgba(245, 158, 11, 0.12); color: #d97706; border-color: #f59e0b; font-weight: 600"
      :title="tr('未登录离线体验版，点击登录或注册同步云端', 'Guest offline mode. Click to sign in or register.')"
      @click="uiStore.openModal('auth')"
    >
      ⚠️ <span class="hide-mobile">{{ tr('离线体验版 (未登录)', 'Offline Mode (Guest)') }}</span>
      <span class="show-mobile">{{ tr('未登录', 'Guest') }}</span>
    </button>

    <!-- Logged in items -->
    <template v-else>
      <NotificationDropdown />

      <button
        v-if="authStore.isAdmin"
        type="button"
        class="btn sm"
        style="background: rgba(99, 102, 241, 0.12); color: var(--ac); border-color: var(--ac); font-weight: 600"
        :title="tr('管理员后台控制台', 'Admin Console')"
        @click="uiStore.openModal('adminConsole')"
      >
        🛡️ <span class="hide-mobile">{{ tr('管理后台', 'Admin') }}</span>
      </button>

      <button
        v-if="authStore.user"
        type="button"
        class="btn sm hide-mobile"
        style="font-size: 12px; font-weight: 600"
        :title="tr('查看个人创作者主页', 'View Creator Profile')"
        @click="uiStore.openCreatorProfile(authStore.user.id)"
      >
        👤 {{ authStore.displayName }}
      </button>
    </template>

    <SyncIndicator />
  </header>
</template>

<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from '../../composables/useI18n';
import { useToast } from '../../composables/useToast';
import { useDocStore } from '../../stores/doc';
import { useUIStore } from '../../stores/ui';
import { useAuthStore } from '../../stores/auth';
import SyncIndicator from './SyncIndicator.vue';
import NotificationDropdown from './NotificationDropdown.vue';

const route = useRoute();
const router = useRouter();
const docStore = useDocStore();
const uiStore = useUIStore();
const authStore = useAuthStore();
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
.show-mobile {
  display: none !important;
}

@media (max-width: 900px) {
  .hide-mobile {
    display: none !important;
  }
  .show-mobile {
    display: inline !important;
  }
}
</style>
