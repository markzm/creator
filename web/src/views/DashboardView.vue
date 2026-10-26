<template>
  <div class="page-container" style="max-width: 1080px; margin: 0 auto; padding: 24px 20px">
    <!-- Guest / Offline Mode Locked Gate -->
    <div
      v-if="!authStore.isLoggedIn"
      class="card"
      style="padding: 44px 24px; text-align: center; max-width: 680px; margin: 40px auto; border: 2px dashed var(--ac); background: var(--card)"
    >
      <div style="font-size: 44px; margin-bottom: 12px">🔒</div>
      <h2 style="font-size: 22px; font-weight: 800; margin-bottom: 10px">
        {{ tr('离线体验版 · 创作看板已锁定', 'Offline Mode · Studio Dashboard Locked') }}
      </h2>
      <p style="color: var(--mu); font-size: 14px; line-height: 1.6; margin-bottom: 22px; max-width: 520px; margin-left: auto; margin-right: auto">
        {{ tr('您当前处于未登录的离线体验版本。离线版本仅提供基础设定构思与官方AI范例查阅。创作看板提供全方位的个人字数追踪、角色完成度图谱、创作连续打卡与全站生态数据，仅面向登录创作者开放。', 'You are currently in offline guest mode. The dashboard tracks personal word count, character completion, and community analytics, which require an account.') }}
      </p>
      <div style="display: flex; gap: 12px; justify-content: center; flex-wrap: wrap">
        <button type="button" class="btn primary" style="padding: 10px 24px; font-size: 15px; font-weight: 700" @click="uiStore.openModal('auth')">
          ☁️ {{ tr('立即登录 / 注册 开启专属看板', 'Sign In / Register') }}
        </button>
        <button type="button" class="btn" style="padding: 10px 20px; font-size: 14px" @click="router.push('/char')">
          ✍️ {{ tr('前往基础设定器构思', 'Open Character Studio') }}
        </button>
      </div>
    </div>

    <!-- Logged in: Dashboard Content -->
    <template v-else>
      <!-- View Switcher Tabs -->
      <div style="display: flex; gap: 8px; margin-bottom: 18px; border-bottom: 1px solid var(--li2); padding-bottom: 12px">
        <button
          type="button"
          class="tab-btn"
          :class="{ active: currentTab === 'personal' }"
          @click="currentTab = 'personal'"
        >
          👤 {{ tr('个人创作大盘', 'Personal Studio') }}
        </button>
        <button
          type="button"
          class="tab-btn"
          :class="{ active: currentTab === 'global' }"
          @click="switchGlobalTab"
        >
          🌐 {{ tr('全站整体大盘', 'Community Overview') }}
        </button>
      </div>

      <!-- ==================== TAB 1: 个人创作大盘 ==================== -->
      <div v-if="currentTab === 'personal'">
        <!-- Top Banner & Metrics -->
        <div class="card" style="padding: 22px 24px; margin-bottom: 20px; background: linear-gradient(135deg, var(--card) 0%, var(--acs) 100%)">
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 16px">
            <div>
              <h1 style="margin: 0; font-size: 22px; font-weight: 800">
                ✨ {{ tr('设定创作器 v6 · 个人创作大盘', 'Worldbuilding Studio v6 · Personal Dashboard') }}
                <span style="font-size: 14px; font-weight: 600; color: var(--ac); margin-left: 8px">@{{ authStore.displayName }}</span>
              </h1>
              <p class="hint" style="margin: 6px 0 0">
                {{ tr('专属个人工作室 · 自由接入 AI 引擎 · 设定维基双向链接 · 沉浸式小说写作', 'Personal Studio · AI Powered · Wiki Backlinks · Immersive Story Studio') }}
              </p>
            </div>
            <div style="display: flex; gap: 8px; flex-wrap: wrap">
              <button class="btn sm" @click="uiStore.openModal('aiConfig')">
                🤖 {{ tr('定制设定器 & AI', 'AI & Studio') }}
              </button>
              <button class="btn sm" @click="uiStore.openModal('commandPalette')">
                🔍 {{ tr('全局搜索 (⌘K)', 'Search (⌘K)') }}
              </button>
              <button class="btn sm" @click="uiStore.openModal('backup')">
                💾 {{ tr('备份 / 导出', 'Backup / Export') }}
              </button>
              <button class="btn sm primary" @click="uiStore.openModal('tutorial')">
                📖 {{ tr('新手引导', 'Tutorial') }}
              </button>
            </div>
          </div>

        <!-- Studio Preference & AI Indicator Banner -->
        <div
          class="card"
          style="margin-top: 16px; padding: 10px 14px; background: rgba(var(--ac-rgb, 100, 110, 240), 0.08); border-left: 3px solid var(--ac); display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px"
        >
          <div style="font-size: 13px; display: flex; align-items: center; gap: 10px; flex-wrap: wrap">
            <span style="font-weight: 700">🎨 {{ tr('设定器定制模式', 'Custom Studio') }}:</span>
            <span class="pill" style="font-size: 11.5px; padding: 2px 8px; border-radius: 99px; background: var(--card); color: var(--ac); font-weight: 600">
              {{ aiStore.preferences.preferredGenre || tr('通用', 'General') }}
            </span>
            <span class="hint" style="font-size: 12px">
              {{ aiStore.preferences.writingTone || tr('细腻', 'Vivid') }} · {{ aiStore.preferences.defaultPerspective || tr('第三人称', '3rd Person') }}
            </span>
            <span style="border-left: 1px solid var(--li2); height: 14px" />
            <span style="font-size: 12.5px">
              🤖 <strong>{{ aiStore.activeProvider === 'custom' ? tr('个人外部 AI (DeepSeek等)', 'Custom AI API') : tr('公共免费大模型 (OpenRouter)', 'Free OpenRouter AI') }}</strong>
              <span class="hint" style="margin-left: 4px; font-size: 11.5px">
                ({{ aiStore.activeProvider === 'custom' ? aiStore.customAi.model || 'deepseek' : aiStore.selectedFreeModel.split('/')[1] || 'free' }})
              </span>
            </span>
          </div>
          <button class="btn sm" style="font-size: 11.5px; padding: 3px 9px" @click="uiStore.openModal('aiConfig')">
            ⚙️ {{ tr('调整定制', 'Customize') }}
          </button>
        </div>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 12px; margin-top: 16px">
          <div class="card" style="padding: 12px 14px; text-align: center">
            <div style="font-size: 22px; font-weight: 800; color: var(--ac)">{{ formatNum(charCountTotal) }}</div>
            <div class="hint" style="font-size: 12px">{{ tr('总创作用字', 'Total Words') }}</div>
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
          <div class="card" style="padding: 12px 14px; text-align: center">
            <div style="font-size: 22px; font-weight: 800; color: #8a63d2">{{ articleCount }} {{ tr('篇', 'items') }}</div>
            <div class="hint" style="font-size: 12px">{{ tr('文章作品', 'Articles') }}</div>
          </div>
        </div>
      </div>

      <!-- Recently Edited Entities & Articles -->
      <div v-if="recentEntities.length" style="margin-bottom: 24px">
        <h3 style="margin: 0 0 12px; font-size: 15px">⏱️ {{ tr('最近编辑与续写', 'Recently Edited') }}</h3>
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

      <!-- Classic Grid Module Cards -->
      <h3 style="margin: 0 0 12px; font-size: 15px">🧭 {{ tr('创作工作室模块导航', 'Studio Modules') }}</h3>
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

    <!-- ==================== TAB 2: 全站整体大盘 ==================== -->
    <div v-else>
      <div class="card" style="padding: 22px 24px; margin-bottom: 22px; background: linear-gradient(135deg, var(--card) 0%, rgba(99, 102, 241, 0.08) 100%)">
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 16px">
          <div>
            <h1 style="margin: 0; font-size: 22px; font-weight: 800">
              🌐 {{ tr('全站创作生态整体大盘', 'Global Community Dashboard') }}
            </h1>
            <p class="hint" style="margin: 6px 0 0">
              {{ tr('汇聚全网创作者公开分享的世界观设定、组织体系、角色群像与创作文章', 'Aggregated open creations, active authors, and live worldbuilding stats') }}
            </p>
          </div>
          <div style="display: flex; gap: 8px">
            <button class="btn sm" :disabled="loadingGlobal" @click="fetchGlobalStats">
              🔄 {{ tr('刷新统计', 'Refresh') }}
            </button>
            <button class="btn sm primary" @click="router.push('/lobby')">
              🚪 {{ tr('进入公共创作大厅', 'Enter Lobby') }}
            </button>
          </div>
        </div>

        <!-- Global Big Metrics -->
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin-top: 18px">
          <div class="card" style="padding: 14px; text-align: center">
            <div style="font-size: 24px; font-weight: 800; color: var(--ac)">
              {{ globalStats?.totalUsers ?? '—' }}
            </div>
            <div class="hint" style="font-size: 12px">{{ tr('注册创作者数', 'Registered Creators') }}</div>
          </div>
          <div class="card" style="padding: 14px; text-align: center">
            <div style="font-size: 24px; font-weight: 800; color: var(--ok)">
              🟢 {{ globalStats?.onlineUsers ?? '—' }}
            </div>
            <div class="hint" style="font-size: 12px">{{ tr('当前在线创作者', 'Online Creators') }}</div>
          </div>
          <div class="card" style="padding: 14px; text-align: center">
            <div style="font-size: 24px; font-weight: 800; color: #8a63d2">
              {{ globalStats?.totalPublicShares ?? '—' }}
            </div>
            <div class="hint" style="font-size: 12px">{{ tr('全网公开创作数', 'Public Creations') }}</div>
          </div>
          <div class="card" style="padding: 14px; text-align: center">
            <div style="font-size: 24px; font-weight: 800; color: var(--wn)">
              {{ formatNum(globalStats?.totalPublicWords || 0) }}
            </div>
            <div class="hint" style="font-size: 12px">{{ tr('累计公开创作用字', 'Public Word Count') }}</div>
          </div>
        </div>

        <!-- Detailed Breakdown -->
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 10px; margin-top: 12px">
          <div class="card" style="padding: 10px 12px; text-align: center; background: var(--soft)">
            <span style="font-size: 16px">🌍</span>
            <div style="font-size: 16px; font-weight: 700; margin-top: 2px">
              {{ globalStats?.kindCounts?.world || 0 }}
            </div>
            <div class="hint" style="font-size: 11px">{{ tr('公开世界观', 'Worlds') }}</div>
          </div>
          <div class="card" style="padding: 10px 12px; text-align: center; background: var(--soft)">
            <span style="font-size: 16px">🏛️</span>
            <div style="font-size: 16px; font-weight: 700; margin-top: 2px">
              {{ globalStats?.kindCounts?.org || 0 }}
            </div>
            <div class="hint" style="font-size: 11px">{{ tr('组织势力', 'Orgs') }}</div>
          </div>
          <div class="card" style="padding: 10px 12px; text-align: center; background: var(--soft)">
            <span style="font-size: 16px">👤</span>
            <div style="font-size: 16px; font-weight: 700; margin-top: 2px">
              {{ globalStats?.kindCounts?.char || 0 }}
            </div>
            <div class="hint" style="font-size: 11px">{{ tr('角色档案', 'Chars') }}</div>
          </div>
          <div class="card" style="padding: 10px 12px; text-align: center; background: var(--soft)">
            <span style="font-size: 16px">🖋️</span>
            <div style="font-size: 16px; font-weight: 700; margin-top: 2px">
              {{ globalStats?.kindCounts?.article || 0 }}
            </div>
            <div class="hint" style="font-size: 11px">{{ tr('创作文章', 'Articles') }}</div>
          </div>
        </div>
      </div>

      <!-- Leaderboard & Recent Creations Grid -->
      <div class="dashboard-community-grid">
        <!-- Active Creators Column -->
        <div class="card" style="padding: 18px">
          <h3 style="margin: 0 0 12px; font-size: 15px">🌟 {{ tr('活跃创作者榜', 'Top Creators') }}</h3>
          <div v-if="!globalStats?.activeCreators?.length" class="hint">
            {{ tr('暂无活跃创作者', 'No creators yet') }}
          </div>
          <div v-else style="display: flex; flex-direction: column; gap: 10px">
            <div
              v-for="(u, idx) in globalStats.activeCreators"
              :key="u.id"
              style="display: flex; align-items: center; gap: 10px; padding: 6px 0; border-bottom: 1px solid var(--li2)"
            >
              <span
                style="font-size: 12px; font-weight: 700; width: 18px; text-align: center"
                :style="{ color: idx === 0 ? '#f59e0b' : idx === 1 ? '#94a3b8' : idx === 2 ? '#b45309' : 'var(--mu)' }"
              >
                {{ idx + 1 }}
              </span>
              <Avatar :avatar="u.avatar" :name="u.name" :size="30" />
              <div style="min-width: 0; flex: 1">
                <div style="font-weight: 700; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap">
                  {{ u.name || tr('匿名创作者', 'Creator') }}
                </div>
                <div class="hint" style="font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap">
                  {{ u.bio || tr('创作中…', 'Creating…') }}
                </div>
              </div>
              <span
                :style="{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: u.isOnline ? 'var(--ok)' : 'var(--li)',
                  flexShrink: 0
                }"
                :title="u.isOnline ? tr('在线', 'online') : tr('离线', 'offline')"
              />
            </div>
          </div>
        </div>

        <!-- Recent Public Creations Feed -->
        <div class="card" style="padding: 18px">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px">
            <h3 style="margin: 0; font-size: 15px">🆕 {{ tr('最新公开创作动态', 'Latest Public Creations') }}</h3>
            <button class="btn sm" @click="router.push('/lobby')">
              {{ tr('查看更多 →', 'View All →') }}
            </button>
          </div>

          <div v-if="!globalStats?.recentCreations?.length" class="hint">
            {{ tr('大厅还没有公开创作，去个人主页或各模块分享吧！', 'No public creations yet.') }}
          </div>
          <div v-else style="display: flex; flex-direction: column; gap: 10px">
            <div
              v-for="c in globalStats.recentCreations"
              :key="c.id"
              class="gl-row"
              style="cursor: pointer"
              @click="openShareDetail(c)"
            >
              <span class="k" style="font-size: 10px; padding: 2px 7px; border-radius: 99px; background: var(--acs); color: var(--ac); font-weight: 700">
                {{ formatKindBadge(c.kind) }}
              </span>
              <strong style="font-size: 13.5px">{{ c.title }}</strong>
              <span style="font-size: 11.5px; color: var(--ac); white-space: nowrap">
                @{{ c.ownerName || tr('创作者', 'Creator') }}
              </span>
              <span class="gl-note">{{ c.summary || '' }}</span>
              <span v-if="c.wordCount" class="pill" style="font-size: 11px; padding: 1px 6px; border-radius: 4px; background: var(--soft)">
                {{ c.wordCount }} {{ tr('字', 'w') }}
              </span>
              <button type="button" class="btn sm" @click.stop="openShareDetail(c)">
                {{ tr('查看', 'View') }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
    </template>

    <!-- View Share Modal for Global Dashboard -->
    <Modal
      :model-value="Boolean(viewingShare)"
      :title="viewingShare ? `${viewingShare.title} — @${viewingShare.ownerName || tr('创作者', 'Creator')}` : ''"
      max-width="680px"
      @update:model-value="(v) => !v && (viewingShare = null)"
    >
      <div
        v-if="viewingShare"
        style="
          max-height: 60vh;
          overflow: auto;
          padding: 16px;
          background: var(--soft);
          border-radius: 10px;
          font: 13.5px/1.8 inherit;
          white-space: pre-wrap;
          color: var(--ink2);
        "
      >
        {{ viewingShare.content }}
      </div>
      <template #footer>
        <button type="button" class="btn primary sm" @click="copyShareContent">
          📋 {{ tr('复制内容', 'Copy Content') }}
        </button>
        <button type="button" class="btn sm" @click="viewingShare = null">
          {{ tr('关闭', 'Close') }}
        </button>
      </template>
    </Modal>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import Avatar from '../components/base/Avatar.vue';
import Modal from '../components/base/Modal.vue';
import { useI18n } from '../composables/useI18n';
import { useToast } from '../composables/useToast';
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

const currentTab = ref<'personal' | 'global'>('personal');
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
const charCountTotal = computed(() => {
  const settingsWords = totalChars(docStore.doc);
  const articlesWords = (myArticles.value || []).reduce((acc, a) => acc + (a.wordCount || (a.content || '').length), 0);
  return settingsWords + articlesWords;
});
const completionAvg = computed(() => avgDone(docStore.doc));
const streak = computed(() => streakDays(docStore.doc));

function formatNum(n: number): string {
  if (n >= 10000) return (n / 10000).toFixed(1) + 'w';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
  return String(n);
}

function formatKindBadge(kind: string): string {
  if (kind === 'article') return tr('文章', 'Article');
  if (kind === 'org') return tr('组织', 'Org');
  if (kind === 'char') return tr('角色', 'Char');
  return tr('世界观', 'World');
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
  (docStore.doc.articles || []).forEach((a) => {
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

const modules = computed(() => [
  {
    path: '/world',
    icon: '🌍',
    title: tr('世界观设定', 'Worlds'),
    badge: `${worldCount.value}`,
    desc: tr('构建法则、地理、力量体系、纪元历史与专属灵感池。', 'Magic systems, geography, eras, and custom inspiration.')
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
    path: '/articles',
    icon: '🖋️',
    title: tr('文章创作工作室', 'Article Studio'),
    badge: `${articleCount.value}`,
    desc: tr('结合世界观与角色的沉浸式写作，支持 AI 扩写、续写与一键生成摘要。', 'AI-assisted story writing, continuation, and synopsis.')
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
    title: tr('公共创作大厅', 'Community Lobby'),
    badge: tr('公开', 'Public'),
    desc: tr('匿名或在线浏览其他创作者的公开设定与精彩小说。', 'Browse public worlds and stories shared by the community.')
  },
  {
    path: '/me',
    icon: '☁️',
    title: tr('个人主页与工作室', 'Profile & Studio'),
    badge: tr('定制', 'Custom'),
    desc: tr('管理个人资料、私有/公开作品库、AI 偏好定制与历史版本。', 'Manage personal creations, private/public works, and AI engine.')
  }
]);
</script>

<style scoped>
.tab-btn {
  padding: 8px 16px;
  font-size: 14px;
  font-weight: 700;
  border-radius: 8px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--ink2);
  cursor: pointer;
  transition: all 0.15s ease;
}
.tab-btn:hover {
  background: var(--soft);
  color: var(--ink);
}
.tab-btn.active {
  background: var(--card);
  color: var(--ac);
  border-color: var(--li2);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}
.dashboard-community-grid {
  display: grid;
  grid-template-columns: 280px 1fr;
  gap: 18px;
  align-items: start;
}
@media (max-width: 768px) {
  .dashboard-community-grid {
    grid-template-columns: 1fr;
    gap: 14px;
  }
}
</style>
