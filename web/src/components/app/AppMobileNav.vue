<template>
  <div class="mobile-nav-container">
    <nav class="mobile-bottom-bar" aria-label="移动端导航">
      <button
        v-for="item in primaryTabs"
        :key="item.to"
        type="button"
        class="nav-tab"
        :class="{ active: isActive(item.to) }"
        :aria-current="isActive(item.to) ? 'page' : undefined"
        @click="router.push(item.to)"
      >
        <span class="tab-icon"><component :is="item.icon" /></span>
        <span class="tab-label">{{ item.label }}</span>
      </button>

      <button
        type="button"
        class="nav-tab"
        :class="{ active: isMoreActive || moreDrawerOpen }"
        @click="moreDrawerOpen = !moreDrawerOpen"
      >
        <span class="tab-icon"><LayoutGrid /></span>
        <span class="tab-label">{{ tr('更多', 'More') }}</span>
      </button>
    </nav>

    <Modal v-model="moreDrawerOpen" :title="tr('全部模块与工具', 'All modules & tools')" max-width="520px">
      <div class="more-grid">
        <button
          v-for="mod in secondaryMods"
          :key="mod.to || mod.action"
          type="button"
          class="more-item"
          :class="{ active: mod.to && isActive(mod.to) }"
          @click="onSelectMore(mod)"
        >
          <span class="more-icon" :style="{ color: mod.color, background: mod.soft }"><component :is="mod.icon" /></span>
          <div class="more-meta">
            <strong class="more-title">{{ mod.title }}</strong>
            <span class="more-desc">{{ mod.desc }}</span>
          </div>
        </button>
      </div>
    </Modal>
  </div>
</template>

<script setup lang="ts">
import { Bot, BookOpen, LayoutDashboard, LayoutGrid, Save } from 'lucide-vue-next';
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from '../../composables/useI18n';
import { KIND_META } from '../../core/entityMeta';
import { useAuthStore } from '../../stores/auth';
import { useUIStore } from '../../stores/ui';
import Modal from '../base/Modal.vue';

const route = useRoute();
const router = useRouter();
const uiStore = useUIStore();
const authStore = useAuthStore();
const { tr } = useI18n();

const moreDrawerOpen = ref(false);

function isActive(to: string): boolean {
  if (to === '/') return route.path === '/';
  return route.path === to || route.path.startsWith(to + '/');
}

const primaryTabs = computed(() => [
  { to: '/', icon: LayoutDashboard, label: tr('总览', 'Home') },
  { to: '/world', icon: KIND_META.world.icon, label: tr('世界', 'World') },
  { to: '/org', icon: KIND_META.org.icon, label: tr('组织', 'Org') },
  { to: '/char', icon: KIND_META.char.icon, label: tr('角色', 'Char') },
  { to: '/articles', icon: KIND_META.article.icon, label: tr('文章', 'Write') }
]);

const secondaryMods = computed(() => [
  { to: '/prompts', icon: Bot, color: 'var(--ac)', soft: 'var(--acs)', title: tr('个人提示词库', 'Prompt library'), desc: tr('自由编写与 AI 辅助', 'Write and refine prompts') },
  ...(authStore.isSuperAdmin ? [{ to: '/admin/content', icon: Save, color: 'var(--wn)', soft: 'var(--wns)', title: tr('全站创作管理', 'Manage creations'), desc: tr('管理云端内容', 'Cloud content') }] : []),
  { to: '/timeline', icon: KIND_META.timeline.icon, color: KIND_META.timeline.color, soft: KIND_META.timeline.soft, title: tr('编年时间线', 'Timeline'), desc: tr('大事件与年龄推算', 'Events & ages') },
  { to: '/graph', icon: KIND_META.graph.icon, color: KIND_META.graph.color, soft: KIND_META.graph.soft, title: tr('关系网', 'Relationship Graph'), desc: tr('人物组织力导图', 'Network view') },
  { to: '/templates', icon: KIND_META.template.icon, color: KIND_META.template.color, soft: KIND_META.template.soft, title: tr('角色模板库', 'Templates'), desc: tr('跑团/小说字段', 'Field sets') },
  { to: '/plots', icon: KIND_META.plot.icon, color: KIND_META.plot.color, soft: KIND_META.plot.soft, title: tr('剧情线大纲', 'Plot Outlines'), desc: tr('卷幕章大纲树', 'Outline tree') },
  { to: '/scenes', icon: KIND_META.scene.icon, color: KIND_META.scene.color, soft: KIND_META.scene.soft, title: tr('场景卡片', 'Scenes'), desc: tr('戏剧冲突与状态', 'Scene cards') },
  { to: '/glossary', icon: KIND_META.glossary.icon, color: KIND_META.glossary.color, soft: KIND_META.glossary.soft, title: tr('术语表与替换', 'Glossary'), desc: tr('专有名词扫描', 'Batch replace') },
  { to: '/stats', icon: KIND_META.stats.icon, color: KIND_META.stats.color, soft: KIND_META.stats.soft, title: tr('写作看板', 'Writing Stats'), desc: tr('14 天字数趋势', '14-day stats') },
  { to: '/lobby', icon: KIND_META.lobby.icon, color: KIND_META.lobby.color, soft: KIND_META.lobby.soft, title: tr('公共创作大厅', 'Community Lobby'), desc: tr('全网公开作品', 'Shared works') },
  { to: '/me', icon: KIND_META.me.icon, color: KIND_META.me.color, soft: KIND_META.me.soft, title: tr('个人主页与同步', 'My Profile & Sync'), desc: tr('账号与版本快照', 'Profile & sync') },
  { action: 'aiConfig', icon: Bot, color: 'var(--ac)', soft: 'var(--acs)', title: tr('AI 引擎与偏好', 'AI Engine & Studio'), desc: tr('DeepSeek / OpenRouter', 'Models & prompts') },
  { action: 'backup', icon: Save, color: 'var(--ok)', soft: 'var(--oks)', title: tr('备份 / 恢复 / 导出', 'Backup & Export'), desc: tr('JSON / Markdown', 'Save data') },
  { action: 'tutorial', icon: BookOpen, color: 'var(--wn)', soft: 'var(--wns)', title: tr('新手操作引导', 'Tutorial Guide'), desc: tr('核心流程演示', 'Walkthrough') }
]);

const isMoreActive = computed(() =>
  ['/prompts', '/admin/content', '/timeline', '/graph', '/templates', '/plots', '/scenes', '/glossary', '/stats', '/lobby', '/me'].some((p) => isActive(p))
);

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

.more-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 10px;
  padding: 2px;
}
.more-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px;
  border-radius: 10px;
  border: 1px solid var(--li2);
  background: var(--soft);
  text-align: left;
  cursor: pointer;
  transition: border-color var(--dur-2), background var(--dur-2);
}
.more-item:hover,
.more-item.active {
  border-color: var(--ac);
  background: var(--acs);
}
.more-icon {
  width: 34px;
  height: 34px;
  border-radius: 9px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.more-icon svg { width: 17px; height: 17px; }
.more-meta { min-width: 0; flex: 1; }
.more-title {
  display: block;
  font-size: var(--fs-13);
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

@media (max-width: 900px) {
  .mobile-nav-container {
    display: block;
  }
  .mobile-bottom-bar {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    z-index: var(--z-mobile-nav);
    height: calc(56px + env(safe-area-inset-bottom));
    padding: 0 4px env(safe-area-inset-bottom);
    background: color-mix(in srgb, var(--card) 94%, transparent);
    backdrop-filter: blur(18px);
    border-top: 1px solid var(--li2);
    display: flex;
    align-items: stretch;
    justify-content: space-around;
    box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.05);
  }
  .nav-tab {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 3px;
    background: transparent;
    border: none;
    color: var(--mu);
    cursor: pointer;
    padding: 6px 0;
    transition: color var(--dur-2) ease;
    position: relative;
  }
  .nav-tab.active { color: var(--ac); }
  .nav-tab.active::after {
    content: "";
    position: absolute;
    top: 0;
    width: 22px;
    height: 3px;
    border-radius: 0 0 3px 3px;
    background: var(--ac);
  }
  .tab-icon { display: inline-flex; }
  .tab-icon svg { width: 20px; height: 20px; }
  .tab-label {
    font-size: 10.5px;
    font-weight: 600;
    line-height: 1.2;
  }
}
</style>
