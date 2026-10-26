<template>
  <button type="button" class="btn sm sync-btn" :class="statusClass" :title="tooltipText" @click="onClick">
    <component :is="icon" :class="{ spin: syncStore.status === 'syncing' }" />
    <span>{{ statusLabel }}</span>
  </button>
</template>

<script setup lang="ts">
import { AlertTriangle, Cloud, CloudOff, CloudUpload, RefreshCw } from 'lucide-vue-next';
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

const icon = computed(() => {
  if (!authStore.isLoggedIn) return CloudOff;
  if (syncStore.status === 'conflict') return AlertTriangle;
  if (syncStore.status === 'syncing') return RefreshCw;
  if (syncStore.status === 'dirty') return CloudUpload;
  return Cloud;
});

const statusClass = computed(() => {
  if (!authStore.isLoggedIn) return 'is-offline';
  return 'is-' + syncStore.status;
});

const statusLabel = computed(() => {
  if (!authStore.isLoggedIn) return tr('未同步', 'Not synced');
  if (syncStore.status === 'conflict') return tr('同步冲突', 'Conflict');
  if (syncStore.status === 'syncing') return tr('同步中…', 'Syncing…');
  if (syncStore.status === 'dirty') return tr('待同步', 'Pending');
  if (syncStore.status === 'offline') return tr('离线', 'Offline');
  return tr('已同步', 'Synced');
});

const tooltipText = computed(() => {
  if (!authStore.isLoggedIn) return tr('点击登录或注册云端账号', 'Sign in for cloud sync');
  if (syncStore.status === 'conflict') return tr('点击处理多端同步冲突', 'Resolve sync conflict');
  if (syncStore.lastSyncedAt) {
    return tr('上次同步：', 'Last synced: ') + new Date(syncStore.lastSyncedAt).toLocaleTimeString().slice(0, 5);
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

<style scoped>
.sync-btn svg { width: 14px; height: 14px; }
.sync-btn.is-synced { color: var(--ok); }
.sync-btn.is-dirty,
.sync-btn.is-syncing { color: var(--wn); }
.sync-btn.is-conflict { color: var(--dg); border-color: var(--dg); background: var(--dgs); }
.sync-btn.is-offline { color: var(--mu); }
.spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
</style>
