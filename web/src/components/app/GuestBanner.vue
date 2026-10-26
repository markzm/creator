<template>
  <aside v-if="!authStore.isLoggedIn && !dismissed" class="guest-banner" role="note">
    <Eye />
    <span>
      <strong>{{ tr('只读演示模式', 'Read-only demo') }}</strong>
      · {{ tr('您可以浏览官方范例与公共大厅；登录后即可创建设定、使用 AI 并跨设备云同步。', 'Browse the official examples and the lobby; sign in to create, use AI and sync across devices.') }}
    </span>
    <span class="spacer" />
    <button type="button" class="btn sm primary" @click="uiStore.openModal('auth')">
      <LogIn /> {{ tr('登录 / 注册', 'Sign in / Register') }}
    </button>
    <button type="button" class="icon-btn" :aria-label="tr('本次会话不再显示', 'Dismiss for this session')" @click="dismiss">
      <X />
    </button>
  </aside>
</template>

<script setup lang="ts">
import { Eye, LogIn, X } from 'lucide-vue-next';
import { ref } from 'vue';
import { useI18n } from '../../composables/useI18n';
import { useAuthStore } from '../../stores/auth';
import { useUIStore } from '../../stores/ui';

const authStore = useAuthStore();
const uiStore = useUIStore();
const { tr } = useI18n();

const KEY = 'cc_guest_banner_dismissed';
const dismissed = ref(typeof sessionStorage !== 'undefined' && sessionStorage.getItem(KEY) === '1');

function dismiss() {
  dismissed.value = true;
  try {
    sessionStorage.setItem(KEY, '1');
  } catch {
    // ignore
  }
}
</script>
