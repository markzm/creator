<template>
  <div class="wrap" style="max-width: 780px">
    <!-- Locked State -->
    <div v-if="!authStore.isLoggedIn" class="card open" style="padding: 40px 24px; text-align: center">
      <p style="font-size: 42px; margin: 0 0 10px">🪪</p>
      <h3 style="margin: 0 0 8px">{{ tr('登录开启个人主页与云同步', 'Sign in to access your profile & cloud sync') }}</h3>
      <p class="hint" style="display: block; margin-bottom: 18px">
        {{ tr('登录后自动跨设备同步全部设定数据，并可在创作大厅展示你的状态与分享。', 'Sync across devices and share your worlds in the creator lobby.') }}
      </p>
      <button type="button" class="btn primary lg" @click="uiStore.openModal('auth')">
        ☁️ {{ tr('立即登录 / 注册', 'Sign In / Register') }}
      </button>
    </div>

    <!-- Logged-In Main -->
    <template v-else>
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
            <h2 style="margin: 0 0 4px; font-size: 20px">{{ authStore.displayName }}</h2>
            <p style="margin: 0; font-size: 12.5px; color: var(--mu)">
              {{ joinedText }}
            </p>
          </div>
          <div style="display: flex; gap: 8px; flex-wrap: wrap">
            <button type="button" class="btn sm" @click="openEditProfile">
              ✏️ {{ tr('编辑资料 / 头像', 'Edit Profile') }}
            </button>
            <button type="button" class="btn sm" @click="loadMyShares">
              🔄 {{ tr('刷新', 'Refresh') }}
            </button>
            <button type="button" class="btn sm danger" @click="onLogout">
              {{ tr('退出登录', 'Sign Out') }}
            </button>
          </div>
        </div>

        <div style="margin-top: 18px; padding-top: 16px; border-top: 1px solid var(--li2)">
          <label style="display: block; font-weight: 600; font-size: 13px; margin-bottom: 6px">
            {{ tr('个人简介（大厅可见，最多 80 字）', 'Bio (visible in lobby, max 80 chars)') }}
          </label>
          <div style="display: flex; gap: 8px">
            <input
              v-model="bioInput"
              type="text"
              maxlength="80"
              :placeholder="tr('写一句介绍自己的创作方向…', 'Describe what you are building…')"
              style="flex: 1"
            />
            <button type="button" class="btn sm primary" @click="onSaveBio">
              {{ tr('保存简介', 'Save Bio') }}
            </button>
          </div>
        </div>
      </div>

      <!-- Cloud Sync Control Card -->
      <div class="card open" style="padding: 20px">
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap">
          <div>
            <h3 style="margin: 0 0 4px; font-size: 16px">☁️ {{ tr('云端同步与版本历史', 'Cloud Sync & Revision History') }}</h3>
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
              ⬆️ {{ tr('立即上传到云端', 'Push to Cloud') }}
            </button>
            <button
              type="button"
              class="btn sm"
              :disabled="syncStore.status === 'syncing'"
              @click="syncStore.pull(true)"
            >
              ⬇️ {{ tr('从云端拉取合并', 'Pull from Cloud') }}
            </button>
            <button
              type="button"
              class="btn sm"
              @click="uiStore.openModal('revisions')"
            >
              🕒 {{ tr('历史版本快照', 'Revision History') }}
            </button>
          </div>
        </div>
      </div>

      <!-- My Shares Card -->
      <div class="card open" style="padding: 20px">
        <h3 style="margin: 0 0 12px; font-size: 16px">
          📤 {{ tr('我分享的设定', 'My Shared Creations') }} ({{ myShares.length }})
        </h3>
        <p v-if="loadingShares" class="hint" style="display: block">
          {{ tr('加载中…', 'Loading…') }}
        </p>
        <p v-else-if="!myShares.length" class="hint" style="display: block">
          {{ tr('还没有分享。到「世界观 / 组织 / 角色」页点「📤 分享到大厅」发布你的第一个设定吧。', 'Nothing shared yet.') }}
        </p>
        <div v-else>
          <div
            v-for="s in myShares"
            :key="s.id"
            class="gl-row"
          >
            <strong>{{ s.title }}</strong>
            <span class="gl-note">{{ s.summary || '' }}</span>
            <button type="button" class="btn sm" @click="viewingShare = s">
              {{ tr('查看', 'View') }}
            </button>
            <button type="button" class="btn sm icon danger" @click="onDeleteShare(s.id)">
              ✕
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

    <!-- View Share Modal -->
    <Modal
      :model-value="Boolean(viewingShare)"
      :title="viewingShare?.title || ''"
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
import { computed, onMounted, ref, watch } from 'vue';
import Avatar from '../components/base/Avatar.vue';
import Modal from '../components/base/Modal.vue';
import { useConfirm } from '../composables/useConfirm';
import { useI18n } from '../composables/useI18n';
import { useToast } from '../composables/useToast';
import { AVATARS } from '../core/legacy/insp';
import { api, type WorldShareItem } from '../data/api';
import { useAuthStore } from '../stores/auth';
import { useSyncStore } from '../stores/sync';
import { useUIStore } from '../stores/ui';

const authStore = useAuthStore();
const syncStore = useSyncStore();
const uiStore = useUIStore();
const { t, tr } = useI18n();
const { toast } = useToast();
const { confirm } = useConfirm();

const bioInput = ref('');
const myShares = ref<WorldShareItem[]>([]);
const loadingShares = ref(false);
const viewingShare = ref<WorldShareItem | null>(null);

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

async function loadMyShares() {
  if (!authStore.isLoggedIn) return;
  loadingShares.value = true;
  try {
    const res = await api.getShares({ owner: 'me', limit: 30 });
    myShares.value = res.shares || [];
  } catch (err: any) {
    toast((tr('加载分享失败：', 'Failed: ')) + (err?.message || ''), 'err');
  } finally {
    loadingShares.value = false;
  }
}

watch(
  () => authStore.user,
  (u) => {
    if (u) {
      bioInput.value = u.bio || '';
      void loadMyShares();
    } else {
      myShares.value = [];
    }
  },
  { immediate: true }
);

onMounted(() => {
  if (authStore.isLoggedIn) {
    void loadMyShares();
  }
});

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
    uploadStatus.value = (tr('上传失败：', 'Failed: ')) + (err?.message || '');
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
    toast((tr('保存失败：', 'Failed: ')) + (err?.message || ''), 'err');
  }
}

async function onSaveBio() {
  try {
    await authStore.updateProfile({
      bio: bioInput.value.trim().slice(0, 80)
    });
    toast(tr('已保存 ✓', 'Saved ✓'), 'ok');
  } catch (err: any) {
    toast((tr('保存失败：', 'Failed: ')) + (err?.message || ''), 'err');
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
    myShares.value = myShares.value.filter((s) => s.id !== id);
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

async function onLogout() {
  await authStore.logout();
  syncStore.onLogout();
  toast(tr('已退出登录', 'Signed out'), 'ok');
}
</script>
