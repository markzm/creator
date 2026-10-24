<template>
  <div class="wrap" style="max-width: 820px">
    <!-- Locked State -->
    <div v-if="!authStore.isLoggedIn" class="card open" style="padding: 40px 24px; text-align: center">
      <p style="font-size: 42px; margin: 0 0 10px">🌐</p>
      <h3 style="margin: 0 0 8px">{{ tr('登录后进入创作大厅', 'Sign in to enter the Creator Lobby') }}</h3>
      <p class="hint" style="display: block; margin-bottom: 18px">
        {{ tr('看看谁在线、正在创作什么世界，浏览或导入其他创作者分享的设定。', 'See who is online, what they are building, and explore shared worlds.') }}
      </p>
      <button type="button" class="btn primary lg" @click="uiStore.openModal('auth')">
        ☁️ {{ tr('立即登录 / 注册', 'Sign In / Register') }}
      </button>
    </div>

    <!-- Main Lobby -->
    <template v-else>
      <div class="row" style="margin: 0 0 14px">
        <h2 style="margin: 0; font-size: 20px">🌐 {{ tr('创作大厅', 'Creator Lobby') }}</h2>
        <span class="spacer" />
        <button type="button" class="btn sm" @click="refreshLobby">
          🔄 {{ tr('刷新大厅', 'Refresh') }}
        </button>
      </div>

      <!-- Online Creators -->
      <div class="card open" style="padding: 18px">
        <h3 style="margin: 0 0 12px; font-size: 15px">
          ✨ {{ tr('在线与活跃创作者', 'Active Creators') }} ({{ users.length }})
        </h3>
        <p v-if="loadingUsers" class="hint" style="display: block">
          {{ tr('加载中…', 'Loading…') }}
        </p>
        <p v-else-if="!users.length" class="hint" style="display: block">
          {{ tr('还没有创作者入驻，成为第一个！', 'No creators yet — be the first!') }}
        </p>
        <div v-else>
          <div v-for="u in users" :key="u.id" class="gl-row">
            <Avatar :avatar="u.avatar" :name="u.name" :size="24" />
            <span
              :style="{
                width: '9px',
                height: '9px',
                borderRadius: '50%',
                background: u.isOnline ? 'var(--ok)' : 'var(--li)',
                flexShrink: 0
              }"
              :title="u.isOnline ? tr('在线', 'online') : tr('离线', 'offline')"
            />
            <strong>{{ u.name || '创作者' }}</strong>
            <span class="gl-note">{{ u.focus || u.bio || '' }}</span>
            <span style="font-size: 11px; color: var(--mu); white-space: nowrap">
              {{ u.isOnline ? tr('在线', 'online') : relTime(u.lastSeen) }}
            </span>
          </div>
        </div>
      </div>

      <!-- Shared Worlds Feed -->
      <div class="card open" style="padding: 18px">
        <h3 style="margin: 0 0 12px; font-size: 15px">
          🌍 {{ tr('全站设定分享流', 'Shared Creations') }} ({{ shares.length }})
        </h3>
        <p v-if="loadingShares && !shares.length" class="hint" style="display: block">
          {{ tr('加载中…', 'Loading…') }}
        </p>
        <p v-else-if="!shares.length" class="hint" style="display: block">
          {{ tr('还没有分享。去「世界观」页点「📤 分享到大厅」吧。', 'Nothing shared yet.') }}
        </p>
        <div v-else>
          <div v-for="s in shares" :key="s.id" class="gl-row">
            <span class="k" style="font-size: 10px; padding: 2px 7px; border-radius: 99px; background: var(--card); color: var(--ac)">
              {{ kindBadge(s.kind) }}
            </span>
            <strong>{{ s.title }}</strong>
            <span style="font-size: 11px; color: var(--ac); white-space: nowrap">
              @{{ s.ownerName || '创作者' }}
            </span>
            <span class="gl-note">{{ s.summary || '' }}</span>
            <button type="button" class="btn sm" @click="viewingShare = s">
              {{ tr('查看', 'View') }}
            </button>
            <button
              v-if="authStore.user && s.userId === authStore.user.id"
              type="button"
              class="btn sm icon danger"
              @click="onDeleteShare(s.id)"
            >
              ✕
            </button>
          </div>

          <div v-if="hasMoreShares" style="text-align: center; margin-top: 12px">
            <button
              type="button"
              class="btn sm"
              :disabled="loadingShares"
              @click="loadMoreShares"
            >
              {{ loadingShares ? tr('加载中…', 'Loading…') : tr('加载更多', 'Load More') }}
            </button>
          </div>
        </div>
      </div>
    </template>

    <!-- View Share Modal -->
    <Modal
      :model-value="Boolean(viewingShare)"
      :title="viewingShare ? `${viewingShare.title} — @${viewingShare.ownerName || '创作者'}` : ''"
      max-width="640px"
      @update:model-value="(v) => !v && (viewingShare = null)"
    >
      <div
        v-if="viewingShare"
        style="
          max-height: 55vh;
          overflow: auto;
          padding: 14px 16px;
          background: var(--soft);
          border-radius: 10px;
          font: 13.5px/1.75 inherit;
          white-space: pre-wrap;
          color: var(--ink2);
        "
      >
        {{ viewingShare.content }}
      </div>
      <template #footer>
        <button
          v-if="viewingShare?.draftCode"
          type="button"
          class="btn sm"
          @click="importShareDraftCode"
        >
          📥 {{ tr('一键导入为新条目', 'Import Draft Code') }}
        </button>
        <button type="button" class="btn primary sm" @click="copyShareContent">
          📋 {{ tr('复制正文', 'Copy') }}
        </button>
        <button type="button" class="btn sm" @click="viewingShare = null">
          {{ tr('关闭', 'Close') }}
        </button>
      </template>
    </Modal>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import Avatar from '../components/base/Avatar.vue';
import Modal from '../components/base/Modal.vue';
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

function kindBadge(kind: string): string {
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

async function refreshLobby() {
  if (!authStore.isLoggedIn) return;
  loadingUsers.value = true;
  loadingShares.value = true;
  try {
    const [uRes, sRes] = await Promise.all([
      api.getLobbyUsers(),
      api.getShares({ limit: 20 })
    ]);
    users.value = uRes.users || [];
    shares.value = sRes.shares || [];
    hasMoreShares.value = (sRes.shares || []).length >= 20;
  } catch (err: any) {
    toast((tr('加载大厅失败：', 'Lobby load failed: ')) + (err?.message || ''), 'err');
  } finally {
    loadingUsers.value = false;
    loadingShares.value = false;
  }
}

async function loadMoreShares() {
  if (!shares.value.length || loadingShares.value) return;
  const lastId = shares.value[shares.value.length - 1].id;
  loadingShares.value = true;
  try {
    const res = await api.getShares({ before: lastId, limit: 20 });
    const more = res.shares || [];
    shares.value.push(...more);
    hasMoreShares.value = more.length >= 20;
  } catch (err: any) {
    toast((tr('加载更多失败：', 'Failed: ')) + (err?.message || ''), 'err');
  } finally {
    loadingShares.value = false;
  }
}

async function onDeleteShare(id: number) {
  if (
    !(await confirm(
      t.value.delConfirm,
      tr('确定删除这条分享？', 'Delete this share?')
    ))
  ) {
    return;
  }
  try {
    await api.deleteShare(id);
    shares.value = shares.value.filter((s) => s.id !== id);
    toast(tr('已删除', 'Deleted'), 'ok');
  } catch (err: any) {
    toast((tr('删除失败：', 'Delete failed: ')) + (err?.message || ''), 'err');
  }
}

async function copyShareContent() {
  if (!viewingShare.value) return;
  try {
    await navigator.clipboard.writeText(viewingShare.value.content);
    toast(t.value.codeCopied, 'ok');
  } catch {
    toast(tr('复制失败', 'Copy failed'), 'err');
  }
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

watch(
  () => authStore.isLoggedIn,
  (logged) => {
    if (logged) void refreshLobby();
  }
);

onMounted(() => {
  if (authStore.isLoggedIn) {
    void refreshLobby();
  }
});
</script>
