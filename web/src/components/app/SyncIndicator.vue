<template>
  <button
    type="button"
    class="btn sm"
    :title="tooltipText"
    @click="onClick"
  >
    <span
      :style="{
        width: '8px',
        height: '8px',
        borderRadius: '50%',
        background: dotColor,
        display: 'inline-block'
      }"
    />
    <span>{{ statusLabel }}</span>
  </button>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from '../../composables/useI18n';
import { useAuthStore } from '../../stores/auth';
import { useSyncStore } from '../../stores/sync';
import { useUIStore } from '../../stores/ui';

const authStore = useAuthStore();
const syncStore = useSyncStore();
const uiStore = useUIStore();
const router = useRouter();
const { tr } = useI18n();

const dotColor = computed(() => {
  if (!authStore.isLoggedIn) return 'var(--mu2)';
  if (syncStore.status === 'synced') return 'var(--ok)';
  if (syncStore.status === 'conflict') return 'var(--dg)';
  if (syncStore.status === 'dirty' || syncStore.status === 'syncing') return 'var(--wn)';
  return 'var(--mu2)';
});

const statusLabel = computed(() => {
  if (!authStore.isLoggedIn) return tr('☁️ 登录', '☁️ Sign in');
  if (syncStore.status === 'conflict') return tr('⚠️ 同步冲突', '⚠️ Conflict');
  if (syncStore.status === 'syncing') return tr('同步中…', 'Syncing…');
  if (syncStore.status === 'dirty') return tr('待同步', 'Pending');
  return authStore.displayName;
});

const tooltipText = computed(() => {
  if (!authStore.isLoggedIn) return tr('点击登录或注册云端账号', 'Sign in for cloud sync');
  if (syncStore.status === 'conflict') return tr('点击处理多端同步冲突', 'Resolve sync conflict');
  if (syncStore.lastSyncedAt) {
    return (
      tr('上次同步：', 'Last synced: ') +
      new Date(syncStore.lastSyncedAt).toTimeString().slice(0, 5)
    );
  }
  return tr('已连接云端同步', 'Cloud sync connected');
});

function onClick() {
  if (!authStore.isLoggedIn) {
    uiStore.openModal('auth');
    return;
  }
  if (syncStore.status === 'conflict') {
    uiStore.openModal('conflict');
    return;
  }
  router.push('/me');
}
</script>
