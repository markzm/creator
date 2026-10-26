<template>
  <header class="topbar">
    <button
      v-if="route.path !== '/'"
      type="button"
      class="btn sm ghost"
      :aria-label="tr('返回总览', 'Back to dashboard')"
      @click="router.push('/')"
    >
      <ArrowLeft /> <span class="hide-mobile">{{ tr('总览', 'Home') }}</span>
    </button>
    <span class="brand show-mobile-inline" @click="router.push('/')">
      {{ tr('设定创作器', 'Worldbuilding Studio') }}
    </span>

    <span class="spacer" />

    <button
      v-if="docStore.undoSnapshot"
      type="button"
      class="btn sm"
      :title="tr('撤销上一次批量操作', 'Undo last bulk operation')"
      @click="onUndo"
    >
      <Undo2 /> <span class="hide-mobile">{{ tr('撤销', 'Undo') }}</span>
    </button>

    <button
      type="button"
      class="btn sm"
      :title="tr('全局搜索与命令（⌘K / Ctrl+K）', 'Search & commands (⌘K / Ctrl+K)')"
      @click="uiStore.openModal('commandPalette')"
    >
      <Search /> <span class="hide-mobile">{{ tr('搜索', 'Search') }}</span>
      <kbd class="hide-mobile topbar-kbd">⌘K</kbd>
    </button>

    <button
      type="button"
      class="icon-btn hide-mobile"
      :title="tr('新手教程', 'Tutorial')"
      :aria-label="tr('新手教程', 'Tutorial')"
      @click="uiStore.openModal('tutorial')"
    >
      <CircleHelp />
    </button>

    <button
      type="button"
      class="icon-btn"
      :title="uiStore.dark ? tr('切换到浅色', 'Switch to light') : tr('切换到深色', 'Switch to dark')"
      :aria-label="uiStore.dark ? tr('切换到浅色', 'Switch to light') : tr('切换到深色', 'Switch to dark')"
      @click="uiStore.toggleDark()"
    >
      <Sun v-if="uiStore.dark" />
      <Moon v-else />
    </button>

    <button
      type="button"
      class="icon-btn hide-mobile"
      :title="uiStore.lang === 'zh' ? 'Switch to English' : '切换到中文'"
      :aria-label="uiStore.lang === 'zh' ? 'Switch to English' : '切换到中文'"
      @click="onToggleLang"
    >
      <Languages />
    </button>

    <!-- Guest badge -->
    <button
      v-if="!authStore.isLoggedIn"
      type="button"
      class="btn sm topbar-guest"
      :title="tr('只读演示模式：登录后可创建并云端同步', 'Read-only demo: sign in to create and sync')"
      @click="uiStore.openModal('auth')"
    >
      <Eye /> <span class="hide-mobile">{{ tr('只读演示 · 登录', 'Read-only · Sign in') }}</span>
      <span class="show-mobile">{{ tr('登录', 'Sign in') }}</span>
    </button>

    <template v-else>
      <NotificationDropdown />

      <button
        v-if="authStore.isAdmin"
        type="button"
        class="btn sm topbar-admin"
        :title="tr('管理员后台控制台', 'Admin Console')"
        @click="uiStore.openModal('adminConsole')"
      >
        <ShieldCheck /> <span class="hide-mobile">{{ tr('管理后台', 'Admin') }}</span>
      </button>

      <button
        v-if="authStore.user"
        type="button"
        class="btn sm ghost hide-mobile"
        style="padding-left: 6px"
        :title="tr('查看个人创作者主页', 'View Creator Profile')"
        @click="uiStore.openCreatorProfile(authStore.user.id)"
      >
        <Avatar :avatar="authStore.user.avatar" :name="authStore.displayName" :size="22" />
        {{ authStore.displayName }}
      </button>
    </template>

    <SyncIndicator />
  </header>
</template>

<script setup lang="ts">
import { ArrowLeft, CircleHelp, Eye, Languages, Moon, Search, ShieldCheck, Sun, Undo2 } from 'lucide-vue-next';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from '../../composables/useI18n';
import { useToast } from '../../composables/useToast';
import { useAuthStore } from '../../stores/auth';
import { useDocStore } from '../../stores/doc';
import { useUIStore } from '../../stores/ui';
import Avatar from '../base/Avatar.vue';
import NotificationDropdown from './NotificationDropdown.vue';
import SyncIndicator from './SyncIndicator.vue';

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
.topbar-kbd {
  font-size: 10px;
  color: var(--mu);
  border: 1px solid var(--li);
  border-radius: 5px;
  padding: 0 4px;
  line-height: 1.4;
  background: var(--soft);
}
.topbar-guest {
  background: var(--wns);
  color: var(--wn);
  border-color: color-mix(in srgb, var(--wn) 35%, transparent);
  font-weight: 600;
}
.topbar-guest:hover { color: var(--wn); border-color: var(--wn); }
.topbar-admin {
  background: var(--acs);
  color: var(--ac);
  border-color: color-mix(in srgb, var(--ac) 40%, transparent);
  font-weight: 600;
}
/* The sidebar already shows the brand on desktop; only repeat it on small screens. */
.show-mobile-inline { display: none; }
.show-mobile { display: none !important; }

@media (max-width: 900px) {
  .hide-mobile { display: none !important; }
  .show-mobile { display: inline !important; }
  .show-mobile-inline { display: inline; }
}
</style>
