<template>
  <Modal
    :model-value="uiStore.modals.creatorProfile"
    :title="profile ? `创作者主页 · @${profile.user.name}` : '创作者个人主页'"
    max-width="700px"
    @update:model-value="(v) => !v && uiStore.closeModal('creatorProfile')"
  >
    <div v-if="loading" class="hint" style="text-align: center; padding: 40px 0">
      正在载入创作者档案…
    </div>
    <div v-else-if="!profile" class="hint" style="text-align: center; padding: 40px 0">
      未找到该创作者档案。
    </div>
    <div v-else style="display: flex; flex-direction: column; gap: 16px">
      <!-- Profile Header Card -->
      <div class="card" style="padding: 16px; background: linear-gradient(135deg, var(--card) 0%, var(--soft) 100%); display: flex; gap: 14px; align-items: center; flex-wrap: wrap">
        <div style="position: relative">
          <Avatar :avatar="profile.user.avatar" :name="profile.user.name" :size="56" />
          <span
            :style="{
              position: 'absolute',
              right: '0px',
              bottom: '0px',
              width: '12px',
              height: '12px',
              borderRadius: '50%',
              background: profile.user.isOnline ? 'var(--ok)' : 'var(--li)',
              border: '2px solid var(--card)'
            }"
            :title="profile.user.isOnline ? '当前在线' : '离线'"
          />
        </div>
        <div style="flex: 1; min-width: 200px">
          <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap">
            <h2 style="margin: 0; font-size: 18px; font-weight: 800">{{ profile.user.name }}</h2>
            <span v-if="profile.isSuperAdmin" class="pill" style="font-size: 11px; padding: 1px 7px; border-radius: 99px; background: #f59e0b; color: #fff; font-weight: 700">
              👑 超级管理员
            </span>
            <span v-else-if="profile.isAdmin" class="pill" style="font-size: 11px; padding: 1px 7px; border-radius: 99px; background: var(--ac); color: #fff; font-weight: 700">
              🛡️ 管理员
            </span>
            <span v-if="profile.isMuted" class="pill" style="font-size: 11px; padding: 1px 7px; border-radius: 99px; background: #ef4444; color: #fff; font-weight: 700">
              🔇 已禁言
            </span>
          </div>
          <p class="hint" style="margin: 4px 0 0; font-size: 12px">
            {{ profile.user.focus || '沉浸于世界构想中…' }}
          </p>
          <div class="hint" style="margin-top: 4px; font-size: 11.5px">
            加入时间：{{ formatDate(profile.createdAt) }} · 最近活跃：{{ profile.user.isOnline ? '刚刚在线' : relTime(profile.user.lastSeen) }}
          </div>
        </div>
      </div>

      <!-- Navigation Tabs -->
      <div style="display: flex; gap: 8px; border-bottom: 1px solid var(--li2); padding-bottom: 8px">
        <button
          type="button"
          class="tab-btn"
          :class="{ active: currentTab === 'bio' }"
          @click="currentTab = 'bio'"
        >
          📖 MD 驱动简介页
        </button>
        <button
          type="button"
          class="tab-btn"
          :class="{ active: currentTab === 'shares' }"
          @click="currentTab = 'shares'"
        >
          ⭐ 精华设定展示 ({{ profile.publishedShares.length }})
        </button>
        <button
          type="button"
          class="tab-btn"
          :class="{ active: currentTab === 'cocreations' }"
          @click="currentTab = 'cocreations'"
        >
          🤝 共创企划 ({{ profile.cocreations.length }})
        </button>
      </div>

      <!-- Tab 1: Markdown-driven Bio -->
      <div v-if="currentTab === 'bio'">
        <div v-if="isViewingSelf && editingBio" class="card" style="padding: 12px">
          <label style="display: block; font-size: 12px; font-weight: 700; margin-bottom: 6px">
            编辑您的 Markdown 个人主页简介
          </label>
          <textarea
            v-model="bioDraft"
            class="input"
            rows="8"
            placeholder="# 关于我的世界观体系&#10;&#10;这里是简介，支持标题、列表、引用与维基词条高亮…"
            style="width: 100%; box-sizing: border-box; font-size: 13px; line-height: 1.6"
          />
          <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 8px">
            <button type="button" class="btn sm" @click="editingBio = false">取消</button>
            <button type="button" class="btn primary sm" :disabled="savingBio" @click="saveBio">
              {{ savingBio ? '保存中…' : '保存简介' }}
            </button>
          </div>
        </div>

        <div v-else class="card" style="padding: 16px; background: var(--card)">
          <div v-if="isViewingSelf" style="display: flex; justify-content: flex-end; margin-bottom: 8px">
            <button type="button" class="btn sm" style="font-size: 11.5px" @click="startEditBio">
              ✏️ 编辑我的简介 (支持 Markdown)
            </button>
          </div>
          <MarkdownBio :content="profile.user.bio" />
        </div>
      </div>

      <!-- Tab 2: Featured Creations & Lore -->
      <div v-else-if="currentTab === 'shares'">
        <div v-if="!profile.publishedShares.length" class="hint" style="text-align: center; padding: 24px 0">
          该创作者尚未公开发表设定作品。
        </div>
        <div v-else style="display: flex; flex-direction: column; gap: 10px">
          <div
            v-for="sh in profile.publishedShares"
            :key="sh.id"
            class="card"
            style="padding: 12px; display: flex; justify-content: space-between; align-items: center; gap: 10px"
          >
            <div>
              <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px">
                <span class="pill" style="font-size: 10.5px; padding: 1px 6px; border-radius: 99px; background: var(--acs); color: var(--ac); font-weight: 700">
                  {{ formatKind(sh.kind) }}
                </span>
                <span v-if="sh.canonStatus === 'canon'" class="pill" style="font-size: 10px; padding: 1px 5px; border-radius: 99px; background: #e0e7ff; color: #4338ca; font-weight: 700">
                  ⭐ 官方正典
                </span>
                <span v-else-if="sh.canonStatus === 'doujin'" class="pill" style="font-size: 10px; padding: 1px 5px; border-radius: 99px; background: #fdf2f8; color: #be185d; font-weight: 700">
                  🎨 同人衍生
                </span>
                <strong style="font-size: 14px">{{ sh.title }}</strong>
                <span v-if="sh.wordCount" class="hint" style="font-size: 11px">({{ sh.wordCount }}字)</span>
              </div>
              <p class="hint" style="margin: 0; font-size: 12px; line-height: 1.4">
                {{ sh.summary || '暂无摘要' }}
              </p>
            </div>
            <div style="display: flex; gap: 6px; flex-shrink: 0">
              <button
                v-if="sh.draftCode"
                type="button"
                class="btn sm"
                style="font-size: 11.5px"
                @click="copyCode(sh.draftCode)"
              >
                📋 复制草稿码
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Tab 3: Co-creation Projects -->
      <div v-else-if="currentTab === 'cocreations'">
        <div v-if="!profile.cocreations.length" class="hint" style="text-align: center; padding: 24px 0">
          该创作者尚未发起共创企划。
        </div>
        <div v-else style="display: flex; flex-direction: column; gap: 10px">
          <div
            v-for="p in profile.cocreations"
            :key="p.id"
            class="card"
            style="padding: 12px"
          >
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px">
              <strong style="font-size: 14px; color: var(--ac)">🤝 {{ p.worldTitle }}</strong>
              <span class="hint" style="font-size: 11.5px">企划编号: {{ p.id }}</span>
            </div>
            <p class="hint" style="margin: 0 0 6px; font-size: 12px">
              {{ p.summary || '暂无企划介绍' }}
            </p>
            <div class="hint" style="font-size: 11.5px">
              分部管理员 ({{ p.admins.length }}位): {{ p.admins.join(', ') || '暂无' }}
            </div>
          </div>
        </div>
      </div>

      <!-- Admin Actions Bar (Visible to Admins / markzm) -->
      <div
        v-if="authStore.isAdmin && !isViewingSelf"
        class="card"
        style="padding: 12px 14px; background: rgba(245, 158, 11, 0.08); border-left: 3px solid #f59e0b"
      >
        <div style="font-size: 12px; font-weight: 700; margin-bottom: 8px; color: #b45309">
          🛡️ 管理员治理快捷操作
        </div>
        <div style="display: flex; gap: 8px; flex-wrap: wrap">
          <!-- markzm only: grant/revoke admin -->
          <button
            v-if="authStore.isSuperAdmin"
            type="button"
            class="btn sm"
            @click="toggleAdminRole"
          >
            {{ profile.isAdmin ? '撤销管理员权限' : '设为管理员' }}
          </button>
          <!-- Mute / Unmute -->
          <button type="button" class="btn sm" @click="toggleMute">
            {{ profile.isMuted ? '🔊 解除禁言' : '🔇 禁言创作者' }}
          </button>
          <!-- Lift penalties -->
          <button type="button" class="btn sm" @click="liftPenalties">
            ✨ 解除全部惩罚
          </button>
        </div>
      </div>
    </div>

    <template #footer>
      <button type="button" class="btn sm" @click="uiStore.closeModal('creatorProfile')">
        关闭
      </button>
    </template>
  </Modal>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import Avatar from '../base/Avatar.vue';
import MarkdownBio from '../base/MarkdownBio.vue';
import Modal from '../base/Modal.vue';
import { useConfirm } from '../../composables/useConfirm';
import { useToast } from '../../composables/useToast';
import type { CreatorProfile } from '../../core/schema/types';
import { api } from '../../data/api';
import { useAuthStore } from '../../stores/auth';
import { useUIStore } from '../../stores/ui';

const authStore = useAuthStore();
const uiStore = useUIStore();
const { toast } = useToast();
const { confirm } = useConfirm();

const profile = ref<CreatorProfile | null>(null);
const loading = ref(false);
const currentTab = ref<'bio' | 'shares' | 'cocreations'>('bio');

const editingBio = ref(false);
const bioDraft = ref('');
const savingBio = ref(false);

const isViewingSelf = computed(() => {
  return authStore.user && profile.value && authStore.user.id === profile.value.user.id;
});

async function loadProfile(uid: number) {
  loading.value = true;
  profile.value = null;
  editingBio.value = false;
  try {
    const res = await api.getCreatorProfile(uid);
    profile.value = res;
    bioDraft.value = res.user.bio || '';
  } catch {
    // Ignore error
  } finally {
    loading.value = false;
  }
}

watch(
  [() => uiStore.modals.creatorProfile, () => uiStore.activeProfileUserId],
  ([open, uid]) => {
    if (open && uid) {
      void loadProfile(uid);
    }
  }
);

function startEditBio() {
  bioDraft.value = profile.value?.user.bio || '';
  editingBio.value = true;
}

async function saveBio() {
  savingBio.value = true;
  try {
    await authStore.updateProfile({ bio: bioDraft.value.trim() });
    if (profile.value) {
      profile.value.user.bio = bioDraft.value.trim();
    }
    toast('简介已保存 ✓', 'ok');
    editingBio.value = false;
  } catch (err: any) {
    toast(err?.message || '保存失败', 'err');
  } finally {
    savingBio.value = false;
  }
}

function copyCode(code: string) {
  navigator.clipboard.writeText(code);
  toast('草稿码已复制到剪贴板 ✓', 'ok');
}

async function toggleAdminRole() {
  if (!profile.value) return;
  const targetState = !profile.value.isAdmin;
  const actionText = targetState ? '授予管理员权限' : '撤销管理员权限';
  if (!await confirm(`确认${actionText}`, `确定要对创作者 @${profile.value.user.name} 执行${actionText}操作吗？`)) {
    return;
  }
  try {
    await api.setAdminUserRole(profile.value.user.id, targetState);
    profile.value.isAdmin = targetState;
    toast(`已成功${actionText} ✓`, 'ok');
  } catch (err: any) {
    toast(err?.message || '操作失败', 'err');
  }
}

async function toggleMute() {
  if (!profile.value) return;
  const targetState = !profile.value.isMuted;
  const actionText = targetState ? '禁言创作者' : '解除禁言';
  if (!await confirm(`确认${actionText}`, `确定要对创作者 @${profile.value.user.name} 执行${actionText}操作吗？`)) {
    return;
  }
  try {
    await api.setAdminUserMute(profile.value.user.id, targetState, targetState ? '违反社区规范' : '');
    profile.value.isMuted = targetState;
    toast(`已成功${actionText} ✓`, 'ok');
  } catch (err: any) {
    toast(err?.message || '操作失败', 'err');
  }
}

async function liftPenalties() {
  if (!profile.value) return;
  if (!await confirm('确认解除全部惩罚', `确定要解除创作者 @${profile.value.user.name} 的所有禁言与封禁限制吗？`)) {
    return;
  }
  try {
    await api.liftAdminUserPenalties(profile.value.user.id);
    profile.value.isMuted = false;
    toast('已解除该账号全部惩罚限制 ✓', 'ok');
  } catch (err: any) {
    toast(err?.message || '操作失败', 'err');
  }
}

function formatKind(kind: string): string {
  if (kind === 'char') return '角色';
  if (kind === 'org') return '组织';
  if (kind === 'article') return '文章';
  return '世界观';
}

function formatDate(ts: number): string {
  if (!ts) return '—';
  return new Date(ts > 1e11 ? ts : ts * 1000).toLocaleDateString();
}

function relTime(ts: number): string {
  if (!ts) return '';
  const now = Math.floor(Date.now() / 1000);
  const diff = now - ts;
  if (diff < 60) return '刚刚';
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
  return `${Math.floor(diff / 86400)} 天前`;
}
</script>
