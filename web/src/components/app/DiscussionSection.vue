<template>
  <div class="discussion-section">
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px">
      <h3 style="margin: 0; font-size: 15px; display: flex; align-items: center; gap: 6px">
        <span>💬 设定讨论组</span>
        <span class="pill" style="font-size: 11px; padding: 1px 7px; border-radius: 99px; background: var(--acs); color: var(--ac)">
          {{ comments.length }}
        </span>
      </h3>
      <button v-if="loading" class="btn sm" disabled style="font-size: 11px">
        加载中…
      </button>
      <button v-else type="button" class="btn sm" style="font-size: 11px" @click="fetchComments">
        🔄 刷新
      </button>
    </div>

    <!-- Muted warning if user is muted -->
    <div v-if="authStore.isLoggedIn && authStore.isMuted" class="card" style="padding: 10px 14px; margin-bottom: 12px; background: rgba(239, 68, 68, 0.08); border-left: 3px solid #ef4444; font-size: 12.5px; color: #ef4444">
      ⚠️ 您当前已被管理员禁言，暂时无法发表评论或参与讨论。
    </div>

    <!-- Comment input form -->
    <div v-if="authStore.isLoggedIn && !authStore.isMuted" class="comment-box" style="margin-bottom: 16px">
      <div v-if="replyTo" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; font-size: 12px; color: var(--ac); background: var(--acs); padding: 4px 8px; border-radius: 4px">
        <span>回复 @{{ replyTo.userName }}:</span>
        <button type="button" class="btn sm" style="padding: 1px 6px; font-size: 11px" @click="replyTo = null">
          取消回复
        </button>
      </div>
      <textarea
        v-model="commentText"
        class="input"
        rows="2"
        :placeholder="replyTo ? `回复 @${replyTo.userName}…` : '留下您的评论或与创作者探讨设定细节…'"
        style="width: 100%; box-sizing: border-box; resize: vertical; font-size: 13px"
        @keydown.ctrl.enter="submitComment"
        @keydown.meta.enter="submitComment"
      />
      <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 6px">
        <span class="hint" style="font-size: 11px">支持 Ctrl+Enter 快捷发送</span>
        <button
          type="button"
          class="btn primary sm"
          :disabled="submitting || !commentText.trim()"
          @click="submitComment"
        >
          {{ submitting ? '发送中…' : '发表讨论' }}
        </button>
      </div>
    </div>
    <div v-else-if="!authStore.isLoggedIn" class="card" style="padding: 12px 14px; margin-bottom: 16px; text-align: center; background: var(--soft)">
      <span style="font-size: 13px; color: var(--mu); margin-right: 10px">登录账号后即可发表评论与创作者交流</span>
      <button type="button" class="btn primary sm" @click="uiStore.openModal('auth')">
        立即登录
      </button>
    </div>

    <!-- Comments List -->
    <div v-if="loading && !comments.length" class="hint" style="text-align: center; padding: 20px 0">
      正在载入讨论组…
    </div>
    <div v-else-if="!comments.length" class="hint" style="text-align: center; padding: 20px 0">
      暂无评论讨论。抢先发表第一条见解吧~
    </div>
    <div v-else class="comments-list" style="display: flex; flex-direction: column; gap: 12px">
      <div
        v-for="c in comments"
        :key="c.id"
        class="comment-card"
        style="padding: 12px; background: var(--card); border: 1px solid var(--li2); border-radius: 8px"
      >
        <!-- Root Comment Header -->
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px">
          <Avatar :avatar="c.userAvatar" :name="c.userName" :size="26" />
          <strong
            style="font-size: 13px; cursor: pointer"
            class="hover-link"
            @click="c.userId && uiStore.openCreatorProfile(c.userId)"
          >
            {{ c.userName }}
          </strong>
          <span class="hint" style="font-size: 11px">{{ relTime(c.createdAt) }}</span>
          <span class="spacer" />
          <!-- Like button -->
          <button
            type="button"
            class="btn sm icon-btn"
            :style="{ color: c.hasLiked ? 'var(--ac)' : 'var(--mu)', background: c.hasLiked ? 'var(--acs)' : 'transparent', border: 'none', padding: '2px 6px', fontSize: '11.5px' }"
            @click="handleLike(c)"
          >
            👍 {{ c.likeCount || 0 }}
          </button>
          <!-- Reply button -->
          <button
            v-if="authStore.isLoggedIn && !authStore.isMuted"
            type="button"
            class="btn sm"
            style="padding: 2px 7px; font-size: 11px"
            @click="replyTo = c"
          >
            回复
          </button>
          <!-- Delete button (Author or Admin) -->
          <button
            v-if="canDelete(c)"
            type="button"
            class="btn sm danger"
            style="padding: 2px 6px; font-size: 11px"
            title="删除此评论"
            @click="handleDelete(c.id)"
          >
            🗑️
          </button>
        </div>

        <!-- Root Comment Body -->
        <div style="font-size: 13px; line-height: 1.6; margin-left: 34px; white-space: pre-wrap; color: var(--ink)">
          {{ c.content }}
        </div>

        <!-- Replies List -->
        <div
          v-if="c.replies && c.replies.length"
          class="replies-list"
          style="margin-left: 34px; margin-top: 10px; padding-left: 10px; border-left: 2px solid var(--li2); display: flex; flex-direction: column; gap: 8px"
        >
          <div
            v-for="rep in c.replies"
            :key="rep.id"
            class="reply-card"
            style="padding: 6px 8px; background: var(--soft); border-radius: 6px"
          >
            <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px">
              <Avatar :avatar="rep.userAvatar" :name="rep.userName" :size="20" />
              <strong
                style="font-size: 12px; cursor: pointer"
                class="hover-link"
                @click="rep.userId && uiStore.openCreatorProfile(rep.userId)"
              >
                {{ rep.userName }}
              </strong>
              <span class="hint" style="font-size: 10.5px">{{ relTime(rep.createdAt) }}</span>
              <span class="spacer" />
              <button
                type="button"
                class="btn sm icon-btn"
                :style="{ color: rep.hasLiked ? 'var(--ac)' : 'var(--mu)', background: rep.hasLiked ? 'var(--acs)' : 'transparent', border: 'none', padding: '1px 5px', fontSize: '11px' }"
                @click="handleLike(rep)"
              >
                👍 {{ rep.likeCount || 0 }}
              </button>
              <button
                v-if="canDelete(rep)"
                type="button"
                class="btn sm danger"
                style="padding: 1px 5px; font-size: 10px"
                title="删除回复"
                @click="handleDelete(rep.id)"
              >
                🗑️
              </button>
            </div>
            <div style="font-size: 12.5px; line-height: 1.5; margin-left: 26px; white-space: pre-wrap">
              {{ rep.content }}
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import Avatar from '../base/Avatar.vue';
import { useConfirm } from '../../composables/useConfirm';
import { useToast } from '../../composables/useToast';
import type { SettingComment } from '../../core/schema/types';
import { api } from '../../data/api';
import { useAuthStore } from '../../stores/auth';
import { useUIStore } from '../../stores/ui';

const props = defineProps<{
  shareId: string | number;
}>();

const authStore = useAuthStore();
const uiStore = useUIStore();
const { toast } = useToast();
const { confirm } = useConfirm();

const comments = ref<SettingComment[]>([]);
const loading = ref(false);
const submitting = ref(false);
const commentText = ref('');
const replyTo = ref<SettingComment | null>(null);

async function fetchComments() {
  if (!props.shareId) return;
  loading.value = true;
  try {
    const res = await api.getComments(props.shareId);
    comments.value = res.comments || [];
  } catch {
    // Ignore fetch comment error
  } finally {
    loading.value = false;
  }
}

watch(() => props.shareId, () => {
  fetchComments();
}, { immediate: true });

async function submitComment() {
  if (!commentText.value.trim() || submitting.value) return;
  submitting.value = true;
  try {
    const parentId = replyTo.value ? replyTo.value.id : 0;
    const res = await api.addComment(props.shareId, commentText.value.trim(), parentId);
    toast('发表成功 ✓', 'ok');
    commentText.value = '';
    replyTo.value = null;
    await fetchComments();
  } catch (err: any) {
    toast(err?.message || '发表失败', 'err');
  } finally {
    submitting.value = false;
  }
}

async function handleLike(c: SettingComment) {
  if (!authStore.isLoggedIn) {
    uiStore.openModal('auth');
    return;
  }
  try {
    const res = await api.toggleCommentLike(c.id);
    c.hasLiked = res.liked;
    c.likeCount = res.likeCount;
  } catch (err: any) {
    toast(err?.message || '点赞失败', 'err');
  }
}

function canDelete(c: SettingComment): boolean {
  if (!authStore.isLoggedIn) return false;
  if (authStore.isAdmin) return true;
  return authStore.user?.id === c.userId;
}

async function handleDelete(id: number) {
  if (!await confirm('确认删除评论', '确定要删除这条讨论发言吗？删除后将无法恢复。')) {
    return;
  }
  try {
    await api.deleteComment(id);
    toast('评论已删除', 'ok');
    await fetchComments();
  } catch (err: any) {
    toast(err?.message || '删除失败', 'err');
  }
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

<style scoped>
.hover-link:hover {
  color: var(--ac);
  text-decoration: underline;
}
</style>
