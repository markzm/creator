<template>
  <div class="page-container" style="max-width: 1080px; margin: 0 auto; padding: 24px 20px">
    <!-- Top Banner & Metrics -->
    <div class="card" style="padding: 22px 24px; margin-bottom: 22px; background: linear-gradient(135deg, var(--card) 0%, var(--acs) 100%)">
      <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 16px">
        <div>
          <h1 style="margin: 0; font-size: 22px; font-weight: 800">
            ✨ {{ tr('设定创作器 v6 · 工作台总览', 'Worldbuilding Studio v6 · Dashboard') }}
          </h1>
          <p class="hint" style="margin: 6px 0 0">
            {{ tr('本地优先 (IndexedDB) · 自动三方合并云同步 · 设定维基双向链接', 'Local-first (IndexedDB) · Auto 3-way merge cloud sync · Wiki backlinks') }}
          </p>
        </div>
        <div style="display: flex; gap: 8px; flex-wrap: wrap">
          <button class="btn sm" @click="uiStore.openModal('commandPalette')">
            🔍 {{ tr('全局搜索 (⌘K)', 'Search (⌘K)') }}
          </button>
          <button class="btn sm" @click="uiStore.openModal('backup')">
            💾 {{ tr('备份 / 恢复 / 导出 MD', 'Backup / Export') }}
          </button>
          <button class="btn sm primary" @click="uiStore.openModal('tutorial')">
            📖 {{ tr('新手引导', 'Tutorial') }}
          </button>
        </div>
      </div>

      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(135px, 1fr)); gap: 12px; margin-top: 18px">
        <div class="card" style="padding: 12px 14px; text-align: center">
          <div style="font-size: 22px; font-weight: 800; color: var(--ac)">{{ formatNum(charCountTotal) }}</div>
          <div class="hint" style="font-size: 12px">{{ tr('总设定字数', 'Total Chars') }}</div>
        </div>
        <div class="card" style="padding: 12px 14px; text-align: center">
          <div style="font-size: 22px; font-weight: 800; color: var(--ok)">{{ completionAvg }}%</div>
          <div class="hint" style="font-size: 12px">{{ tr('角色平均完成度', 'Avg Completion') }}</div>
        </div>
        <div class="card" style="padding: 12px 14px; text-align: center">
          <div style="font-size: 22px; font-weight: 800; color: var(--wn)">🔥 {{ streak }} {{ tr('天', 'd') }}</div>
          <div class="hint" style="font-size: 12px">{{ tr('连续创作天数', 'Day Streak') }}</div>
        </div>
        <div class="card" style="padding: 12px 14px; text-align: center">
          <div style="font-size: 22px; font-weight: 800">{{ worldCount }} / {{ orgCount }} / {{ charCount }}</div>
          <div class="hint" style="font-size: 12px">{{ tr('世界 / 组织 / 角色', 'World / Org / Char') }}</div>
        </div>
      </div>
    </div>

    <!-- Recently Edited Entities -->
    <div v-if="recentEntities.length" style="margin-bottom: 24px">
      <h3 style="margin: 0 0 12px; font-size: 15px">⏱️ {{ tr('最近编辑条目（一键续写）', 'Recently Edited') }}</h3>
      <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 10px">
        <div
          v-for="item in recentEntities"
          :key="item.kind + '_' + item.id"
          class="card"
          style="padding: 12px 14px; cursor: pointer; display: flex; align-items: center; gap: 10px; transition: transform 0.15s"
          @click="openRecent(item)"
        >
          <span style="font-size: 20px">{{ item.icon }}</span>
          <div style="min-width: 0; flex: 1">
            <div style="font-weight: 700; font-size: 13.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis">
              {{ item.name }}
            </div>
            <div class="hint" style="font-size: 11.5px; margin: 2px 0 0">{{ item.typeLabel }}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Classic Nine-Grid Module Cards -->
    <h3 style="margin: 0 0 12px; font-size: 15px">🧭 {{ tr('创作模块导航', 'Modules') }}</h3>
    <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 14px">
      <div
        v-for="mod in modules"
        :key="mod.path"
        class="card"
        style="padding: 18px; cursor: pointer; display: flex; flex-direction: column; gap: 6px"
        @click="router.push(mod.path)"
      >
        <div style="display: flex; justify-content: space-between; align-items: center">
          <span style="font-size: 26px">{{ mod.icon }}</span>
          <span class="pill" style="font-size: 11.5px; padding: 2px 9px; border-radius: 99px; background: var(--acs); color: var(--ac); font-weight: 600">
            {{ mod.badge }}
          </span>
        </div>
        <h4 style="margin: 6px 0 0; font-size: 15.5px">{{ mod.title }}</h4>
        <p class="hint" style="margin: 0; font-size: 12.5px; line-height: 1.5">{{ mod.desc }}</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from '../composables/useI18n';
import { avgDone, streakDays, totalChars } from '../core/stats';
import { collectAllEvents } from '../core/timeline';
import { useDocStore } from '../stores/doc';
import { useUIStore } from '../stores/ui';

const docStore = useDocStore();
const uiStore = useUIStore();
const router = useRouter();
const { tr } = useI18n();

const worldCount = computed(() => Object.keys(docStore.doc.worlds || {}).length);
const orgCount = computed(() => Object.keys(docStore.doc.orgs || {}).length);
const charCount = computed(() => Object.keys(docStore.doc.chars || {}).length);
const charCountTotal = computed(() => totalChars(docStore.doc));
const completionAvg = computed(() => avgDone(docStore.doc));
const streak = computed(() => streakDays(docStore.doc));

function formatNum(n: number): string {
  if (n >= 10000) return (n / 10000).toFixed(1) + 'w';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
  return String(n);
}

interface RecentEntry {
  kind: 'world' | 'org' | 'char';
  id: string;
  name: string;
  icon: string;
  typeLabel: string;
  updatedAt: number;
}

const recentEntities = computed<RecentEntry[]>(() => {
  const list: RecentEntry[] = [];
  Object.values(docStore.doc.worlds || {}).forEach((w) => {
    list.push({
      kind: 'world',
      id: w.id,
      name: (w.data && w.data.w_name) || w.name || tr('未命名世界', 'Untitled World'),
      icon: '🌍',
      typeLabel: tr('世界观', 'World'),
      updatedAt: w.updatedAt || 0
    });
  });
  Object.values(docStore.doc.orgs || {}).forEach((o) => {
    list.push({
      kind: 'org',
      id: o.id,
      name: (o.data && o.data.o_name) || o.name || tr('未命名组织', 'Untitled Org'),
      icon: '🏛️',
      typeLabel: tr('组织', 'Organization'),
      updatedAt: o.updatedAt || 0
    });
  });
  Object.values(docStore.doc.chars || {}).forEach((c) => {
    list.push({
      kind: 'char',
      id: c.id,
      name: (c.data && c.data.name) || c.name || tr('未命名角色', 'Untitled Char'),
      icon: '👤',
      typeLabel: tr('角色', 'Character'),
      updatedAt: c.updatedAt || 0
    });
  });
  return list.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 6);
});

function openRecent(item: RecentEntry) {
  if (item.kind === 'world') {
    docStore.selectWorld(item.id);
    router.push('/world');
  } else if (item.kind === 'org') {
    docStore.selectOrg(item.id);
    router.push('/org');
  } else {
    docStore.selectChar(item.id);
    router.push('/char');
  }
}

const modules = computed(() => [
  {
    path: '/world',
    icon: '🌍',
    title: tr('世界观设定', 'Worlds'),
    badge: `${worldCount.value}`,
    desc: tr('构建法则、地理、力量体系、纪元历史与世界专属灵感池。', 'Magic systems, geography, eras, and custom inspiration.')
  },
  {
    path: '/org',
    icon: '🏛️',
    title: tr('组织与势力', 'Organizations'),
    badge: `${orgCount.value}`,
    desc: tr('规划权力架构、信条仪式、敌友阵营与核心成员名录。', 'Hierarchy, beliefs, rituals, allies, and members.')
  },
  {
    path: '/char',
    icon: '👤',
    title: tr('角色档案', 'Characters'),
    badge: `${charCount.value}`,
    desc: tr('塑造外貌、性格反差、能力代价、人物关系与高清设定卡。', 'Personality, powers, relationships, and PNG cards.')
  },
  {
    path: '/timeline',
    icon: '📜',
    title: tr('编年时间线', 'Timeline'),
    badge: `${collectAllEvents(docStore.doc).length}`,
    desc: tr('自动聚合全库纪元与生平事件，内置角色事件年龄推算器。', 'Auto-collected events and character age calculator.')
  },
  {
    path: '/graph',
    icon: '🕸️',
    title: tr('三层关系网', 'Relationship Graph'),
    badge: tr('可视化', 'SVG'),
    desc: tr('角色人脉、组织归属、世界观绑定三层力导图一屏纵览。', 'Interactive 3-layer SVG network visualization.')
  },
  {
    path: '/templates',
    icon: '🎨',
    title: tr('角色模板库', 'Templates'),
    badge: `${Object.keys(docStore.doc.templates || {}).length}`,
    desc: tr('小说向、跑团向、同人向、约稿向及自定义角色字段模板。', 'Built-in and custom character field templates.')
  },
  {
    path: '/plots',
    icon: '📖',
    title: tr('剧情线大纲', 'Plot Outlines'),
    badge: `${(docStore.doc.plots || []).length} ${tr('卷', 'vols')}`,
    desc: tr('卷 → 幕 → 章三级大纲树，章节时间自动汇入时间线。', 'Volume / Act / Chapter hierarchy synced with timeline.')
  },
  {
    path: '/scenes',
    icon: '🎬',
    title: tr('场景卡片', 'Scene Cards'),
    badge: `${(docStore.doc.scenes || []).length}`,
    desc: tr('管理每场戏的地点、出场角色、戏剧冲突与状态流转。', 'Scene locations, appearing characters, and core conflicts.')
  },
  {
    path: '/glossary',
    icon: '📚',
    title: tr('术语表与全局替换', 'Glossary & Replace'),
    badge: `${(docStore.doc.glossary || []).length}`,
    desc: tr('统一专有名词写法，支持全库一键扫描替换与安全撤销。', 'Standardize terms and batch-replace across all entries.')
  },
  {
    path: '/stats',
    icon: '📊',
    title: tr('写作看板', 'Writing Stats'),
    badge: `${streak.value}d`,
    desc: tr('近 14 天设定字数与角色完成度双轴趋势图。', '14-day character count and completion trend chart.')
  },
  {
    path: '/lobby',
    icon: '🌐',
    title: tr('创作大厅', 'Creator Lobby'),
    badge: tr('云端', 'Cloud'),
    desc: tr('查看在线创作者动态，浏览与分享优秀的世界观与设定集。', 'See online creators and share worldbuilding sheets.')
  },
  {
    path: '/me',
    icon: '☁️',
    title: tr('个人主页与云同步', 'Account & Sync'),
    badge: tr('历史回滚', 'Revisions'),
    desc: tr('管理个人资料、256² 头像、云端多版本历史快照与我的分享。', 'Profile, avatar, cloud revision history, and my shares.')
  }
]);
</script>
