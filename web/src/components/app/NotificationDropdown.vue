<template>
  <div class="notif-wrapper" style="position: relative">
    <button
      type="button"
      class="icon-btn"
      :title="unreadCount ? tr(`${unreadCount} 条未读通知`, `${unreadCount} unread`) : tr('通知中心', 'Notifications')"
      :aria-label="tr('通知', 'Notifications')"
      aria-haspopup="menu"
      :aria-expanded="open"
      @click="toggleDropdown"
    >
      <Bell />
      <span v-if="unreadCount > 0" class="notif-badge">{{ unreadCount > 99 ? '99+' : unreadCount }}</span>
    </button>

    <Transition name="toast">
      <div v-if="open" class="card flat notif-dropdown" role="menu">
        <div class="notif-head">
          <strong>{{ tr('通知', 'Notifications') }}</strong>
          <button v-if="unreadCount > 0" type="button" class="btn sm ghost" @click="markAllRead">
            <CheckCheck /> {{ tr('全部已读', 'Mark all read') }}
          </button>
        </div>

        <div class="notif-list">
          <Skeleton v-if="loading && !notifications.length" variant="row" :count="3" />
          <EmptyState v-else-if="!notifications.length" :icon="BellOff" :description="tr('暂无通知', 'No notifications yet')" />
          <button
            v-for="n in notifications"
            v-else
            :key="n.id"
            type="button"
            class="notif-item"
            :class="{ unread: !n.isRead }"
            role="menuitem"
            @click="openNotification(n)"
          >
            <span class="notif-icon"><component :is="iconFor(n.type)" /></span>
            <span style="min-width: 0; flex: 1">
              <span class="notif-title">{{ n.title }}</span>
              <span class="notif-body">{{ n.content }}</span>
              <span class="notif-time">{{ formatRelative(n.createdAt, uiStore.lang) }}</span>
            </span>
          </button>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { Bell, BellOff, CheckCheck, Handshake, Heart, MessageSquare, ShieldAlert, Sparkles, Stamp } from 'lucide-vue-next';
import { onMounted, onUnmounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from '../../composables/useI18n';
import { formatRelative } from '../../core/format';
import type { NotificationItem } from '../../core/schema/types';
import { api } from '../../data/api';
import { useAuthStore } from '../../stores/auth';
import { useUIStore } from '../../stores/ui';
import EmptyState from '../base/EmptyState.vue';
import Skeleton from '../base/Skeleton.vue';

const authStore = useAuthStore();
const uiStore = useUIStore();
const router = useRouter();
const { tr } = useI18n();

const open = ref(false);
const notifications = ref<NotificationItem[]>([]);
const unreadCount = ref(0);
const loading = ref(false);

let requestEpoch = 0;
let inFlight: Promise<void> | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;

function iconFor(type: string) {
  switch (type) {
    case 'comment_reply':
      return MessageSquare;
    case 'comment_liked':
      return Heart;
    case 'doujin_created':
      return Sparkles;
    case 'canon_requested':
      return Handshake;
    case 'canon_approved':
    case 'canon_rejected':
      return Stamp;
    case 'admin_alert':
      return ShieldAlert;
    default:
      return Bell;
  }
}

function fetchNotifications(full = false): Promise<void> {
  if (!authStore.isLoggedIn || document.hidden) return Promise.resolve();
  if (inFlight) return inFlight;
  const epoch = requestEpoch;
  loading.value = full;
  inFlight = (async () => {
    try {
      const res = full ? await api.getNotifications(30) : await api.getNotificationCount();
      if (epoch !== requestEpoch) return;
      if ('notifications' in res && Array.isArray(res.notifications)) notifications.value = res.notifications;
      unreadCount.value = res.unreadCount || 0;
    } catch {
      // Keep the last count while offline.
    } finally {
      inFlight = null;
      loading.value = false;
    }
  })();
  return inFlight;
}

function toggleDropdown() {
  open.value = !open.value;
  if (open.value) void (async () => { await inFlight; if (open.value) await fetchNotifications(true); })();
}

async function markAllRead() {
  try {
    requestEpoch++;
    await api.markNotificationsRead();
    unreadCount.value = 0;
    notifications.value.forEach((n) => (n.isRead = true));
  } catch {
    // ignore
  }
}

async function openNotification(n: NotificationItem) {
  if (!n.isRead) {
    requestEpoch++;
    n.isRead = true;
    unreadCount.value = Math.max(0, unreadCount.value - 1);
    api.markNotificationRead(n.id).catch(() => {
      // ignore
    });
  }
  open.value = false;
  if (n.targetKind === 'share' && n.targetId) {
    if (n.type === 'canon_requested' || n.type === 'doujin_created') {
      uiStore.openCocreationManage(null);
    } else {
      await router.push({ path: '/lobby', query: { share: n.targetId } });
    }
  }
}

function handleClickOutside(e: MouseEvent) {
  const target = e.target as HTMLElement;
  if (!target.closest('.notif-wrapper')) open.value = false;
}

function handleVisibility() {
  if (!document.hidden) void fetchNotifications();
}

watch(() => authStore.isLoggedIn, (loggedIn) => {
  requestEpoch++;
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
  if (loggedIn) {
    void (async () => { await inFlight; await fetchNotifications(); })();
    pollTimer = setInterval(fetchNotifications, 30000);
  } else {
    open.value = false;
    notifications.value = [];
    unreadCount.value = 0;
  }
}, { immediate: true });

onMounted(() => {
  document.addEventListener('click', handleClickOutside);
  document.addEventListener('visibilitychange', handleVisibility);
});

onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer);
  document.removeEventListener('click', handleClickOutside);
  document.removeEventListener('visibilitychange', handleVisibility);
});
</script>

<style scoped>
.notif-badge {
  position: absolute;
  top: 2px;
  right: 2px;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: var(--r-pill);
  background: var(--dg);
  color: #fff;
  font-size: 10px;
  font-weight: 800;
  line-height: 16px;
  text-align: center;
  border: 2px solid var(--card);
  box-sizing: content-box;
}
.notif-dropdown {
  position: absolute;
  top: 42px;
  right: 0;
  width: min(360px, calc(100vw - 24px));
  max-height: 460px;
  display: flex;
  flex-direction: column;
  z-index: var(--z-dropdown);
  box-shadow: var(--el-3);
  padding: 0;
  overflow: hidden;
}
.notif-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px 10px 14px;
  border-bottom: 1px solid var(--li2);
  background: var(--soft);
  font-size: var(--fs-13);
}
.notif-list { flex: 1; overflow-y: auto; padding: 6px; display: flex; flex-direction: column; gap: 4px; }
.notif-item {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 8px 10px;
  border-radius: 10px;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  width: 100%;
}
.notif-item:hover { background: var(--li2); }
.notif-item.unread { background: var(--acs); }
.notif-icon {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background: var(--card);
  border: 1px solid var(--li);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: var(--ac);
}
.notif-icon svg { width: 14px; height: 14px; }
.notif-title { display: block; font-weight: 700; font-size: var(--fs-12); color: var(--ink); }
.notif-body { display: block; font-size: var(--fs-12); color: var(--ink2); line-height: 1.4; word-break: break-word; }
.notif-time { display: block; font-size: 10.5px; color: var(--mu2); margin-top: 2px; }
</style>
