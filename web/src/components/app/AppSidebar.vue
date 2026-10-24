<template>
  <aside class="app-sidebar" :class="{ collapsed: uiStore.sidebarCollapsed }">
    <div
      style="
        padding: 14px 16px;
        border-bottom: 1px solid var(--li);
        display: flex;
        align-items: center;
        gap: 10px;
      "
    >
      <span
        style="
          width: 30px;
          height: 30px;
          border-radius: 9px;
          background: linear-gradient(135deg, var(--ac), #4f46e5);
          color: #fff;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-weight: 800;
          font-size: 15px;
          flex-shrink: 0;
          cursor: pointer;
        "
        @click="router.push('/')"
      >
        设
      </span>
      <span
        v-if="!uiStore.sidebarCollapsed"
        class="brand"
        style="flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis"
        @click="router.push('/')"
      >
        {{ tr('设定创作器 v6', 'Creator Studio v6') }}
      </span>
      <button
        type="button"
        class="btn sm icon ghost"
        :title="tr('折叠侧栏', 'Toggle sidebar')"
        @click="uiStore.sidebarCollapsed = !uiStore.sidebarCollapsed"
      >
        {{ uiStore.sidebarCollapsed ? '»' : '«' }}
      </button>
    </div>

    <nav
      style="
        flex: 1;
        overflow-y: auto;
        padding: 10px 8px;
        display: flex;
        flex-direction: column;
        gap: 3px;
      "
    >
      <RouterLink
        v-for="item in navItems"
        :key="item.to"
        :to="item.to"
        custom
        v-slot="{ navigate, isActive }"
      >
        <button
          type="button"
          class="btn ghost"
          :style="{
            justifyContent: uiStore.sidebarCollapsed ? 'center' : 'flex-start',
            padding: '8px 10px',
            background: isActive ? 'var(--acs)' : 'transparent',
            color: isActive ? 'var(--ac)' : 'var(--ink2)',
            width: '100%'
          }"
          :title="item.label"
          @click="navigate"
        >
          <span style="font-size: 16px">{{ item.icon }}</span>
          <span v-if="!uiStore.sidebarCollapsed" style="flex: 1; text-align: left">
            {{ item.label }}
          </span>
          <span
            v-if="!uiStore.sidebarCollapsed && item.badge !== undefined"
            style="
              font-size: 11px;
              background: var(--li2);
              color: var(--mu);
              padding: 1px 7px;
              border-radius: 99px;
            "
          >
            {{ item.badge }}
          </span>
        </button>
      </RouterLink>
    </nav>
  </aside>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from '../../composables/useI18n';
import { collectAllEvents } from '../../core/timeline';
import { useDocStore } from '../../stores/doc';
import { useUIStore } from '../../stores/ui';

const docStore = useDocStore();
const uiStore = useUIStore();
const router = useRouter();
const { tr } = useI18n();

const navItems = computed(() => [
  { to: '/', icon: '🏠', label: tr('总览', 'Dashboard') },
  {
    to: '/world',
    icon: '🌍',
    label: tr('世界观', 'Worlds'),
    badge: Object.keys(docStore.doc.worlds || {}).length
  },
  {
    to: '/org',
    icon: '🏛️',
    label: tr('组织', 'Orgs'),
    badge: Object.keys(docStore.doc.orgs || {}).length
  },
  {
    to: '/char',
    icon: '👤',
    label: tr('角色', 'Characters'),
    badge: Object.keys(docStore.doc.chars || {}).length
  },
  {
    to: '/timeline',
    icon: '📜',
    label: tr('时间线', 'Timeline'),
    badge: collectAllEvents(docStore.doc).length
  },
  {
    to: '/graph',
    icon: '🕸️',
    label: tr('关系网', 'Graph')
  },
  {
    to: '/templates',
    icon: '🎨',
    label: tr('模板', 'Templates'),
    badge: Object.keys(docStore.doc.templates || {}).length
  },
  {
    to: '/plots',
    icon: '📖',
    label: tr('剧情线', 'Plots'),
    badge: (docStore.doc.plots || []).length
  },
  {
    to: '/scenes',
    icon: '🎬',
    label: tr('场景卡', 'Scenes'),
    badge: (docStore.doc.scenes || []).length
  },
  {
    to: '/glossary',
    icon: '📚',
    label: tr('术语表', 'Glossary'),
    badge: (docStore.doc.glossary || []).length
  },
  {
    to: '/stats',
    icon: '📊',
    label: tr('写作看板', 'Stats')
  },
  {
    to: '/me',
    icon: '🪪',
    label: tr('个人主页', 'My Profile')
  },
  {
    to: '/lobby',
    icon: '🌐',
    label: tr('创作大厅', 'Lobby')
  }
]);
</script>
