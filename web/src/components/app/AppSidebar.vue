<template>
  <aside class="app-sidebar" :class="{ collapsed }" aria-label="主导航">
    <div class="sb-head">
      <button type="button" class="sb-logo" :aria-label="tr('回到总览', 'Dashboard')" @click="router.push('/')">
        <Sparkles />
      </button>
      <span v-if="!collapsed" class="sb-brand" @click="router.push('/')">
        {{ tr('设定创作器', 'Worldbuilding Studio') }}
      </span>
      <button
        type="button"
        class="icon-btn sb-toggle"
        :aria-label="collapsed ? tr('展开侧栏', 'Expand sidebar') : tr('折叠侧栏', 'Collapse sidebar')"
        :title="collapsed ? tr('展开侧栏', 'Expand') : tr('折叠侧栏', 'Collapse')"
        @click="uiStore.sidebarCollapsed = !uiStore.sidebarCollapsed"
      >
        <PanelLeftClose v-if="!collapsed" />
        <PanelLeftOpen v-else />
      </button>
    </div>

    <nav class="sb-nav">
      <template v-for="group in groups" :key="group.label">
        <div v-if="!collapsed" class="sb-group">{{ group.label }}</div>
        <div v-else class="sb-group-rule" />
        <RouterLink v-for="item in group.items" :key="item.to" :to="item.to" custom v-slot="{ navigate, isActive, isExactActive }">
          <button
            type="button"
            class="sb-item"
            :class="{ active: item.to === '/' ? isExactActive : isActive }"
            :title="collapsed ? item.label : undefined"
            :aria-current="(item.to === '/' ? isExactActive : isActive) ? 'page' : undefined"
            @click="navigate"
          >
            <span class="sb-icon" :style="{ '--k': item.color }"><component :is="item.icon" /></span>
            <span v-if="!collapsed" class="sb-label">{{ item.label }}</span>
            <span v-if="!collapsed && item.badge !== undefined && item.badge !== ''" class="sb-badge">{{ item.badge }}</span>
          </button>
        </RouterLink>
      </template>
    </nav>

    <div class="sb-foot">
      <button type="button" class="sb-item" :title="collapsed ? tr('AI 与偏好', 'AI & Studio') : undefined" @click="uiStore.openModal('aiConfig')">
        <span class="sb-icon"><Bot /></span>
        <span v-if="!collapsed" class="sb-label">{{ tr('AI 引擎与偏好', 'AI & Studio') }}</span>
      </button>
      <button type="button" class="sb-item" :title="collapsed ? tr('备份 / 导出', 'Backup') : undefined" @click="uiStore.openModal('backup')">
        <span class="sb-icon"><Save /></span>
        <span v-if="!collapsed" class="sb-label">{{ tr('备份 / 导出', 'Backup / Export') }}</span>
      </button>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { Bot, PanelLeftClose, PanelLeftOpen, Save, Sparkles } from 'lucide-vue-next';
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from '../../composables/useI18n';
import { KIND_META } from '../../core/entityMeta';
import { collectAllEvents } from '../../core/timeline';
import { useDocStore } from '../../stores/doc';
import { useUIStore } from '../../stores/ui';
import { LayoutDashboard } from 'lucide-vue-next';

const docStore = useDocStore();
const uiStore = useUIStore();
const router = useRouter();
const { tr } = useI18n();

const collapsed = computed(() => uiStore.sidebarCollapsed);

const own = <T extends { isReference?: boolean }>(coll: Record<string, T> | T[] | undefined) =>
  Object.values(coll || {}).filter((x) => !x.isReference).length;

const groups = computed(() => [
  {
    label: tr('工作台', 'Workspace'),
    items: [{ to: '/', icon: LayoutDashboard, color: 'var(--ac)', label: tr('总览', 'Dashboard'), badge: '' as string | number }]
  },
  {
    label: tr('设定', 'Lore'),
    items: [
      { to: '/world', icon: KIND_META.world.icon, color: KIND_META.world.color, label: tr('世界观', 'Worlds'), badge: own(docStore.doc.worlds) },
      { to: '/org', icon: KIND_META.org.icon, color: KIND_META.org.color, label: tr('组织', 'Orgs'), badge: own(docStore.doc.orgs) },
      { to: '/char', icon: KIND_META.char.icon, color: KIND_META.char.color, label: tr('角色', 'Characters'), badge: own(docStore.doc.chars) },
      { to: '/templates', icon: KIND_META.template.icon, color: KIND_META.template.color, label: tr('模板', 'Templates'), badge: Object.keys(docStore.doc.templates || {}).length },
      { to: '/glossary', icon: KIND_META.glossary.icon, color: KIND_META.glossary.color, label: tr('术语表', 'Glossary'), badge: own(docStore.doc.glossary) }
    ]
  },
  {
    label: tr('叙事', 'Story'),
    items: [
      { to: '/articles', icon: KIND_META.article.icon, color: KIND_META.article.color, label: tr('文章创作', 'Articles'), badge: own(docStore.doc.articles) },
      { to: '/plots', icon: KIND_META.plot.icon, color: KIND_META.plot.color, label: tr('剧情线', 'Plots'), badge: own(docStore.doc.plots) },
      { to: '/scenes', icon: KIND_META.scene.icon, color: KIND_META.scene.color, label: tr('场景卡', 'Scenes'), badge: own(docStore.doc.scenes) },
      { to: '/timeline', icon: KIND_META.timeline.icon, color: KIND_META.timeline.color, label: tr('时间线', 'Timeline'), badge: collectAllEvents(docStore.doc).length },
      { to: '/graph', icon: KIND_META.graph.icon, color: KIND_META.graph.color, label: tr('关系网', 'Graph'), badge: '' }
    ]
  },
  {
    label: tr('社区', 'Community'),
    items: [
      { to: '/lobby', icon: KIND_META.lobby.icon, color: KIND_META.lobby.color, label: tr('创作大厅', 'Lobby'), badge: '' },
      { to: '/stats', icon: KIND_META.stats.icon, color: KIND_META.stats.color, label: tr('写作看板', 'Stats'), badge: '' },
      { to: '/me', icon: KIND_META.me.icon, color: KIND_META.me.color, label: tr('个人主页', 'My Profile'), badge: '' }
    ]
  }
]);
</script>

<style scoped>
.sb-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 12px 12px 14px;
  border-bottom: 1px solid var(--li);
  min-height: 60px;
}
.collapsed .sb-head {
  flex-direction: column;
  gap: 8px;
  padding: 12px 8px;
}
.sb-logo {
  width: 32px;
  height: 32px;
  border-radius: 10px;
  border: 0;
  background: linear-gradient(135deg, var(--ac), var(--ac2));
  color: #fff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  box-shadow: 0 4px 12px rgba(var(--ac-rgb), 0.35);
}
.sb-logo svg { width: 17px; height: 17px; }
.sb-brand {
  flex: 1;
  font-weight: 800;
  font-size: var(--fs-14);
  letter-spacing: -0.01em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
  background: linear-gradient(120deg, var(--ac), #ec4899);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}
.sb-toggle { width: 30px; height: 30px; flex-shrink: 0; }
.sb-toggle svg { width: 16px; height: 16px; }

.sb-nav {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  scrollbar-width: thin;
}
.sb-group {
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--mu2);
  padding: 12px 10px 4px;
}
.sb-group-rule {
  height: 1px;
  background: var(--li2);
  margin: 8px 10px;
}
.sb-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 7px 10px;
  border-radius: 10px;
  border: 0;
  background: transparent;
  color: var(--ink2);
  font-size: var(--fs-13);
  font-weight: 600;
  cursor: pointer;
  text-align: left;
  position: relative;
  transition: background var(--dur-2) var(--e), color var(--dur-2) var(--e);
}
.collapsed .sb-item { justify-content: center; padding: 8px 0; }
.sb-item:hover { background: var(--li2); color: var(--ink); }
.sb-item.active { background: var(--acs); color: var(--ac); }
.sb-item.active::before {
  content: "";
  position: absolute;
  left: -8px;
  top: 7px;
  bottom: 7px;
  width: 3px;
  border-radius: 3px;
  background: var(--ac);
}
.collapsed .sb-item.active::before { left: -6px; }
.sb-icon {
  width: 22px;
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--mu);
  flex-shrink: 0;
}
.sb-icon svg { width: 17px; height: 17px; }
.sb-item:hover .sb-icon { color: var(--k, var(--ink)); }
.sb-item.active .sb-icon { color: var(--k, var(--ac)); }
.sb-label {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.sb-badge {
  font-size: 10.5px;
  font-weight: 700;
  color: var(--mu);
  background: var(--li2);
  padding: 1px 7px;
  border-radius: var(--r-pill);
  font-variant-numeric: tabular-nums;
}
.sb-item.active .sb-badge { background: color-mix(in srgb, var(--ac) 16%, transparent); color: var(--ac); }
.sb-foot {
  padding: 8px;
  border-top: 1px solid var(--li);
  display: flex;
  flex-direction: column;
  gap: 2px;
}
</style>
