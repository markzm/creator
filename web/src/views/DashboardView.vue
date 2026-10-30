<template>
  <div class="page">
    <!-- Guest gate (routing sends guests to /welcome; this is the in-place fallback) -->
    <LockedGate
      v-if="!authStore.isLoggedIn"
      :title="tr('个人创作看板需要登录', 'The dashboard is for signed-in creators')"
      :description="tr('看板汇总你的字数、完成度、连续创作天数与全站生态数据。登录后即可解锁；未登录可先浏览官方范例与公共大厅。', 'Word counts, completion, streaks and community stats live here. Sign in to unlock, or browse the examples and the lobby first.')"
    />

    <template v-else>
      <!-- Hero -->
      <section class="hero">
        <div class="hero-main">
          <Avatar :avatar="authStore.user?.avatar" :name="authStore.displayName" :size="52" />
          <div style="min-width: 0">
            <div v-if="uiStore.skin === 'anime'" class="skin-chapter">{{ tr('主线未完，欢迎归来', 'YOUR NEXT CHAPTER AWAITS') }}</div>
            <div class="page-eyebrow">{{ todayLabel }}</div>
            <h1 class="display hero-title">{{ greeting }}，{{ authStore.displayName }}</h1>
            <p class="hero-sub">
              {{ heroHint }}
            </p>
          </div>
        </div>
        <div class="hero-actions">
          <button v-if="continueTarget" type="button" class="btn primary" @click="openRecent(continueTarget)">
            <PenLine /> {{ tr('继续编辑', 'Continue') }} · {{ continueTarget.name }}
          </button>
          <button v-else type="button" class="btn primary" @click="router.push('/char')">
            <Plus /> {{ tr('创建第一个角色', 'Create your first character') }}
          </button>
          <button type="button" class="btn" @click="uiStore.openModal('commandPalette')">
            <Search /> {{ tr('搜索', 'Search') }} <kbd class="kbd">⌘K</kbd>
          </button>
          <button type="button" class="btn" @click="uiStore.openModal('aiConfig')">
            <Bot /> {{ aiStore.effectiveProvider === 'custom' ? tr('个人 AI', 'Own AI') : tr('公共 AI', 'Public AI') }}
          </button>
        </div>
      </section>

      <SegmentedTabs
        v-model="currentTab"
        :items="[
          { value: 'personal', label: tr('我的创作', 'My studio'), icon: LayoutDashboard },
          { value: 'global', label: tr('全站生态', 'Community'), icon: Globe2 }
        ]"
        style="margin-bottom: 18px"
        @update:model-value="(v) => v === 'global' && switchGlobalTab()"
      />

      <!-- ==================== Personal ==================== -->
      <div v-if="currentTab === 'personal'">
        <div class="stat-grid">
          <StatTile :value="formatNum(charCountTotal)" :label="tr('总创作用字', 'Total words')" :icon="Type" />
          <StatTile :value="completionAvg + '%'" :label="tr('角色平均完成度', 'Avg. completion')" :icon="CircleGauge" tone="ok" />
          <StatTile :value="streak" :label="tr('连续创作天数', 'Day streak')" :icon="Flame" tone="warn" />
          <StatTile :value="`${worldCount} / ${orgCount} / ${charCount}`" :label="tr('世界 / 组织 / 角色', 'Worlds / Orgs / Chars')" :icon="Globe2" tone="world" />
          <StatTile :value="articleCount" :label="tr('文章作品', 'Articles')" :icon="PenLine" tone="article" />
        </div>

        <!-- Recently edited -->
        <section v-if="recentEntities.length" style="margin-top: 24px">
          <h3 class="section-title"><Clock3 /> {{ tr('最近编辑', 'Recently edited') }}</h3>
          <div class="recent-grid">
            <button
              v-for="item in recentEntities"
              :key="item.kind + '_' + item.id"
              type="button"
              class="card flat is-interactive recent-card"
              @click="openRecent(item)"
            >
              <span class="recent-icon" :style="{ color: kindMeta(item.kind).color, background: kindMeta(item.kind).soft }">
                <component :is="kindMeta(item.kind).icon" />
              </span>
              <div style="min-width: 0; flex: 1">
                <div class="recent-name">{{ item.name }}</div>
                <div class="recent-meta">{{ item.typeLabel }} · {{ formatRelative(item.updatedAt, uiStore.lang) }}</div>
              </div>
              <ChevronRight class="recent-chevron" />
            </button>
          </div>
        </section>

        <InspirationShelf :title="uiStore.skin === 'anime' ? '你的下一卷，即将展开' : '写累了，换一个视角'" />

        <!-- Quick access -->
        <section style="margin-top: 24px">
          <h3 class="section-title"><Compass /> {{ tr('创作模块', 'Studio modules') }}</h3>
          <div class="module-grid">
            <button
              v-for="mod in modules"
              :key="mod.path"
              type="button"
              class="card flat is-interactive module-card"
              @click="router.push(mod.path)"
            >
              <span class="module-icon" :style="{ color: mod.color, background: mod.soft }"><component :is="mod.icon" /></span>
              <div style="min-width: 0; flex: 1">
                <div class="module-title">
                  {{ mod.title }}
                  <span v-if="mod.badge" class="pill sm">{{ mod.badge }}</span>
                </div>
                <p class="module-desc">{{ mod.desc }}</p>
              </div>
            </button>
          </div>
        </section>
      </div>

      <!-- ==================== Community ==================== -->
      <div v-else>
        <div class="page-header" style="margin-bottom: 14px">
          <div>
            <h2 class="page-title">{{ tr('全站创作生态', 'Community overview') }}</h2>
            <p class="page-sub">{{ tr('汇聚全网创作者公开分享的世界观、组织、角色与文章。', 'Public worlds, orgs, characters and stories shared by everyone.') }}</p>
          </div>
          <div class="page-actions">
            <button class="btn sm" :disabled="loadingGlobal" @click="fetchGlobalStats"><RefreshCw :class="{ spin: loadingGlobal }" /> {{ tr('刷新', 'Refresh') }}</button>
            <button class="btn sm primary" @click="router.push('/lobby')"><Users /> {{ tr('进入大厅', 'Open lobby') }}</button>
          </div>
        </div>

        <Skeleton v-if="loadingGlobal && !globalStats" variant="card" :count="2" />
        <template v-else>
          <div class="stat-grid">
            <StatTile :value="globalStats?.totalUsers ?? '—'" :label="tr('注册创作者', 'Creators')" :icon="Users" />
            <StatTile :value="globalStats?.onlineUsers ?? '—'" :label="tr('当前在线', 'Online now')" :icon="Radio" tone="ok" />
            <StatTile :value="globalStats?.totalPublicShares ?? '—'" :label="tr('公开创作', 'Public creations')" :icon="Share2" tone="world" />
            <StatTile :value="formatNum(globalStats?.totalPublicWords || 0)" :label="tr('公开创作用字', 'Public words')" :icon="Type" tone="article" />
          </div>
          <div class="kind-row">
            <span v-for="k in ['world', 'org', 'char', 'article']" :key="k" class="pill" :class="kindMeta(k).pill">
              <component :is="kindMeta(k).icon" /> {{ kindLabel(k, uiStore.lang) }} · {{ globalStats?.kindCounts?.[k] || 0 }}
            </span>
          </div>

          <div class="dashboard-community-grid">
            <section class="card flat" style="padding: 18px">
              <h3 class="section-title"><Trophy /> {{ tr('活跃创作者', 'Top creators') }}</h3>
              <EmptyState v-if="!globalStats?.activeCreators?.length" :icon="Users" :description="tr('暂无活跃创作者', 'No creators yet')" />
              <div v-else class="creator-list">
                <button
                  v-for="(u, idx) in globalStats.activeCreators"
                  :key="u.id"
                  type="button"
                  class="creator-row"
                  @click="uiStore.openCreatorProfile(u.id)"
                >
                  <span class="rank" :class="'r' + (idx + 1)">{{ idx + 1 }}</span>
                  <Avatar :avatar="u.avatar" :name="u.name" :size="30" />
                  <div style="min-width: 0; flex: 1">
                    <div class="creator-name">{{ u.name || tr('匿名创作者', 'Creator') }}</div>
                    <div class="creator-bio">{{ u.bio || u.focus || tr('创作中…', 'Creating…') }}</div>
                  </div>
                  <span class="online-dot" :class="{ on: u.isOnline }" :title="u.isOnline ? tr('在线', 'online') : tr('离线', 'offline')" />
                </button>
              </div>
            </section>

            <section class="card flat" style="padding: 18px">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px">
                <h3 class="section-title" style="margin: 0"><Sparkles /> {{ tr('最新公开创作', 'Latest public creations') }}</h3>
                <button class="btn sm ghost" @click="router.push('/lobby')">{{ tr('查看更多', 'View all') }} <ChevronRight /></button>
              </div>
              <EmptyState v-if="!globalStats?.recentCreations?.length" :icon="Share2" :description="tr('大厅还没有公开创作，去个人主页分享你的第一个设定吧！', 'No public creations yet.')" />
              <div v-else class="feed-list">
                <button v-for="c in globalStats.recentCreations" :key="c.id" type="button" class="feed-row" @click="openShareDetail(c)">
                  <span class="pill sm" :class="kindMeta(c.kind).pill">{{ kindLabel(c.kind, uiStore.lang) }}</span>
                  <strong class="feed-title">{{ c.title }}</strong>
                  <span class="feed-author">@{{ c.ownerName || tr('创作者', 'Creator') }}</span>
                  <span class="feed-summary">{{ c.summary || '' }}</span>
                  <span v-if="c.wordCount" class="pill sm outline">{{ c.wordCount }} {{ tr('字', 'w') }}</span>
                </button>
              </div>
            </section>
          </div>
        </template>
      </div>
    </template>

    <!-- Share detail -->
    <Modal
      :model-value="Boolean(viewingShare)"
      :title="viewingShare ? `${viewingShare.title} — @${viewingShare.ownerName || tr('创作者', 'Creator')}` : ''"
      max-width="680px"
      @update:model-value="(v) => !v && (viewingShare = null)"
    >
      <div v-if="viewingShare" class="share-body">
        {{ viewingShare.content || viewingShare.summary }}
      </div>
      <template #footer>
        <button type="button" class="btn primary sm" @click="copyShareContent"><Copy /> {{ tr('复制内容', 'Copy') }}</button>
        <button type="button" class="btn sm" @click="viewingShare = null">{{ tr('关闭', 'Close') }}</button>
      </template>
    </Modal>
  </div>
</template>

<script setup lang="ts">
import {
  Bot,
  ChevronRight,
  CircleGauge,
  Clock3,
  Compass,
  Copy,
  Flame,
  Globe2,
  LayoutDashboard,
  PenLine,
  Plus,
  Radio,
  RefreshCw,
  Search,
  Share2,
  Sparkles,
  Trophy,
  Type,
  Users
} from 'lucide-vue-next';
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import Avatar from '../components/base/Avatar.vue';
import InspirationShelf from '../components/inspiration/InspirationShelf.vue';
import EmptyState from '../components/base/EmptyState.vue';
import LockedGate from '../components/base/LockedGate.vue';
import Modal from '../components/base/Modal.vue';
import SegmentedTabs from '../components/base/SegmentedTabs.vue';
import Skeleton from '../components/base/Skeleton.vue';
import StatTile from '../components/base/StatTile.vue';
import { useI18n } from '../composables/useI18n';
import { useToast } from '../composables/useToast';
import { KIND_META, kindLabel, kindMeta } from '../core/entityMeta';
import { formatRelative } from '../core/format';
import { stripReferenceItems } from '../core/reference';
import { avgDone, streakDays, totalChars } from '../core/stats';
import { collectAllEvents } from '../core/timeline';
import { api, type GlobalDashboardStats, type WorldShareItem } from '../data/api';
import { useAIStore } from '../stores/ai';
import { useAuthStore } from '../stores/auth';
import { useDocStore } from '../stores/doc';
import { useUIStore } from '../stores/ui';

const authStore = useAuthStore();
const docStore = useDocStore();
const uiStore = useUIStore();
const aiStore = useAIStore();
const router = useRouter();
const { tr } = useI18n();
const { toast } = useToast();

const currentTab = ref<string>('personal');

const hour = new Date().getHours();
const greeting = computed(() => {
  if (hour < 5) return tr('夜深了', 'Burning the midnight oil');
  if (hour < 11) return tr('早上好', 'Good morning');
  if (hour < 14) return tr('中午好', 'Good afternoon');
  if (hour < 18) return tr('下午好', 'Good afternoon');
  return tr('晚上好', 'Good evening');
});
const todayLabel = computed(() =>
  new Date().toLocaleDateString(uiStore.lang === 'zh' ? 'zh-CN' : 'en-US', { month: 'long', day: 'numeric', weekday: 'long' })
);
const heroHint = computed(() => {
  if (streak.value >= 3) return tr(`已连续创作 ${streak.value} 天，今天也写一点吧。`, `${streak.value}-day streak — keep it going today.`);
  if (charCount.value === 0) return tr('从一个角色或一个世界开始，设定会自己长出来。', 'Start with one character or one world; the rest grows from there.');
  return tr('设定、组织、角色与文章都在这里汇总。', 'Your worlds, orgs, characters and stories, in one place.');
});
const globalStats = ref<GlobalDashboardStats | null>(null);
const loadingGlobal = ref(false);
const viewingShare = ref<WorldShareItem | null>(null);

const myWorlds = computed(() => Object.values(docStore.doc.worlds || {}).filter((w) => !w.isReference));
const myOrgs = computed(() => Object.values(docStore.doc.orgs || {}).filter((o) => !o.isReference));
const myChars = computed(() => Object.values(docStore.doc.chars || {}).filter((c) => !c.isReference));
const myArticles = computed(() => (docStore.doc.articles || []).filter((a) => !a.isReference));

const worldCount = computed(() => myWorlds.value.length);
const orgCount = computed(() => myOrgs.value.length);
const charCount = computed(() => myChars.value.length);
const articleCount = computed(() => myArticles.value.length);
// Personal metrics must not count the official reference materials.
const ownDoc = computed(() => stripReferenceItems(docStore.doc));
const charCountTotal = computed(() => {
  const settingsWords = totalChars(ownDoc.value);
  const articlesWords = (myArticles.value || []).reduce((acc, a) => acc + (a.wordCount || (a.content || '').length), 0);
  return settingsWords + articlesWords;
});
const completionAvg = computed(() => avgDone(ownDoc.value));
const streak = computed(() => streakDays(docStore.doc));

function formatNum(n: number): string {
  if (n >= 10000) return (n / 10000).toFixed(1) + 'w';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
  return String(n);
}

interface RecentEntry {
  kind: 'world' | 'org' | 'char' | 'article';
  id: string;
  name: string;
  icon: string;
  typeLabel: string;
  updatedAt: number;
}

const recentEntities = computed<RecentEntry[]>(() => {
  const list: RecentEntry[] = [];
  myWorlds.value.forEach((w) => {
    list.push({
      kind: 'world',
      id: w.id,
      name: (w.data && w.data.w_name) || w.name || tr('未命名世界', 'Untitled World'),
      icon: '🌍',
      typeLabel: tr('世界观', 'World'),
      updatedAt: w.updatedAt || 0
    });
  });
  myOrgs.value.forEach((o) => {
    list.push({
      kind: 'org',
      id: o.id,
      name: (o.data && o.data.o_name) || o.name || tr('未命名组织', 'Untitled Org'),
      icon: '🏛️',
      typeLabel: tr('组织', 'Organization'),
      updatedAt: o.updatedAt || 0
    });
  });
  myChars.value.forEach((c) => {
    list.push({
      kind: 'char',
      id: c.id,
      name: (c.data && c.data.name) || c.name || tr('未命名角色', 'Untitled Char'),
      icon: '👤',
      typeLabel: tr('角色', 'Character'),
      updatedAt: c.updatedAt || 0
    });
  });
  myArticles.value.forEach((a) => {
    list.push({
      kind: 'article',
      id: a.id,
      name: a.title || tr('未命名文章', 'Untitled Article'),
      icon: '🖋️',
      typeLabel: tr('文章', 'Article'),
      updatedAt: a.updatedAt || 0
    });
  });
  return list.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 6);
});

const continueTarget = computed(() => recentEntities.value[0] || null);

function openRecent(item: RecentEntry) {
  if (item.kind === 'world') {
    docStore.selectWorld(item.id);
    router.push('/world');
  } else if (item.kind === 'org') {
    docStore.selectOrg(item.id);
    router.push('/org');
  } else if (item.kind === 'char') {
    docStore.selectChar(item.id);
    router.push('/char');
  } else if (item.kind === 'article') {
    docStore.selectArticle(item.id);
    router.push('/articles');
  }
}

async function fetchGlobalStats() {
  loadingGlobal.value = true;
  try {
    globalStats.value = await api.getGlobalStats();
  } catch (err: any) {
    toast(tr('获取全站大盘失败：', 'Failed to fetch global stats: ') + (err?.message || ''), 'err');
  } finally {
    loadingGlobal.value = false;
  }
}

function switchGlobalTab() {
  currentTab.value = 'global';
  if (!globalStats.value) {
    void fetchGlobalStats();
  }
}

async function openShareDetail(item: WorldShareItem) {
  // Feed rows are lightweight (no content); fetch the full share for the detail view.
  viewingShare.value = item;
  try {
    const res = await api.getShareDetail(item.id);
    if (viewingShare.value && String(viewingShare.value.id) === String(item.id)) {
      viewingShare.value = res.share;
    }
  } catch {
    // Keep the summary view if the detail request fails
  }
}

async function copyShareContent() {
  if (!viewingShare.value) return;
  try {
    await navigator.clipboard.writeText(viewingShare.value.content);
    toast(tr('内容已复制到剪贴板 ✓', 'Copied ✓'), 'ok');
  } catch {
    toast(tr('复制失败', 'Copy failed'), 'err');
  }
}

onMounted(() => {
  // Preload global stats quietly
  void api.getGlobalStats().then((res) => {
    globalStats.value = res;
  }).catch(() => {
    // Ignore offline error
  });
});

const modules = computed(() => {
  const m = (kind: keyof typeof KIND_META, title: string, badge: string, desc: string) => ({
    path: KIND_META[kind].route,
    icon: KIND_META[kind].icon,
    color: KIND_META[kind].color,
    soft: KIND_META[kind].soft,
    title,
    badge,
    desc
  });
  return [
    m('world', tr('世界观设定', 'Worlds'), `${worldCount.value}`, tr('法则、地理、力量体系与纪元。', 'Rules, geography, power systems and eras.')),
    m('org', tr('组织与势力', 'Organizations'), `${orgCount.value}`, tr('权力架构、信条与成员名录。', 'Hierarchy, beliefs and members.')),
    m('char', tr('角色档案', 'Characters'), `${charCount.value}`, tr('外貌、性格、能力与人物关系。', 'Looks, personality, powers and ties.')),
    m('article', tr('文章创作', 'Articles'), `${articleCount.value}`, tr('结合设定的沉浸式写作与 AI 续写。', 'Lore-aware writing with AI assistance.')),
    m('timeline', tr('时间线', 'Timeline'), `${collectAllEvents(docStore.doc).length}`, tr('自动汇总全库事件与年龄推算。', 'All events, auto-collected, with age math.')),
    m('graph', tr('关系网', 'Graph'), '', tr('角色、组织、世界三层关系图。', 'Three-layer relationship map.')),
    m('template', tr('角色模板', 'Templates'), `${Object.keys(docStore.doc.templates || {}).length}`, tr('小说、跑团、同人与自定义字段集。', 'Field sets for novels, TTRPG and fan works.')),
    m('plot', tr('剧情线', 'Plots'), `${(docStore.doc.plots || []).filter((p) => !p.isReference).length}`, tr('卷 → 幕 → 章大纲，时间自动汇入。', 'Volume / act / chapter outline synced to the timeline.')),
    m('scene', tr('场景卡', 'Scenes'), `${(docStore.doc.scenes || []).filter((x) => !x.isReference).length}`, tr('每场戏的地点、角色与冲突。', 'Location, cast and conflict per scene.')),
    m('glossary', tr('术语表', 'Glossary'), `${(docStore.doc.glossary || []).filter((g) => !g.isReference).length}`, tr('统一名词写法，全库一键替换。', 'Consistent terms, batch replace.')),
    m('stats', tr('写作看板', 'Stats'), `${streak.value}d`, tr('近 14 天字数与完成度趋势。', '14-day words & completion trend.')),
    m('lobby', tr('创作大厅', 'Lobby'), '', tr('浏览与分享公开设定与故事。', 'Browse and share public lore and stories.'))
  ];
});
</script>

<style scoped>
.hero {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  flex-wrap: wrap;
  padding: 22px 24px;
  border-radius: var(--r-xl);
  border: 1px solid var(--li);
  background:
    radial-gradient(520px 200px at 0% 0%, rgba(var(--ac-rgb), 0.12), transparent 70%),
    radial-gradient(420px 200px at 100% 100%, rgba(236, 72, 153, 0.08), transparent 70%),
    var(--card);
  box-shadow: var(--el-1);
  margin-bottom: 18px;
}
.hero-main { display: flex; align-items: center; gap: 16px; min-width: 0; }
.hero-title { font-size: var(--fs-24); margin: 2px 0 4px; }
.hero-sub { margin: 0; color: var(--mu); font-size: var(--fs-13); }
.hero-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.kbd {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--mu);
  border: 1px solid var(--li);
  border-radius: 5px;
  padding: 0 4px;
  background: var(--soft);
}
.stat-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  gap: 12px;
}
.recent-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 10px;
}
.recent-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  text-align: left;
  color: inherit;
  font: inherit;
}
.recent-icon,
.module-icon {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.recent-icon svg, .module-icon svg { width: 18px; height: 18px; }
.recent-name { font-weight: 700; font-size: var(--fs-13); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.recent-meta { font-size: var(--fs-11); color: var(--mu); margin-top: 2px; }
.recent-chevron { width: 16px; height: 16px; color: var(--mu2); flex-shrink: 0; }
.module-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 12px;
}
.module-card {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 14px 16px;
  text-align: left;
  color: inherit;
  font: inherit;
}
.module-title { font-weight: 700; font-size: var(--fs-14); display: flex; align-items: center; gap: 6px; }
.module-desc { margin: 4px 0 0; font-size: var(--fs-12); color: var(--mu); line-height: 1.5; }
.kind-row { display: flex; gap: 8px; flex-wrap: wrap; margin: 12px 0 18px; }
.dashboard-community-grid {
  display: grid;
  grid-template-columns: 300px 1fr;
  gap: 16px;
  align-items: start;
}
.creator-list { display: flex; flex-direction: column; gap: 4px; }
.creator-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 8px;
  border-radius: 10px;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  width: 100%;
}
.creator-row:hover { background: var(--li2); }
.rank { width: 18px; text-align: center; font-size: var(--fs-12); font-weight: 800; color: var(--mu); font-variant-numeric: tabular-nums; }
.rank.r1 { color: #f59e0b; }
.rank.r2 { color: #94a3b8; }
.rank.r3 { color: #b45309; }
.creator-name { font-weight: 700; font-size: var(--fs-13); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.creator-bio { font-size: var(--fs-11); color: var(--mu); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.online-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--li); flex-shrink: 0; }
.online-dot.on { background: var(--ok); box-shadow: 0 0 0 3px var(--oks); }
.feed-list { display: flex; flex-direction: column; gap: 6px; }
.feed-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 10px;
  border: 1px solid var(--li2);
  background: var(--soft);
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  width: 100%;
  min-width: 0;
  transition: border-color var(--dur-2), background var(--dur-2);
}
.feed-row:hover { border-color: var(--ac); background: var(--acs); }
.feed-title { font-size: var(--fs-13); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.feed-author { font-size: var(--fs-11); color: var(--ac); white-space: nowrap; }
.feed-summary { flex: 1; font-size: var(--fs-12); color: var(--mu); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.share-body {
  max-height: 60vh;
  overflow: auto;
  padding: 16px;
  background: var(--soft);
  border-radius: 10px;
  font-size: var(--fs-13);
  line-height: var(--lh-loose);
  white-space: pre-wrap;
  color: var(--ink2);
}
.spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
@media (max-width: 900px) {
  .dashboard-community-grid { grid-template-columns: 1fr; }
  .hero { padding: 18px; }
  .hero-title { font-size: var(--fs-20); }
}
</style>
