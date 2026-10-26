<template>
  <div class="mobile-nav-container">
    <nav class="mobile-bottom-bar">
      <button
        v-for="item in primaryTabs"
        :key="item.to"
        type="button"
        class="nav-tab"
        :class="{ active: route.path === item.to }"
        @click="router.push(item.to)"
      >
        <span class="tab-icon">{{ item.icon }}</span>
        <span class="tab-label">{{ item.label }}</span>
      </button>

      <!-- More Menu Button -->
      <button
        type="button"
        class="nav-tab"
        :class="{ active: isMoreActive || moreDrawerOpen }"
        @click="moreDrawerOpen = !moreDrawerOpen"
      >
        <span class="tab-icon">☰</span>
        <span class="tab-label">{{ tr('更多', 'More') }}</span>
      </button>
    </nav>

    <!-- More Modules Modal / Sheet -->
    <Modal
      v-model="moreDrawerOpen"
      :title="'🧭 ' + tr('全部创作模块与工具', 'All Modules & Utilities')"
      max-width="480px"
    >
      <div class="more-grid">
        <button
          v-for="mod in secondaryMods"
          :key="mod.to || mod.action"
          type="button"
          class="more-item"
          :class="{ active: mod.to && route.path === mod.to }"
          @click="onSelectMore(mod)"
        >
          <span class="more-icon">{{ mod.icon }}</span>
          <div class="more-meta">
            <strong class="more-title">{{ mod.title }}</strong>
            <span class="more-desc">{{ mod.desc }}</span>
          </div>
        </button>
      </div>

      <template #footer>
        <button type="button" class="btn sm" @click="moreDrawerOpen = false">
          {{ tr('关闭', 'Close') }}
        </button>
      </template>
    </Modal>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import Modal from '../base/Modal.vue';
import { useI18n } from '../../composables/useI18n';
import { useUIStore } from '../../stores/ui';

const route = useRoute();
const router = useRouter();
const uiStore = useUIStore();
const { tr } = useI18n();

const moreDrawerOpen = ref(false);

const primaryTabs = computed(() => [
  { to: '/', icon: '🏠', label: tr('总览', 'Home') },
  { to: '/world', icon: '🌍', label: tr('世界', 'World') },
  { to: '/org', icon: '🏛️', label: tr('组织', 'Org') },
  { to: '/char', icon: '👤', label: tr('角色', 'Char') },
  { to: '/articles', icon: '🖋️', label: tr('文章', 'Write') }
]);

const secondaryMods = computed(() => [
  {
    to: '/timeline',
    icon: '📜',
    title: tr('编年时间线', 'Timeline'),
    desc: tr('大事件与年龄推算', 'Events & ages')
  },
  {
    to: '/graph',
    icon: '🕸️',
    title: tr('三层关系网', 'Relationship Graph'),
    desc: tr('人物组织力导图', 'Network SVG')
  },
  {
    to: '/templates',
    icon: '🎨',
    title: tr('角色模板库', 'Templates'),
    desc: tr('跑团/小说字段', 'Field sets')
  },
  {
    to: '/plots',
    icon: '📖',
    title: tr('剧情线大纲', 'Plot Outlines'),
    desc: tr('卷幕章大纲树', 'Outline tree')
  },
  {
    to: '/scenes',
    icon: '🎬',
    title: tr('场景卡片', 'Scenes'),
    desc: tr('戏剧冲突与状态', 'Scene cards')
  },
  {
    to: '/glossary',
    icon: '📚',
    title: tr('术语表与替换', 'Glossary'),
    desc: tr('专有名词扫描', 'Batch replace')
  },
  {
    to: '/stats',
    icon: '📊',
    title: tr('写作看板', 'Writing Stats'),
    desc: tr('14天字数趋势', '14-day stats')
  },
  {
    to: '/lobby',
    icon: '🌐',
    title: tr('公共创作大厅', 'Community Lobby'),
    desc: tr('全网公开作品', 'Shared works')
  },
  {
    to: '/me',
    icon: '🪪',
    title: tr('个人主页与同步', 'My Profile & Sync'),
    desc: tr('账号与版本快照', 'Profile & sync')
  },
  {
    action: 'aiConfig',
    icon: '🤖',
    title: tr('AI 引擎与偏好定制', 'AI Engine & Studio'),
    desc: tr('DeepSeek / OpenRouter', 'Models & prompts')
  },
  {
    action: 'backup',
    icon: '💾',
    title: tr('备份 / 恢复 / 导出', 'Backup & Export'),
    desc: tr('JSON / Markdown', 'Save data')
  },
  {
    action: 'tutorial',
    icon: '📖',
    title: tr('新手操作引导', 'Tutorial Guide'),
    desc: tr('核心流程演示', 'Walkthrough')
  }
]);

const isMoreActive = computed(() => {
  const p = route.path;
  return [
    '/timeline',
    '/graph',
    '/templates',
    '/plots',
    '/scenes',
    '/glossary',
    '/stats',
    '/lobby',
    '/me'
  ].includes(p);
});

function onSelectMore(item: { to?: string; action?: string }) {
  moreDrawerOpen.value = false;
  if (item.to) {
    router.push(item.to);
  } else if (item.action === 'aiConfig') {
    uiStore.openModal('aiConfig');
  } else if (item.action === 'backup') {
    uiStore.openModal('backup');
  } else if (item.action === 'tutorial') {
    uiStore.openModal('tutorial');
  }
}
</script>

<style scoped>
.mobile-nav-container {
  display: none;
}

@media (max-width: 900px) {
  .mobile-nav-container {
    display: block;
  }
  .mobile-bottom-bar {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    z-index: 45;
    height: 56px;
    background: color-mix(in srgb, var(--card) 95%, transparent);
    backdrop-filter: blur(18px);
    border-top: 1px solid var(--li2);
    display: flex;
    align-items: center;
    justify-content: space-around;
    padding: 0 4px;
    box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.05);
  }
  .nav-tab {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    height: 100%;
    background: transparent;
    border: none;
    color: var(--ink2);
    cursor: pointer;
    padding: 4px 0;
    transition: color 0.15s ease;
  }
  .nav-tab.active {
    color: var(--ac);
    font-weight: 700;
  }
  .tab-icon {
    font-size: 18px;
    line-height: 1;
  }
  .tab-label {
    font-size: 10.5px;
    line-height: 1.2;
  }
  .more-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
    gap: 10px;
    max-height: 60vh;
    overflow-y: auto;
    padding: 4px 2px;
  }
  .more-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px;
    border-radius: 8px;
    border: 1px solid var(--li2);
    background: var(--soft);
    text-align: left;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .more-item:hover,
  .more-item.active {
    border-color: var(--ac);
    background: var(--acs);
  }
  .more-icon {
    font-size: 20px;
    flex-shrink: 0;
  }
  .more-meta {
    min-width: 0;
    flex: 1;
  }
  .more-title {
    display: block;
    font-size: 12.5px;
    color: var(--ink);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .more-desc {
    display: block;
    font-size: 10.5px;
    color: var(--mu);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
}
</style>
