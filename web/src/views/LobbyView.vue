<template>
  <div class="wrap" style="max-width: 860px">
    <!-- Anonymous Guest Locked Gate -->
    <div
      v-if="!authStore.isLoggedIn"
      class="card"
      style="
        padding: 44px 24px;
        text-align: center;
        max-width: 680px;
        margin: 40px auto;
        border: 2px dashed var(--ac);
        background: var(--card);
      "
    >
      <div style="font-size: 44px; margin-bottom: 12px">🔒</div>
      <h2 style="font-size: 22px; font-weight: 800; margin-bottom: 10px">
        {{ tr('离线体验版 · 创作大厅已锁定', 'Offline Mode · Lobby Locked') }}
      </h2>
      <p style="color: var(--mu); font-size: 14px; line-height: 1.6; margin-bottom: 22px; max-width: 520px; margin-left: auto; margin-right: auto">
        {{ tr('您当前处于未登录的离线体验版本。在大厅中您可以浏览海量公开设定、查看活跃创作者主页与精华设定、参与共创企划并留言互动。请登录或注册后进入。', 'You are currently in offline guest mode. Sign in or register to browse community lore, author profiles, and join co-creation projects.') }}
      </p>
      <div style="display: flex; gap: 12px; justify-content: center; flex-wrap: wrap">
        <button type="button" class="btn primary" style="padding: 10px 24px; font-size: 15px; font-weight: 700" @click="uiStore.openModal('auth')">
          ☁️ {{ tr('立即登录 / 注册 进入大厅', 'Sign In / Register') }}
        </button>
        <button type="button" class="btn" style="padding: 10px 20px; font-size: 14px" @click="router.push('/char')">
          ✍️ {{ tr('前往基础设定器构思', 'Open Character Studio') }}
        </button>
      </div>
    </div>

    <!-- Logged-in: Creator Lobby View -->
    <template v-else>
      <!-- Header & Controls -->
      <div class="row" style="margin: 0 0 14px; align-items: center; gap: 10px; flex-wrap: wrap">
        <div>
          <h2 style="margin: 0; font-size: 20px">🌐 {{ tr('公共创作大厅', 'Community Creator Lobby') }}</h2>
          <p class="hint" style="margin: 3px 0 0; font-size: 12px">
            {{ tr('探索创作者们公开的世界构筑与小说篇章，支持一键导入灵感与社区共创', 'Explore worlds and stories shared by creators, with one-click import') }}
          </p>
        </div>
        <span class="spacer" />
        <div style="display: flex; gap: 8px">
          <button type="button" class="btn sm" :disabled="loadingShares || loadingUsers" @click="refreshLobby">
            🔄 {{ tr('刷新大厅', 'Refresh') }}
          </button>
          <button
            type="button"
            class="btn sm primary"
            @click="router.push('/me')"
          >
            📤 {{ tr('管理我的分享', 'My Studio') }}
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

      <p v-if="loadingUsers && !users.length" class="hint" style="display: block">
        {{ tr('正在探测在线创作者…', 'Loading creators…') }}
      </p>
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
            {{ cat.icon }} {{ cat.label }}
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

      <p v-if="loadingShares && !shares.length" class="hint" style="display: block; padding: 20px 0; text-align: center">
        {{ tr('正在载入全站公开创作…', 'Loading creations…') }}
      </p>
      <p v-else-if="!filteredShares.length" class="hint" style="display: block; padding: 20px 0; text-align: center">
        {{ tr('该分类下暂无公开作品，快来发布第一篇吧！', 'No creations in this category yet.') }}
      </p>
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
          <div style="display: flex; flex-direction: column; align-items: center; min-width: 44px; text-align: center">
            <span style="font-size: 22px">{{ getKindIcon(s.kind) }}</span>
            <span class="pill" style="font-size: 10px; padding: 1px 6px; border-radius: 99px; background: var(--acs); color: var(--ac); font-weight: 700; margin-top: 2px">
              {{ kindBadge(s.kind) }}
            </span>
          </div>

          <!-- Main Info -->
          <div style="min-width: 0; flex: 1">
            <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap">
              <span v-if="s.canonStatus === 'canon'" class="pill" style="font-size: 10px; padding: 1px 5px; border-radius: 99px; background: #e0e7ff; color: #4338ca; font-weight: 700">
                ⭐ 官方正典
              </span>
              <span v-else-if="s.canonStatus === 'doujin'" class="pill" style="font-size: 10px; padding: 1px 5px; border-radius: 99px; background: #fdf2f8; color: #be185d; font-weight: 700">
                🎨 同人衍生
              </span>
              <strong style="font-size: 15px; cursor: pointer" @click="openShare(s)">
                {{ s.title }}
              </strong>
              <span style="font-size: 12px; color: var(--ac); font-weight: 600">
                @{{ s.ownerName || tr('创作者', 'Creator') }}
              </span>
              <span v-if="s.wordCount" class="pill" style="font-size: 11px; padding: 1px 6px; border-radius: 4px; background: var(--soft)">
                {{ s.wordCount }} {{ tr('字', 'w') }}
              </span>
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
              📖 {{ s.kind === 'article' ? tr('阅读全文', 'Read') : tr('查阅设定', 'View') }}
            </button>
            <button
              v-if="authStore.user && s.userId === authStore.user.id"
              type="button"
              class="btn sm icon danger"
              :title="tr('删除我的这条分享', 'Delete')"
              @click="onDeleteShare(s.id)"
            >
              ✕
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
            <span class="pill" style="font-size: 11px; padding: 2px 8px; border-radius: 99px; background: var(--acs); color: var(--ac); font-weight: 700">
              {{ kindBadge(viewingShare.kind) }}
            </span>
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
          style="padding: 10px 14px; background: rgba(var(--ac-rgb, 100, 110, 240), 0.08); border-radius: 6px; font-size: 13px; color: var(--ink2)"
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
            font: 14px/1.85 inherit;
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
        <!-- Doujin author canon application -->
        <button
          v-if="viewingShare?.canonStatus === 'doujin' && authStore.user && viewingShare?.userId === authStore.user.id"
          type="button"
          class="btn sm"
          style="color: var(--ac); font-weight: 700"
          :disabled="viewingShare.canonRequested"
          @click="handleRequestCanon(viewingShare)"
        >
          📜 {{ viewingShare.canonRequested ? '已提交官方正典申请' : '申请转为官方正典' }}
        </button>
        <!-- Project owner / admin canon promotion -->
        <button
          v-if="viewingShare?.canonStatus === 'doujin' && (authStore.isAdmin || viewingShare.cocreationId)"
          type="button"
          class="btn sm primary"
          @click="handleApproveCanon(viewingShare)"
        >
          🌟 接纳并转为官方正典
        </button>
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
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import Avatar from '../components/base/Avatar.vue';
import Modal from '../components/base/Modal.vue';
import DiscussionSection from '../components/app/DiscussionSection.vue';
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

const categories = computed(() => [
  { kind: 'all', label: tr('全部作品', 'All Works'), icon: '✨' },
  { kind: 'world', label: tr('世界观', 'Worlds'), icon: '🌍' },
  { kind: 'org', label: tr('组织势力', 'Orgs'), icon: '🏛️' },
  { kind: 'char', label: tr('角色档案', 'Chars'), icon: '👤' },
  { kind: 'article', label: tr('文章作品', 'Articles'), icon: '🖋️' }
]);

const onlineCount = computed(() => users.value.filter((u) => u.isOnline).length);

const filteredShares = computed(() => {
  return shares.value.filter((s) => {
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

function getKindIcon(kind: string): string {
  if (kind === 'article') return '🖋️';
  if (kind === 'org') return '🏛️';
  if (kind === 'char') return '👤';
  return '🌍';
}

function kindBadge(kind: string): string {
  if (kind === 'article') return tr('文章', 'Article');
  if (kind === 'org') return tr('组织', 'Org');
  if (kind === 'char') return tr('角色', 'Char');
  return tr('世界观', 'World');
}

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
  try {
    const res = await api.getShareDetail(sh.id);
    if (viewingShare.value && String(viewingShare.value.id) === String(sh.id)) {
      viewingShare.value = res.share;
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

async function handleRequestCanon(sh: any) {
  if (!await confirm('申请转正为官方设定', `确认将同人设定《${sh.title}》向企划团队申请转为官方正典吗？`)) {
    return;
  }
  try {
    await api.requestCanon(sh.id);
    sh.canonRequested = true;
    toast('已提交转正申请，企划团队将收到通知审核！', 'ok');
  } catch (err: any) {
    toast(err?.message || '申请失败', 'err');
  }
}

async function handleApproveCanon(sh: any) {
  if (!await confirm('确认转为官方正典', `确认接纳同人设定《${sh.title}》并正式转为官方正典设定吗？`)) {
    return;
  }
  try {
    await api.approveCanon(sh.id);
    sh.canonStatus = 'canon';
    toast('已成功转为官方正典！作者将收到站内通知 ✓', 'ok');
  } catch (err: any) {
    toast(err?.message || '审批失败', 'err');
  }
}

onMounted(() => {
  // Always load lobby for both anonymous guests and logged in users
  void refreshLobby();
});
</script>

<style scoped>
.filter-pill {
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
