<template>
  <div class="wrap" style="max-width: 880px">
    <!-- Locked State -->
    <div v-if="!authStore.isLoggedIn" class="card open" style="padding: 40px 24px; text-align: center">
      <p style="font-size: 42px; margin: 0 0 10px">🪪</p>
      <h3 style="margin: 0 0 8px">{{ tr('登录开启个人主页、创作大厅与云同步', 'Sign in to access your profile & personal studio') }}</h3>
      <p class="hint" style="display: block; margin-bottom: 18px">
        {{ tr('登录后自动跨设备同步设定与文章，支持私有/共享切换、云端版本回滚、自定义 DeepSeek 等外部 AI 引擎。', 'Sync across devices, manage private/public creations, rollback revisions, and bring your own AI.') }}
      </p>
      <button type="button" class="btn primary lg" @click="uiStore.openModal('auth')">
        ☁️ {{ tr('立即登录 / 注册', 'Sign In / Register') }}
      </button>
    </div>

    <!-- Logged-In Main -->
    <template v-else>
      <!-- Profile Header Card -->
      <div class="card open" style="padding: 22px">
        <div style="display: flex; align-items: center; gap: 16px; flex-wrap: wrap">
          <div style="cursor: pointer" @click="openEditProfile">
            <Avatar
              :avatar="authStore.user?.avatar"
              :name="authStore.displayName"
              :size="64"
            />
          </div>
          <div style="flex: 1; min-width: 180px">
            <div style="display: flex; align-items: center; gap: 8px">
              <h2 style="margin: 0; font-size: 20px">{{ authStore.displayName }}</h2>
              <span class="pill" style="font-size: 11px; padding: 2px 7px; background: var(--acs); color: var(--ac); font-weight: 700">
                {{ tr('创作者', 'Creator') }}
              </span>
            </div>
            <p style="margin: 4px 0 0; font-size: 12.5px; color: var(--mu)">
              {{ joinedText }} · {{ authStore.user?.email }}
            </p>
          </div>
          <div style="display: flex; gap: 8px; flex-wrap: wrap">
            <button type="button" class="btn sm" @click="openEditProfile">
              ✏️ {{ tr('编辑资料 / 头像', 'Edit Profile') }}
            </button>
            <button type="button" class="btn sm" @click="uiStore.openModal('aiConfig')">
              🤖 {{ tr('定制设定器 & AI', 'Studio & AI') }}
            </button>
            <button type="button" class="btn sm danger" @click="onLogout">
              {{ tr('退出登录', 'Sign Out') }}
            </button>
          </div>
        </div>

        <div style="margin-top: 18px; padding-top: 16px; border-top: 1px solid var(--li2)">
          <label style="display: block; font-weight: 600; font-size: 13px; margin-bottom: 6px">
            {{ tr('创作者名片简介（大厅与公共大盘可见，最多 80 字）', 'Bio (visible in lobby and public leaderboard, max 80 chars)') }}
          </label>
          <div style="display: flex; gap: 8px">
            <input
              v-model="bioInput"
              type="text"
              maxlength="80"
              :placeholder="tr('写一句介绍自己的创作方向或代表作…', 'Describe what you are building…')"
              style="flex: 1"
            />
            <button type="button" class="btn sm primary" @click="onSaveBio">
              {{ tr('保存简介', 'Save Bio') }}
            </button>
          </div>
        </div>
      </div>

      <!-- Studio Customization & AI Engine Card -->
      <div class="card open" style="padding: 20px">
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 12px">
          <div>
            <h3 style="margin: 0 0 4px; font-size: 16px">🎨 {{ tr('专属设定器与 AI 引擎定制', 'Studio Customization & AI') }}</h3>
            <p style="margin: 0; font-size: 12.5px; color: var(--mu)">
              {{ tr('为你的创作风格量身定制：智能补全字段、故事扩写、续写及摘要', 'Tailor generation tone, genre, perspective, and external DeepSeek / OpenRouter API') }}
            </p>
          </div>
          <button type="button" class="btn sm primary" @click="uiStore.openModal('aiConfig')">
            ⚙️ {{ tr('配置 AI 引擎与偏好', 'Configure AI & Prefs') }}
          </button>
        </div>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px; background: var(--soft); padding: 12px; border-radius: 8px">
          <div>
            <div class="hint" style="font-size: 11px">{{ tr('偏好创作题材', 'Preferred Genre') }}</div>
            <div style="font-weight: 700; font-size: 13.5px; margin-top: 2px">
              {{ aiStore.preferences.preferredGenre || tr('奇幻架空', 'Fantasy') }}
            </div>
          </div>
          <div>
            <div class="hint" style="font-size: 11px">{{ tr('写作语调风格', 'Writing Tone') }}</div>
            <div style="font-weight: 700; font-size: 13.5px; margin-top: 2px">
              {{ aiStore.preferences.writingTone || tr('细腻生动', 'Vivid') }}
            </div>
          </div>
          <div>
            <div class="hint" style="font-size: 11px">{{ tr('默认叙事视角', 'Perspective') }}</div>
            <div style="font-weight: 700; font-size: 13.5px; margin-top: 2px">
              {{ aiStore.preferences.defaultPerspective || tr('第三人称', '3rd Person') }}
            </div>
          </div>
          <div>
            <div class="hint" style="font-size: 11px">{{ tr('当前 AI 引擎', 'AI Engine') }}</div>
            <div style="font-weight: 700; font-size: 13.5px; margin-top: 2px; color: var(--ac)">
              {{ aiStore.activeProvider === 'custom' ? tr('个人外部 AI (DeepSeek)', 'Custom API') : tr('公共免费大模型 (OpenRouter)', 'Free OpenRouter') }}
            </div>
          </div>
        </div>
      </div>

      <!-- Cloud Sync & Revision History Card -->
      <div class="card open" style="padding: 20px">
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap">
          <div>
            <h3 style="margin: 0 0 4px; font-size: 16px">☁️ {{ tr('云端同步与版本快照', 'Cloud Sync & History') }}</h3>
            <p style="margin: 0; font-size: 12.5px; color: var(--mu)">
              {{ syncStateDesc }} · Rev #{{ syncStore.baseRev }}
            </p>
          </div>
          <div style="display: flex; gap: 8px; flex-wrap: wrap">
            <button
              type="button"
              class="btn sm primary"
              :disabled="syncStore.status === 'syncing'"
              @click="syncStore.push(true)"
            >
              ⬆️ {{ tr('上传同步', 'Push') }}
            </button>
            <button
              type="button"
              class="btn sm"
              :disabled="syncStore.status === 'syncing'"
              @click="syncStore.pull(true)"
            >
              ⬇️ {{ tr('拉取合并', 'Pull') }}
            </button>
            <button
              type="button"
              class="btn sm"
              @click="uiStore.openModal('revisions')"
            >
              🕒 {{ tr('历史版本快照', 'Revisions') }}
            </button>
          </div>
        </div>
      </div>

      <!-- Personal Studio & Creations Library (个人创作大厅) -->
      <div class="card open" style="padding: 20px">
        <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; margin-bottom: 14px">
          <div>
            <h3 style="margin: 0 0 4px; font-size: 16px">
              🏛️ {{ tr('个人创作大厅与作品库', 'Personal Studio & Works') }} ({{ filteredWorks.length }})
            </h3>
            <p class="hint" style="margin: 0; font-size: 12px">
              {{ tr('管理个人私有设定与公开发布到大厅的作品，支持一键切换私有/共享。', 'Control private vs public visibility for settings and articles.') }}
            </p>
          </div>
          <div style="display: flex; gap: 6px; flex-wrap: wrap">
            <!-- Kind Filter -->
            <select v-model="filterKind" style="padding: 4px 8px; font-size: 12px">
              <option value="all">{{ tr('全部作品类型', 'All Kinds') }}</option>
              <option value="world">🌍 {{ tr('世界观', 'Worlds') }}</option>
              <option value="org">🏛️ {{ tr('组织', 'Organizations') }}</option>
              <option value="char">👤 {{ tr('角色', 'Characters') }}</option>
              <option value="article">🖋️ {{ tr('文章作品', 'Articles') }}</option>
            </select>
            <!-- Visibility Filter -->
            <select v-model="filterVisibility" style="padding: 4px 8px; font-size: 12px">
              <option value="all">{{ tr('全部可见度', 'All Visibility') }}</option>
              <option value="private">🔒 {{ tr('仅私有', 'Private Only') }}</option>
              <option value="public">🌐 {{ tr('已公开共享', 'Public Shared') }}</option>
            </select>
          </div>
        </div>

        <div v-if="!filteredWorks.length" class="hint" style="text-align: center; padding: 24px 0">
          {{ tr('暂无符合筛选条件的作品。', 'No creations match current filter.') }}
        </div>
        <div v-else style="display: flex; flex-direction: column; gap: 8px">
          <div
            v-for="item in filteredWorks"
            :key="item.kind + '_' + item.id"
            class="gl-row"
            style="display: flex; align-items: center; gap: 10px; padding: 10px 12px; background: var(--card); border-radius: 8px; border: 1px solid var(--li2)"
          >
            <span style="font-size: 20px; flex-shrink: 0">{{ item.icon }}</span>
            <div style="min-width: 0; flex: 1">
              <div style="display: flex; align-items: center; gap: 8px">
                <strong style="font-size: 14px">{{ item.title }}</strong>
                <!-- Visibility Tag -->
                <span
                  class="pill"
                  :style="{
                    fontSize: '11px',
                    padding: '2px 7px',
                    borderRadius: '99px',
                    background: item.visibility === 'public' ? 'rgba(16, 185, 129, 0.12)' : 'rgba(100, 116, 139, 0.12)',
                    color: item.visibility === 'public' ? 'var(--ok)' : 'var(--mu)',
                    fontWeight: 600
                  }"
                >
                  {{ item.visibility === 'public' ? '🌐 ' + tr('公开共享', 'Public') : '🔒 ' + tr('个人私有', 'Private') }}
                </span>
                <span class="hint" style="font-size: 11px">
                  {{ item.kindLabel }} · {{ item.extraInfo }}
                </span>
              </div>
              <div v-if="item.summary" class="hint" style="font-size: 12px; margin-top: 3px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap">
                {{ item.summary }}
              </div>
            </div>

            <!-- Action buttons -->
            <div style="display: flex; gap: 6px; align-items: center; flex-shrink: 0">
              <button
                type="button"
                class="btn sm"
                :class="{ primary: item.visibility !== 'public' }"
                :title="item.visibility === 'public' ? tr('取消公开，改为仅自己可见', 'Make Private') : tr('公开共享到全站创作大厅', 'Publish to Lobby')"
                @click="toggleWorkVisibility(item)"
              >
                {{ item.visibility === 'public' ? '🔒 ' + tr('设为私有', 'To Private') : '🌐 ' + tr('公开共享', 'Share Public') }}
              </button>
              <button type="button" class="btn sm" @click="goToEdit(item)">
                ✏️ {{ tr('编辑', 'Edit') }}
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Reset & Data Management Card -->
      <div class="card open" style="padding: 16px 20px; background: rgba(239, 68, 68, 0.04); border: 1px solid rgba(239, 68, 68, 0.2)">
        <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px">
          <div>
            <h4 style="margin: 0 0 2px; font-size: 14.5px; color: var(--er)">⚠️ {{ tr('基础范例重置与数据清空', 'Reset & Data Utilities') }}</h4>
            <p class="hint" style="margin: 0; font-size: 12px">
              {{ tr('重置或清空只影响本设备；云端副本会在下次同步时重新拉回。如需同时删除云端数据，请使用最右侧按钮。', 'Reset / clear only affect this device; the cloud copy is restored on next sync. Use the right-most button to also wipe the cloud.') }}
            </p>
          </div>
          <div style="display: flex; gap: 8px; flex-wrap: wrap">
            <button type="button" class="btn sm" @click="onResetStarter">
              🔄 {{ tr('重置为星渊群岛范例', 'Load Starter Example') }}
            </button>
            <button type="button" class="btn sm" @click="onClearData">
              🗑️ {{ tr('清空本地数据', 'Clear Local Data') }}
            </button>
            <button v-if="authStore.isLoggedIn" type="button" class="btn sm danger" @click="onWipeCloudAndLocal">
              ☁️🗑️ {{ tr('清空本地并覆盖云端', 'Wipe Local & Cloud') }}
            </button>
          </div>
        </div>
      </div>
    </template>

    <!-- Edit Profile Modal -->
    <Modal v-model="profileModalOpen" :title="tr('编辑个人资料', 'Edit Profile')" max-width="440px">
      <div style="display: flex; flex-direction: column; gap: 12px">
        <div>
          <label style="display: block; font-weight: 600; font-size: 13px; margin-bottom: 5px">
            {{ tr('显示昵称（最多 16 字）', 'Display Name (max 16 chars)') }}
          </label>
          <input
            v-model="editName"
            type="text"
            maxlength="16"
            :placeholder="tr('给自己起个响亮的名字', 'Pick a display name')"
          />
        </div>

        <div>
          <label style="display: block; font-weight: 600; font-size: 13px; margin-bottom: 6px">
            {{ tr('头像（上传图片或选择 Emoji）', 'Avatar (Upload image or pick Emoji)') }}
          </label>
          <div class="row" style="margin-top: 0">
            <Avatar :avatar="editAvatar" :name="editName" :size="44" />
            <button type="button" class="btn sm" @click="avatarFileRef?.click()">
              🖼️ {{ tr('上传图片 (256×256 JPEG)', 'Upload Image') }}
            </button>
            <input
              ref="avatarFileRef"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              hidden
              @change="onAvatarFileChange"
            />
            <span style="font-size: 12px; color: var(--mu)">{{ uploadStatus }}</span>
          </div>

          <div class="av-grid">
            <button
              v-for="em in AVATARS"
              :key="em"
              type="button"
              class="av-pick"
              :class="{ sel: editAvatar === em }"
              @click="editAvatar = em"
            >
              {{ em }}
            </button>
          </div>
        </div>
      </div>

      <template #footer>
        <button type="button" class="btn sm" @click="profileModalOpen = false">
          {{ tr('取消', 'Cancel') }}
        </button>
        <button type="button" class="btn primary sm" @click="onSaveProfile">
          {{ tr('保存', 'Save') }}
        </button>
      </template>
    </Modal>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import Avatar from '../components/base/Avatar.vue';
import Modal from '../components/base/Modal.vue';
import { useConfirm } from '../composables/useConfirm';
import { useI18n } from '../composables/useI18n';
import { useToast } from '../composables/useToast';
import { AVATARS } from '../core/legacy/insp';
import { api } from '../data/api';
import { useAIStore } from '../stores/ai';
import { useAuthStore } from '../stores/auth';
import { useDocStore } from '../stores/doc';
import { useSyncStore } from '../stores/sync';
import { useUIStore } from '../stores/ui';

const authStore = useAuthStore();
const syncStore = useSyncStore();
const docStore = useDocStore();
const uiStore = useUIStore();
const aiStore = useAIStore();
const router = useRouter();
const { tr } = useI18n();
const { toast } = useToast();
const { confirm } = useConfirm();

const bioInput = ref('');
const filterKind = ref<'all' | 'world' | 'org' | 'char' | 'article'>('all');
const filterVisibility = ref<'all' | 'private' | 'public'>('all');

const profileModalOpen = ref(false);
const editName = ref('');
const editAvatar = ref('');
const uploadStatus = ref('');
const avatarFileRef = ref<HTMLInputElement | null>(null);

const joinedText = computed(() => {
  const ts = authStore.user?.createdAt;
  if (!ts) return authStore.user?.email || '—';
  const d = new Date(ts > 1e11 ? ts : ts * 1000);
  return tr('加入于 ', 'Joined ') + d.toLocaleDateString();
});

const syncStateDesc = computed(() => {
  if (syncStore.status === 'syncing') return tr('正在同步…', 'Syncing…');
  if (syncStore.status === 'conflict') return tr('存在待处理冲突', 'Conflict pending');
  if (syncStore.status === 'dirty') return tr('有本地修改待同步', 'Changes pending');
  if (syncStore.lastSyncedAt) {
    return (
      tr('上次同步：', 'Last synced: ') +
      new Date(syncStore.lastSyncedAt).toTimeString().slice(0, 5)
    );
  }
  return tr('已连接云端', 'Cloud connected');
});

interface WorkItem {
  kind: 'world' | 'org' | 'char' | 'article';
  kindLabel: string;
  icon: string;
  id: string;
  title: string;
  summary: string;
  visibility: 'public' | 'private';
  extraInfo: string;
  updatedAt: number;
}

const allWorks = computed<WorkItem[]>(() => {
  const list: WorkItem[] = [];

  // Worlds
  Object.values(docStore.doc.worlds || {}).forEach((w) => {
    list.push({
      kind: 'world',
      kindLabel: tr('世界观', 'World'),
      icon: '🌍',
      id: w.id,
      title: (w.data && w.data.w_name) || w.name || tr('未命名世界', 'Untitled World'),
      summary: (w.data && w.data.w_summary) || '',
      visibility: (w as any).visibility || 'private',
      extraInfo: `${Object.keys(w.data || {}).length} ${tr('项设定', 'fields')}`,
      updatedAt: w.updatedAt || 0
    });
  });

  // Orgs
  Object.values(docStore.doc.orgs || {}).forEach((o) => {
    list.push({
      kind: 'org',
      kindLabel: tr('组织', 'Organization'),
      icon: '🏛️',
      id: o.id,
      title: (o.data && o.data.o_name) || o.name || tr('未命名组织', 'Untitled Org'),
      summary: (o.data && o.data.o_motto) || '',
      visibility: (o as any).visibility || 'private',
      extraInfo: `${Object.keys(o.data || {}).length} ${tr('项设定', 'fields')}`,
      updatedAt: o.updatedAt || 0
    });
  });

  // Chars
  Object.values(docStore.doc.chars || {}).forEach((c) => {
    list.push({
      kind: 'char',
      kindLabel: tr('角色', 'Character'),
      icon: '👤',
      id: c.id,
      title: (c.data && c.data.name) || c.name || tr('未命名角色', 'Untitled Character'),
      summary: (c.data && c.data.personality) || '',
      visibility: (c as any).visibility || 'private',
      extraInfo: `${c.data?.role || tr('角色档案', 'Profile')}`,
      updatedAt: c.updatedAt || 0
    });
  });

  // Articles
  (docStore.doc.articles || []).forEach((a) => {
    list.push({
      kind: 'article',
      kindLabel: tr('文章作品', 'Article'),
      icon: '🖋️',
      id: a.id,
      title: a.title || tr('未命名文章', 'Untitled Article'),
      summary: a.summary || '',
      visibility: a.visibility || 'private',
      extraInfo: `${a.wordCount || (a.content || '').length} ${tr('字', 'words')}`,
      updatedAt: a.updatedAt || 0
    });
  });

  return list.sort((a, b) => b.updatedAt - a.updatedAt);
});

const filteredWorks = computed(() => {
  return allWorks.value.filter((w) => {
    if (filterKind.value !== 'all' && w.kind !== filterKind.value) return false;
    if (filterVisibility.value !== 'all' && w.visibility !== filterVisibility.value) return false;
    return true;
  });
});

async function toggleWorkVisibility(item: WorkItem) {
  const nextVis = item.visibility === 'public' ? 'private' : 'public';
  if (item.kind === 'article') {
    docStore.toggleArticleVisibility(item.id);
    const art = (docStore.doc.articles || []).find((a) => a.id === item.id);
    if (art) {
      if (nextVis === 'public') {
        try {
          const res = await api.createShare({
            id: art.shareId,
            entityId: art.id,
            kind: 'article',
            title: art.title,
            summary: art.summary || '',
            content: art.content || '',
            visibility: 'public',
            tags: art.category || ''
          });
          art.shareId = String(res.share.id);
          toast(tr('文章已成功公开共享到创作大厅 ✓', 'Published to lobby ✓'), 'ok');
        } catch (err: any) {
          toast(tr('同步到大厅失败：', 'Share sync failed: ') + (err?.message || ''), 'err');
        }
      } else if (art.shareId) {
        try {
          await api.updateShareVisibility(art.shareId, 'private');
          toast(tr('文章已恢复为仅自己可见 🔒', 'Article set to private 🔒'), 'ok');
        } catch (err: any) {
          toast(tr('更新状态失败：', 'Update failed: ') + (err?.message || ''), 'err');
        }
      }
    }
  } else {
    // Entities (world, org, char)
    let entity: any = null;
    if (item.kind === 'world') entity = docStore.doc.worlds?.[item.id];
    else if (item.kind === 'org') entity = docStore.doc.orgs?.[item.id];
    else if (item.kind === 'char') entity = docStore.doc.chars?.[item.id];

    if (entity) {
      entity.visibility = nextVis;
      docStore.touch(true);
      if (nextVis === 'public') {
        try {
          const res = await api.createShare({
            id: entity.shareId,
            entityId: entity.id,
            kind: item.kind,
            title: item.title,
            summary: item.summary || '',
            content: JSON.stringify(entity.data, null, 2),
            visibility: 'public'
          });
          entity.shareId = String(res.share.id);
          toast(tr('设定已成功公开共享到创作大厅 ✓', 'Published to lobby ✓'), 'ok');
        } catch (err: any) {
          toast(tr('共享失败：', 'Share failed: ') + (err?.message || ''), 'err');
        }
      } else if (entity.shareId) {
        try {
          await api.updateShareVisibility(entity.shareId, 'private');
          toast(tr('设定已设为私有 🔒', 'Entity set to private 🔒'), 'ok');
        } catch (err: any) {
          toast(tr('更新状态失败：', 'Update failed: ') + (err?.message || ''), 'err');
        }
      }
    }
  }
}

function goToEdit(item: WorkItem) {
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

async function onResetStarter() {
  if (
    !(await confirm(
      tr('确认重置为官方示例？', 'Reset to Starter Example?'),
      tr('当前全部未保存或未备份的数据将被「星渊群岛」示例库覆盖！', 'This will replace your current studio content with the Starfall Archipelago example.')
    ))
  ) {
    return;
  }
  await syncStore.resetBaseState();
  docStore.resetToStarterExample();
  toast(tr('已加载星渊群岛基础范例 ✨（云端数据未受影响）', 'Loaded starter example ✨ (cloud untouched)'), 'ok');
}

async function onClearData() {
  if (
    !(await confirm(
      tr('确定清空本地全部设定数据？', 'Clear all local data?'),
      tr('此操作将删除当前库的所有世界观、组织、角色、时间线及文章！建议先做备份。', 'This will wipe out all entities and stories!')
    ))
  ) {
    return;
  }
  await syncStore.resetBaseState();
  docStore.clearAllData();
  toast(tr('已清空本地数据（云端数据未受影响）', 'Local data cleared (cloud untouched)'), 'ok');
}

async function onWipeCloudAndLocal() {
  if (
    !(await confirm(
      tr('确定同时清空本地与云端全部数据？', 'Wipe BOTH local and cloud data?'),
      tr('此操作会把空白库推送到云端并覆盖所有设备上的数据，无法通过同步找回（仅可从服务器历史快照回滚）。强烈建议先导出备份。', 'This pushes an empty workspace to the cloud and overwrites every device. Only server-side revision snapshots can restore it. Export a backup first.')
    ))
  ) {
    return;
  }
  docStore.clearAllData();
  docStore.touch(true, true);
  const ok = await syncStore.push(true);
  toast(
    ok ? tr('本地与云端已清空', 'Local and cloud wiped') : tr('本地已清空，云端推送失败，请稍后手动同步', 'Local cleared; cloud push failed, sync manually later'),
    ok ? 'ok' : 'warn'
  );
}

watch(
  () => authStore.user,
  (u) => {
    if (u) {
      bioInput.value = u.bio || '';
    }
  },
  { immediate: true }
);

function openEditProfile() {
  editName.value = authStore.user?.name || '';
  editAvatar.value = authStore.user?.avatar || '';
  uploadStatus.value = '';
  profileModalOpen.value = true;
}

async function onAvatarFileChange(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;

  if (!file.type.startsWith('image/')) {
    uploadStatus.value = tr('请选择图片文件', 'Please pick an image');
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    uploadStatus.value = tr('图片不能超过 5MB', 'Max 5MB');
    return;
  }

  uploadStatus.value = tr('压缩上传中…', 'Uploading…');
  try {
    const updatedUser = await authStore.uploadAvatarFile(file);
    editAvatar.value = updatedUser.avatar;
    uploadStatus.value = tr('已上传 ✓', 'Uploaded ✓');
  } catch (err: any) {
    uploadStatus.value = tr('上传失败：', 'Failed: ') + (err?.message || '');
  }
}

async function onSaveProfile() {
  try {
    await authStore.updateProfile({
      name: editName.value.trim().slice(0, 16),
      avatar: editAvatar.value
    });
    profileModalOpen.value = false;
    toast(tr('资料已更新 ✓', 'Profile updated ✓'), 'ok');
  } catch (err: any) {
    toast(tr('保存失败：', 'Failed: ') + (err?.message || ''), 'err');
  }
}

async function onSaveBio() {
  try {
    await authStore.updateProfile({
      bio: bioInput.value.trim().slice(0, 80)
    });
    toast(tr('已保存 ✓', 'Saved ✓'), 'ok');
  } catch (err: any) {
    toast(tr('保存失败：', 'Failed: ') + (err?.message || ''), 'err');
  }
}

async function onLogout() {
  // authStore.logout() tears down sync state, the document and local AI config in the right order.
  await authStore.logout();
  toast(tr('已退出登录', 'Signed out'), 'ok');
}
</script>
