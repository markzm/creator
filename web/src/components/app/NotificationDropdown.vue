<template>
  <div class="notif-wrapper" style="position: relative">
    <button
      type="button"
      class="icon-btn"
      :title="unreadCount ? `${unreadCount} 条未读通知` : '通知中心'"
      style="position: relative; font-size: 16px; padding: 6px 10px; border-radius: 6px; background: transparent; border: 1px solid var(--li)"
      @click="toggleDropdown"
    >
      🔔
      <span
        v-if="unreadCount > 0"
        class="badge"
        style="
          position: absolute;
          top: -4px;
          right: -4px;
          background: #ef4444;
          color: #fff;
          font-size: 10px;
          padding: 1px 5px;
          border-radius: 99px;
          font-weight: 800;
        "
      >
        {{ unreadCount > 99 ? '99+' : unreadCount }}
      </span>
    </button>

    <!-- Dropdown Menu -->
    <div
      v-if="open"
      class="card notif-dropdown"
      style="
        position: absolute;
        top: 38px;
        right: 0;
        width: 320px;
        max-height: 420px;
        display: flex;
        flex-direction: column;
        z-index: 1000;
        box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.2);
        padding: 0;
        overflow: hidden;
      "
    >
      <div style="padding: 10px 14px; border-bottom: 1px solid var(--li2); display: flex; justify-content: space-between; align-items: center; background: var(--soft)">
        <strong style="font-size: 13.5px">🔔 站内通知与企划动态</strong>
        <button
          v-if="unreadCount > 0"
          type="button"
          class="btn sm"
          style="font-size: 11px; padding: 2px 7px"
          @click="markAllRead"
        >
          全部已读
        </button>
      </div>

      <div style="flex: 1; overflow-y: auto; max-height: 340px; padding: 6px">
        <div v-if="loading && !notifications.length" class="hint" style="text-align: center; padding: 20px 0">
          加载通知中…
        </div>
        <div v-else-if="!notifications.length" class="hint" style="text-align: center; padding: 24px 0">
          暂无通知信息
        </div>
        <div v-else style="display: flex; flex-direction: column; gap: 6px">
          <div
            v-for="n in notifications"
            :key="n.id"
            class="notif-item"
            :style="{
              padding: '8px 10px',
              borderRadius: '6px',
              fontSize: '12px',
              background: n.isRead ? 'transparent' : 'var(--acs)',
              borderLeft: n.isRead ? '2px solid transparent' : '2px solid var(--ac)'
            }"
          >
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px">
              <strong style="font-size: 12.5px; color: var(--ink)">
                {{ n.title }}
              </strong>
              <span class="hint" style="font-size: 10.5px">{{ relTime(n.createdAt) }}</span>
            </div>
            <div style="color: var(--ink2); line-height: 1.4; word-break: break-word">
              {{ n.content }}
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import type { NotificationItem } from '../../core/schema/types';
import { api } from '../../data/api';
import { useAuthStore } from '../../stores/auth';

const authStore = useAuthStore();
const open = ref(false);
const notifications = ref<NotificationItem[]>([]);
const unreadCount = ref(0);
const loading = ref(false);

let pollTimer: ReturnType<typeof setInterval> | null = null;

async function fetchNotifications() {
  if (!authStore.isLoggedIn) return;
  try {
    const res = await api.getNotifications(30);
    notifications.value = res.notifications || [];
    unreadCount.value = res.unreadCount || 0;
  } catch {
    // Ignore error
  }
}

function toggleDropdown() {
  open.value = !open.value;
  if (open.value) {
    void fetchNotifications();
  }
}

async function markAllRead() {
  try {
    await api.markNotificationsRead();
    unreadCount.value = 0;
    notifications.value.forEach((n) => {
      n.isRead = true;
    });
  } catch {
    // Ignore error
  }
}

function relTime(ts: number): string {
  if (!ts) return '';
  const now = Math.floor(Date.now() / 1000);
  const diff = now - ts;
  if (diff < 60) return '刚刚';
  if (diff < 3600) return `${Math.floor(diff / 60)}分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}小时前`;
  return `${Math.floor(diff / 86400)}天前`;
}

function handleClickOutside(e: MouseEvent) {
  const target = e.target as HTMLElement;
  if (!target.closest('.notif-wrapper')) {
    open.value = false;
  }
}

onMounted(() => {
  if (authStore.isLoggedIn) {
    void fetchNotifications();
    pollTimer = setInterval(fetchNotifications, 30000);
  }
  document.addEventListener('click', handleClickOutside);
});

onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer);
  document.removeEventListener('click', handleClickOutside);
});
</script>

<style scoped>
.notif-item:hover {
  background: var(--soft) !important;
}
</style>
