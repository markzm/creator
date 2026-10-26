<template>
  <div class="page narrow" style="max-width: 880px">
      <!-- Header & Controls -->
      <PageHeader
        :title="tr('公共创作大厅', 'Community lobby')"
        :subtitle="tr('探索创作者们公开的世界构筑与小说篇章，一键导入灵感或参与共创。', 'Worlds and stories shared by creators — import for inspiration or co-create.')"
        :icon="Users"
      >
        <template #actions>
          <button type="button" class="btn sm" :disabled="loadingShares || loadingUsers" @click="refreshLobby">
            <RefreshCw :class="{ spin: loadingShares || loadingUsers }" /> {{ tr('刷新', 'Refresh') }}
          </button>
          <button v-if="authStore.isLoggedIn" type="button" class="btn sm" @click="uiStore.openCocreationManage(null)">
            <Handshake /> {{ tr('我的企划', 'My projects') }}
          </button>
          <button v-if="authStore.isLoggedIn" type="button" class="btn sm primary" @click="router.push('/me')">
            <Upload /> {{ tr('管理我的分享', 'My shares') }}
          </button>
          <button v-else type="button" class="btn sm primary" @click="uiStore.openModal('auth')">
            <LogIn /> {{ tr('登录后参与', 'Sign in to join') }}
          </button>
        </template>
      </PageHeader>

      <!-- Co-creation projects -->
      <div v-if="projects.length" class="card open flat" style="padding: 16px; margin-bottom: 16px">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; gap: 8px; flex-wrap: wrap">
          <h3 class="section-title" style="margin: 0"><Handshake /> {{ tr('共创企划', 'Co-creation projects') }} <span class="count">{{ projects.length }}</span></h3>
          <button v-if="selectedProject" type="button" class="btn sm ghost" @click="selectedProject = null"><X /> {{ tr('取消筛选', 'Clear filter') }}</button>
        </div>
        <div class="project-row">
          <button
            v-for="p in projects"
            :key="p.id"
            type="button"
            class="project-card"
            :class="{ active: selectedProject === p.id }"
            @click="selectedProject = selectedProject === p.id ? null : p.id"
          >
            <span class="project-title"><Globe2 /> {{ p.worldTitle }}</span>
            <span class="hint project-summary">{{ p.summary || tr('欢迎为这个世界创作同人设定', 'Open for doujin lore') }}</span>
            <span class="project-meta">
              <span>@{{ p.ownerName }}</span>
              <span class="pill sm" :class="p.isOpenDoujin ? 'ok' : ''">{{ p.isOpenDoujin ? tr('开放投稿', 'Open') : tr('暂停投稿', 'Closed') }}</span>
              <span class="pill sm outline">{{ (p.members || []).length }} {{ tr('成员', 'members') }}</span>
            </span>
          </button>
        </div>
        <div v-if="selectedProjectObj" style="display: flex; gap: 8px; align-items: center; margin-top: 10px; flex-wrap: wrap">
          <span class="hint" style="margin: 0">{{ tr('正在查看企划：', 'Viewing project: ') }}<strong>{{ selectedProjectObj.worldTitle }}</strong></span>
          <span class="spacer" />
          <button v-if="authStore.isLoggedIn && selectedProjectObj.isOpenDoujin" type="button" class="btn sm primary" @click="submitModalOpen = true">
            <Sparkles /> {{ tr('为此企划投稿同人', 'Submit doujin to this project') }}
          </button>
        </div>
      </div>

    <!-- Active Creators Row -->
    <div class="card open" style="padding: 16px; margin-bottom: 16px">
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px">
        <h3 style="margin: 0; font-size: 14.5px">
          ✨ {{ tr('活跃创作者', 'Active Creators') }} ({{ users.length }})
        </h3>
        <span class="hint" style="font-size: 11.5px">
          {{ onlineCount }} {{ tr('位创作者正在构筑中', 'online') }}
        </span>
      </div>

      <Skeleton v-if="loadingUsers && !users.length" variant="row" :count="2" />
      <p v-else-if="!users.length" class="hint" style="display: block">
        {{ tr('还没有创作者留下足迹，成为第一个吧！', 'No creators yet — be the first!') }}
      </p>
      <div
        v-else
        style="
          display: flex;
          gap: 10px;
          overflow-x: auto;
          padding-bottom: 4px;
        "
      >
        <div
          v-for="u in users"
          :key="u.id"
          class="card interactive-user-card"
          style="
            flex-shrink: 0;
            padding: 8px 12px;
            display: flex;
            align-items: center;
            gap: 8px;
            min-width: 140px;
            background: var(--soft);
            border-radius: 8px;
            cursor: pointer;
            transition: all 0.2s;
          "
          title="点击查看创作者主页与精华设定"
          @click="uiStore.openCreatorProfile(u.id)"
        >
          <div style="position: relative">
            <Avatar :avatar="u.avatar" :name="u.name" :size="32" />
            <span
              :style="{
                position: 'absolute',
                right: '-1px',
                bottom: '-1px',
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: u.isOnline ? 'var(--ok)' : 'var(--li)',
                border: '1.5px solid var(--card)'
              }"
              :title="u.isOnline ? tr('在线', 'online') : tr('离线', 'offline')"
            />
          </div>
          <div style="min-width: 0; flex: 1">
            <div style="font-weight: 700; font-size: 12.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap">
              {{ u.name || tr('创作者', 'Creator') }}
            </div>
            <div class="hint" style="font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap">
              {{ u.focus || u.bio || (u.isOnline ? tr('构想世界中', 'worldbuilding') : relTime(u.lastSeen)) }}
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Category Filters & Search -->
    <div class="card open" style="padding: 16px; margin-bottom: 16px">
      <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px">
        <!-- Kind Filter Tabs -->
        <div style="display: flex; gap: 6px; flex-wrap: wrap">
          <button
            v-for="cat in categories"
            :key="cat.kind"
            type="button"
            class="filter-pill"
            :class="{ active: selectedKind === cat.kind }"
            @click="setCategory(cat.kind)"
          >
            <component :is="cat.icon" style="width: 13px; height: 13px" /> {{ cat.label }}
          </button>
        </div>

        <!-- Search Input -->
        <div style="display: flex; gap: 6px; flex: 1; max-width: 320px; min-width: 160px">
          <input
            v-model="searchQuery"
            type="text"
            :placeholder="tr('搜索标题、作者或摘要…', 'Search shares…')"
            style="padding: 5px 10px; font-size: 12.5px; flex: 1"
            @keyup.enter="refreshLobby"
          />
          <button type="button" class="btn sm" @click="refreshLobby">
            🔍
          </button>
        </div>
      </div>
    </div>

    <!-- Shared Creations Feed -->
    <div class="card open" style="padding: 18px">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px">
        <h3 style="margin: 0; font-size: 15px">
          📚 {{ tr('作品展示列表', 'Public Creations') }} ({{ filteredShares.length }})
        </h3>
        <span class="hint" style="font-size: 11.5px">
          {{ tr('点击「查看」可在线阅读正文并一键导入', 'Click View to read and import') }}
        </span>
      </div>

      <Skeleton v-if="loadingShares && !shares.length" variant="card" :count="3" />
      <EmptyState
        v-else-if="!filteredShares.length"
        :icon="Share2"
        :title="tr('这里还很安静', 'Quiet here')"
        :description="tr('该分类下暂无公开作品，发布第一篇吧！', 'No creations in this category yet — be the first.')"
      >
        <button type="button" class="btn primary sm" @click="router.push('/me')"><Upload /> {{ tr('去分享', 'Share something') }}</button>
      </EmptyState>
      <div v-else style="display: flex; flex-direction: column; gap: 10px">
        <div
          v-for="s in filteredShares"
          :key="s.id"
          class="card lobby-card"
          style="
            padding: 14px 16px;
            display: flex;
            align-items: center;
            gap: 12px;
            background: var(--card);
            border: 1px solid var(--li2);
            border-radius: 8px;
            transition: border-color 0.15s, box-shadow 0.15s;
          "
        >
          <!-- Kind Icon / Badge -->
          <div class="lobby-kind" :style="{ color: kindMeta(s.kind).color, background: kindMeta(s.kind).soft }">
            <component :is="kindMeta(s.kind).icon" />
          </div>

          <!-- Main Info -->
          <div style="min-width: 0; flex: 1">
            <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap">
              <span class="pill sm" :class="kindMeta(s.kind).pill">{{ kindLabel(s.kind, uiStore.lang) }}</span>
              <span v-if="s.cocreationId && s.canonStatus === 'canon'" class="pill sm accent"><Star /> {{ tr('官方正典', 'Canon') }}</span>
              <span v-else-if="s.canonStatus === 'doujin'" class="pill sm warn"><Palette /> {{ tr('同人衍生', 'Doujin') }}</span>
              <strong style="font-size: 15px; cursor: pointer" @click="openShare(s)">
                {{ s.title }}
              </strong>
              <span style="font-size: 12px; color: var(--ac); font-weight: 600">
                @{{ s.ownerName || tr('创作者', 'Creator') }}
              </span>
              <span v-if="s.wordCount" class="pill sm outline">{{ s.wordCount }} {{ tr('字', 'w') }}</span>
              <span class="hint" style="font-size: 11px">
                {{ relTime(s.createdAt) }}
              </span>
            </div>
            <div
              v-if="s.summary"
              class="hint"
              style="margin-top: 4px; font-size: 12.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--ink2)"
            >
              {{ s.summary }}
            </div>
          </div>

          <!-- Action Buttons -->
          <div class="lobby-card-actions" style="display: flex; gap: 6px; align-items: center; flex-shrink: 0">
            <button type="button" class="btn sm primary" @click="openShare(s)">
              <BookOpen /> {{ s.kind === 'article' ? tr('阅读全文', 'Read') : tr('查阅设定', 'View') }}
            </button>
            <button
              v-if="authStore.user && s.userId === authStore.user.id"
              type="button"
              class="btn sm icon danger"
              :title="tr('删除我的这条分享', 'Delete')"
              :aria-label="tr('删除', 'Delete')"
              @click="onDeleteShare(s.id)"
            >
              <Trash2 />
            </button>
          </div>
        </div>

        <div v-if="hasMoreShares" style="text-align: center; margin-top: 14px">
          <button
            type="button"
            class="btn sm"
            :disabled="loadingShares"
            @click="loadMoreShares"
          >
            {{ loadingShares ? tr('加载中…', 'Loading…') : tr('加载更多作品', 'Load More') }}
          </button>
        </div>
      </div>
    </div>

    <!-- View & Read Share Modal -->
    <Modal
      :model-value="Boolean(viewingShare)"
      :title="viewingShare ? `${viewingShare.title} — @${viewingShare.ownerName || tr('创作者', 'Creator')}` : ''"
      max-width="740px"
      @update:model-value="(v) => !v && (viewingShare = null)"
    >
      <div v-if="viewingShare" style="display: flex; flex-direction: column; gap: 12px">
        <!-- Header Info in Modal -->
        <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; padding-bottom: 8px; border-bottom: 1px solid var(--li2)">
          <div style="display: flex; align-items: center; gap: 8px">
            <span class="pill" :class="kindMeta(viewingShare.kind).pill">{{ kindLabel(viewingShare.kind, uiStore.lang) }}</span>
            <span v-if="viewingShare.wordCount" style="font-size: 12px; color: var(--mu)">
              {{ viewingShare.wordCount }} {{ tr('字', 'words') }}
            </span>
          </div>
          <span class="hint" style="font-size: 11.5px">
            {{ tr('发布于 ', 'Published: ') + new Date(viewingShare.createdAt > 1e11 ? viewingShare.createdAt : viewingShare.createdAt * 1000).toLocaleString() }}
          </span>
        </div>

        <div
          v-if="viewingShare.summary"
          style="padding: 10px 14px; background: var(--acs); border-radius: 8px; font-size: 13px; color: var(--ink2)"
        >
          <strong>{{ tr('作品提要 / 设定纲要：', 'Synopsis / Summary:') }}</strong> {{ viewingShare.summary }}
        </div>

        <!-- Content Area -->
        <div
          style="
            max-height: 55vh;
            overflow: auto;
            padding: 16px 18px;
            background: var(--soft);
            border-radius: 10px;
            font-size: var(--fs-14);
            line-height: var(--lh-loose);
            white-space: pre-wrap;
            color: var(--ink);
          "
        >
          {{ viewingShare.content }}
        </div>

        <hr style="border: 0; border-top: 1px solid var(--li2); margin: 16px 0 10px" />
        <!-- Discussion Group Component -->
        <DiscussionSection :share-id="viewingShare.id" />
      </div>

      <template #footer>
        <!-- Doujin author: request canon (none / rejected -> pending) -->
        <button
          v-if="viewingShare?.canonStatus === 'doujin' && viewingShare.cocreationId && authStore.user && viewingShare.userId === authStore.user.id"
          type="button"
          class="btn sm"
          :disabled="viewingShare.canonReview === 'pending'"
          @click="handleRequestCanon(viewingShare)"
        >
          <Stamp />
          {{
            viewingShare.canonReview === 'pending'
              ? tr('转正审核中', 'Review pending')
              : viewingShare.canonReview === 'rejected'
                ? tr('再次申请转正', 'Request again')
                : tr('申请转为官方正典', 'Request canon')
          }}
        </button>
        <!-- Project members / site admins review -->
        <template v-if="viewingShare?.canonStatus === 'doujin' && viewingShare.cocreationId && canReviewViewing">
          <button type="button" class="btn sm" @click="handleReviewCanon(viewingShare, false)"><X /> {{ tr('退回', 'Reject') }}</button>
          <button type="button" class="btn sm primary" @click="handleReviewCanon(viewingShare, true)"><Check /> {{ tr('接纳为官方正典', 'Canonise') }}</button>
        </template>
        <button
          v-if="viewingShare?.kind === 'article'"
          type="button"
          class="btn sm"
          @click="importAsMyArticle"
        >
          📥 {{ tr('导入为我的文章', 'Import as My Article') }}
        </button>
        <button
          v-else-if="viewingShare?.draftCode"
          type="button"
          class="btn sm"
          @click="importShareDraftCode"
        >
          📥 {{ tr('导入为新设定', 'Import Draft Code') }}
        </button>
        <button type="button" class="btn primary sm" @click="copyShareContent">
          📋 {{ tr('复制正文', 'Copy Content') }}
        </button>
        <button type="button" class="btn sm" @click="viewingShare = null">
          {{ tr('关闭', 'Close') }}
        </button>
      </template>
    </Modal>
    <!-- Submit one of my items to the selected project -->
    <Modal v-model="submitModalOpen" :title="tr('为企划投稿同人', 'Submit doujin')" max-width="560px">
      <p class="hint" style="margin: 0 0 10px">
        {{ tr('选择你的一个设定或文章，以同人身份发布到企划。企划团队审核后可转为官方正典。', 'Pick one of your items to publish as doujin for this project. The project team can canonise it after review.') }}
      </p>
      <EmptyState v-if="!myPublishable.length" :icon="Sparkles" :description="tr('你还没有可投稿的个人设定或文章。', 'You have no personal items to submit yet.')" />
      <div v-else style="display: flex; flex-direction: column; gap: 6px; max-height: 50vh; overflow: auto">
        <button v-for="it in myPublishable" :key="it.kind + it.id" type="button" class="entity-card" :disabled="submitting" @click="submitDoujin(it.kind, it.id)">
          <span class="pill sm" :class="kindMeta(it.kind).pill">{{ kindLabel(it.kind, uiStore.lang) }}</span>
          <span class="ec-main"><span class="ec-name">{{ it.name }}</span></span>
          <Upload style="width: 14px; height: 14px; color: var(--mu)" />
        </button>
      </div>
      <template #footer>
        <button type="button" class="btn sm" @click="submitModalOpen = false">{{ tr('关闭', 'Close') }}</button>
      </template>
    </Modal>
  </div>
</template>

<script setup lang="ts">
import { BookOpen, Check, Globe2, Handshake, LogIn, Palette, RefreshCw, Share2, Sparkles, Stamp, Star, Trash2, Upload, Users, X } from 'lucide-vue-next';
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { usePublish } from '../composables/usePublish';
import type { CocreationProject } from '../core/schema/types';
import DiscussionSection from '../components/app/DiscussionSection.vue';
import Avatar from '../components/base/Avatar.vue';
import EmptyState from '../components/base/EmptyState.vue';
import Modal from '../components/base/Modal.vue';
import PageHeader from '../components/base/PageHeader.vue';
import Skeleton from '../components/base/Skeleton.vue';
import { KIND_META, kindLabel, kindMeta } from '../core/entityMeta';
import { useConfirm } from '../composables/useConfirm';
import { useI18n } from '../composables/useI18n';
import { useToast } from '../composables/useToast';
import { parseCode } from '../core/draftCode';
import { api, type LobbyUser, type WorldShareItem } from '../data/api';
import { useAuthStore } from '../stores/auth';
import { useDocStore } from '../stores/doc';
import { useUIStore } from '../stores/ui';

const authStore = useAuthStore();
const docStore = useDocStore();
const uiStore = useUIStore();
const router = useRouter();
const route = useRoute();
const { publishEntity } = usePublish();
const { t, tr } = useI18n();
const { toast } = useToast();
const { confirm } = useConfirm();

const users = ref<LobbyUser[]>([]);
const shares = ref<WorldShareItem[]>([]);
const loadingUsers = ref(false);
const loadingShares = ref(false);
const hasMoreShares = ref(false);
const viewingShare = ref<WorldShareItem | null>(null);

const selectedKind = ref<'all' | 'world' | 'org' | 'char' | 'article'>('all');
const searchQuery = ref('');

// ---- co-creation ----
const projects = ref<CocreationProject[]>([]);
const selectedProject = ref<string | null>(null);
const selectedProjectObj = computed(() => projects.value.find((p) => p.id === selectedProject.value) || null);
const viewingProject = ref<CocreationProject | null>(null);
const submitModalOpen = ref(false);
const submitting = ref(false);

const canReviewViewing = computed(() => {
  if (!authStore.user) return false;
  if (authStore.isAdmin) return true;
  const proj = viewingProject.value;
  return Boolean(proj && (proj.members || []).some((m) => m.userId === authStore.user!.id));
});

const myPublishable = computed(() => {
  const own = <T extends { id: string; name?: string; title?: string; isReference?: boolean }>(kind: 'world' | 'org' | 'char' | 'article', list: T[]) =>
    list.filter((x) => !x.isReference).map((x) => ({ kind, id: x.id, name: x.name || x.title || '' }));
  return [
    ...own('world', Object.values(docStore.doc.worlds)),
    ...own('org', Object.values(docStore.doc.orgs)),
    ...own('char', Object.values(docStore.doc.chars)),
    ...own('article', docStore.doc.articles || [])
  ].filter((x) => x.name.trim());
});

async function loadProjects() {
  try {
    const res = await api.getCocreationProjects({ limit: 30 });
    projects.value = res.projects || [];
  } catch {
    projects.value = [];
  }
}

async function submitDoujin(kind: 'world' | 'org' | 'char' | 'article', id: string) {
  if (!selectedProject.value) return;
  submitting.value = true;
  try {
    const share = await publishEntity(kind, id, { visibility: 'public', cocreationId: selectedProject.value });
    if (share) {
      submitModalOpen.value = false;
      toast(
        share.canonStatus === 'canon'
          ? tr('已作为官方正典发布到企划 ✓', 'Published as canon ✓')
          : tr('已以同人身份投稿，可在作品详情中申请转正', 'Submitted as doujin — request canon from the detail view'),
        'ok'
      );
      await refreshLobby();
    }
  } finally {
    submitting.value = false;
  }
}

const categories = computed(() => [
  { kind: 'all', label: tr('全部作品', 'All'), icon: Sparkles },
  { kind: 'world', label: tr('世界观', 'Worlds'), icon: KIND_META.world.icon },
  { kind: 'org', label: tr('组织势力', 'Orgs'), icon: KIND_META.org.icon },
  { kind: 'char', label: tr('角色档案', 'Chars'), icon: KIND_META.char.icon },
  { kind: 'article', label: tr('文章作品', 'Articles'), icon: KIND_META.article.icon }
]);

const onlineCount = computed(() => users.value.filter((u) => u.isOnline).length);

const filteredShares = computed(() => {
  return shares.value.filter((s) => {
    if (selectedProject.value && s.cocreationId !== selectedProject.value) return false;
    if (selectedKind.value !== 'all' && s.kind !== selectedKind.value) return false;
    if (searchQuery.value.trim()) {
      const q = searchQuery.value.toLowerCase().trim();
      const matchTitle = (s.title || '').toLowerCase().includes(q);
      const matchAuthor = (s.ownerName || '').toLowerCase().includes(q);
      const matchSum = (s.summary || '').toLowerCase().includes(q);
      if (!matchTitle && !matchAuthor && !matchSum) return false;
    }
    return true;
  });
});

function relTime(ts: number): string {
  if (!ts) return '';
  const ms = ts > 1e11 ? ts : ts * 1000;
  const s = (Date.now() - ms) / 1000;
  if (s < 60) return tr('刚刚', 'just now');
  if (s < 3600) return Math.floor(s / 60) + tr(' 分钟前', 'm ago');
  if (s < 86400) return Math.floor(s / 3600) + tr(' 小时前', 'h ago');
  return Math.floor(s / 86400) + tr(' 天前', 'd ago');
}

function setCategory(kind: string) {
  selectedKind.value = kind as any;
}

async function refreshLobby() {
  loadingUsers.value = true;
  loadingShares.value = true;
  try {
    const [uRes, sRes] = await Promise.all([
      api.getLobbyUsers(),
      api.getShares({ limit: 40 })
    ]);
    users.value = uRes.users || [];
    shares.value = sRes.shares || [];
    hasMoreShares.value = (sRes.shares || []).length >= 40;
  } catch (err: any) {
    toast((tr('加载大厅失败：', 'Lobby load failed: ')) + (err?.message || ''), 'err');
  } finally {
    loadingUsers.value = false;
    loadingShares.value = false;
  }
}

async function openShare(sh: WorldShareItem) {
  // Feed rows are lightweight (no content / draft code); load the full share for the detail modal.
  viewingShare.value = sh;
  viewingProject.value = null;
  try {
    const res = await api.getShareDetail(sh.id);
    if (viewingShare.value && String(viewingShare.value.id) === String(sh.id)) {
      viewingShare.value = res.share;
    }
    if (res.share.cocreationId) {
      const cached = projects.value.find((p) => p.id === res.share.cocreationId);
      viewingProject.value = cached || (await api.getCocreationProject(res.share.cocreationId)).project;
    }
  } catch {
    // keep the summary if the detail request fails
  }
}

async function loadMoreShares() {
  if (!shares.value.length || loadingShares.value) return;
  const last = shares.value[shares.value.length - 1];
  loadingShares.value = true;
  try {
    const res = await api.getShares({ before: last.createdAt, beforeId: String(last.id), limit: 30 });
    const more = res.shares || [];
    const known = new Set(shares.value.map((s) => String(s.id)));
    shares.value.push(...more.filter((s) => !known.has(String(s.id))));
    hasMoreShares.value = more.length >= 30;
  } catch (err: any) {
    toast((tr('加载更多失败：', 'Failed: ')) + (err?.message || ''), 'err');
  } finally {
    loadingShares.value = false;
  }
}

async function onDeleteShare(id: string | number) {
  if (
    !(await confirm(
      t.value.delConfirm,
      tr('确定从创作大厅删除这条公开分享？', 'Delete this public share?')
    ))
  ) {
    return;
  }
  try {
    await api.deleteShare(id);
    shares.value = shares.value.filter((s) => s.id !== id);
    toast(tr('已从大厅移除', 'Deleted'), 'ok');
  } catch (err: any) {
    toast((tr('删除失败：', 'Delete failed: ')) + (err?.message || ''), 'err');
  }
}

async function copyShareContent() {
  if (!viewingShare.value) return;
  try {
    await navigator.clipboard.writeText(viewingShare.value.content);
    toast(tr('正文已复制到剪贴板 ✓', 'Content copied ✓'), 'ok');
  } catch {
    toast(tr('复制失败', 'Copy failed'), 'err');
  }
}

function importAsMyArticle() {
  if (!viewingShare.value || viewingShare.value.kind !== 'article') return;
  const art = docStore.createArticle(
    `${viewingShare.value.title} (${tr('来自大厅', 'Imported')})`
  );
  art.content = viewingShare.value.content || '';
  art.summary = viewingShare.value.summary || '';
  art.wordCount = art.content.length;
  art.visibility = 'private'; // imported articles default to personal private
  docStore.touch(true);
  viewingShare.value = null;
  toast(tr('已成功导入到你的文章创作工作室 ✨', 'Imported to articles studio ✨'), 'ok');
  router.push('/articles');
}

function importShareDraftCode() {
  if (!viewingShare.value?.draftCode) return;
  try {
    const parsed = parseCode(viewingShare.value.draftCode);
    if (parsed.kind === 'world') {
      const w = docStore.createWorld();
      w.data = parsed.data;
      docStore.syncEntityName('world', w);
      docStore.touch(true);
      viewingShare.value = null;
      toast(t.value.importOk, 'ok');
      router.push('/world');
    } else if (parsed.kind === 'org') {
      const o = docStore.createOrg();
      o.data = parsed.data;
      docStore.syncEntityName('org', o);
      docStore.touch(true);
      viewingShare.value = null;
      toast(t.value.importOk, 'ok');
      router.push('/org');
    } else {
      const c = docStore.createChar();
      c.data = parsed.data;
      docStore.syncEntityName('char', c);
      docStore.touch(true);
      viewingShare.value = null;
      toast(t.value.importOk, 'ok');
      router.push('/char');
    }
  } catch (err: any) {
    toast(t.value.importFail + (err?.message || ''), 'err');
  }
}

async function handleRequestCanon(sh: WorldShareItem) {
  if (!(await confirm(tr('申请转为官方正典', 'Request canon status'), tr(`确认将同人设定《${sh.title}》提交给企划团队审核？`, `Submit “${sh.title}” to the project team for review?`)))) {
    return;
  }
  try {
    await api.requestCanon(String(sh.id));
    sh.canonRequested = true;
    sh.canonReview = 'pending';
    toast(tr('已提交转正申请，企划团队会收到通知', 'Request sent — the project team has been notified'), 'ok');
  } catch (err: any) {
    toast(err?.message || tr('申请失败', 'Request failed'), 'err');
  }
}

async function handleReviewCanon(sh: WorldShareItem, approve: boolean) {
  const title = approve ? tr('接纳为官方正典', 'Canonise this work') : tr('退回申请', 'Reject this request');
  const body = approve
    ? tr(`确认接纳《${sh.title}》为企划的官方正典设定？`, `Accept “${sh.title}” as canon for this project?`)
    : tr(`确认退回《${sh.title}》的转正申请？作者可修改后再次申请。`, `Reject “${sh.title}”? The author can revise and ask again.`);
  if (!(await confirm(title, body))) return;
  try {
    if (approve) await api.approveCanon(String(sh.id));
    else await api.rejectCanon(String(sh.id));
    sh.canonStatus = approve ? 'canon' : 'doujin';
    sh.canonReview = approve ? 'approved' : 'rejected';
    sh.canonRequested = false;
    toast(approve ? tr('已转为官方正典，作者将收到通知 ✓', 'Canonised — the author has been notified ✓') : tr('已退回', 'Rejected'), 'ok');
  } catch (err: any) {
    toast(err?.message || tr('操作失败', 'Failed'), 'err');
  }
}

onMounted(async () => {
  // The feed and projects are public; interactions require sign-in.
  await Promise.all([refreshLobby(), loadProjects()]);
  const deepLink = typeof route.query.share === 'string' ? route.query.share : '';
  if (deepLink) {
    const found = shares.value.find((s) => String(s.id) === deepLink);
    void openShare(found || ({ id: deepLink, title: '', summary: '', content: '', kind: 'world', visibility: 'public', userId: 0, ownerName: '', createdAt: 0 } as WorldShareItem));
  }
});

watch(
  () => authStore.isLoggedIn,
  (v, was) => {
    if (v && !was) void Promise.all([refreshLobby(), loadProjects()]);
  }
);
</script>

<style scoped>
.spacer { flex: 1; }
.project-row { display: flex; gap: 10px; overflow-x: auto; padding-bottom: 4px; }
.project-card {
  flex: 0 0 240px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px 14px;
  border-radius: 12px;
  border: 1px solid var(--li);
  background: var(--soft);
  text-align: left;
  color: inherit;
  font: inherit;
  cursor: pointer;
  transition: border-color var(--dur-2), background var(--dur-2), transform var(--dur-2);
}
.project-card:hover { border-color: color-mix(in srgb, var(--ac) 45%, var(--li)); transform: translateY(-1px); }
.project-card.active { border-color: var(--ac); background: var(--acs); }
.project-title { display: flex; align-items: center; gap: 6px; font-weight: 700; font-size: var(--fs-13); }
.project-title svg { width: 14px; height: 14px; color: var(--k-world); }
.project-summary { margin: 0; font-size: var(--fs-12); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.project-meta { display: flex; align-items: center; gap: 6px; font-size: var(--fs-11); color: var(--mu); flex-wrap: wrap; }
.lobby-kind {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.lobby-kind svg { width: 20px; height: 20px; }
.spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.filter-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 12px;
  font-size: 12.5px;
  font-weight: 600;
  border-radius: 99px;
  border: 1px solid var(--li2);
  background: var(--card);
  color: var(--ink2);
  cursor: pointer;
  transition: all 0.15s ease;
}
.filter-pill:hover {
  background: var(--soft);
  color: var(--ink);
}
.filter-pill.active {
  background: var(--acs);
  color: var(--ac);
  border-color: var(--ac);
}

@media (max-width: 600px) {
  .lobby-card {
    flex-direction: column !important;
    align-items: flex-start !important;
  }
  .lobby-card-actions {
    width: 100%;
    justify-content: flex-end;
    margin-top: 6px;
  }
}
</style>
