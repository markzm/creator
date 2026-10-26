<template>
  <Modal
    v-model="uiStore.modals.auth"
    :title="mode === 'login' ? tr('登录云端账号', 'Sign In') : tr('注册新账号', 'Create Account')"
    max-width="440px"
  >
    <div style="display: flex; gap: 6px; margin-bottom: 14px">
      <button
        type="button"
        class="btn sm"
        :class="mode === 'login' ? 'primary' : ''"
        style="flex: 1"
        @click="switchMode('login')"
      >
        {{ tr('登录', 'Sign In') }}
      </button>
      <button
        type="button"
        class="btn sm"
        :class="mode === 'register' ? 'primary' : ''"
        style="flex: 1"
        @click="switchMode('register')"
      >
        {{ tr('注册', 'Register') }}
      </button>
    </div>

    <form style="display: flex; flex-direction: column; gap: 12px" @submit.prevent="onSubmit">
      <div>
        <label style="display: block; font-weight: 600; font-size: 13px; margin-bottom: 4px">
          {{ tr('邮箱账号', 'Email') }}
        </label>
        <input
          v-model="email"
          type="email"
          required
          placeholder="you@example.com"
          autocomplete="email"
        />
      </div>

      <div>
        <label style="display: block; font-weight: 600; font-size: 13px; margin-bottom: 4px">
          {{ tr('密码（至少 8 位，含字母与数字）', 'Password (min 8 chars, letters + digits)') }}
        </label>
        <input
          v-model="password"
          type="password"
          required
          minlength="8"
          placeholder="••••••••"
          autocomplete="current-password"
        />
      </div>

      <template v-if="mode === 'register'">
        <div v-if="registerMode === 'invite'">
          <label style="display: block; font-weight: 600; font-size: 13px; margin-bottom: 4px">
            {{ tr('邀请码', 'Invite Code') }}
          </label>
          <input
            v-model="inviteCode"
            type="text"
            required
            :placeholder="tr('请输入邀请码', 'Invite code')"
          />
        </div>

        <div v-if="challengeQuestion">
          <label style="display: block; font-weight: 600; font-size: 13px; margin-bottom: 4px">
            {{ tr('安全验证：', 'Security Check: ') }}
            <strong style="color: var(--ac)">{{ challengeQuestion }}</strong>
          </label>
          <div style="display: flex; gap: 8px">
            <input
              v-model="challengeAnswer"
              type="text"
              required
              :placeholder="tr('输入计算结果', 'Enter answer')"
              style="flex: 1"
            />
            <button type="button" class="btn sm" @click="loadChallenge">
              🔄 {{ tr('换一题', 'Refresh') }}
            </button>
          </div>
        </div>
      </template>

      <p v-if="errorMsg" style="margin: 0; color: var(--dg); font-size: 12.5px">
        {{ errorMsg }}
      </p>

      <div class="tut-actions" style="margin-top: 6px">
        <button type="button" class="btn sm" @click="uiStore.closeModal('auth')">
          {{ tr('取消', 'Cancel') }}
        </button>
        <button type="submit" class="btn primary sm" :disabled="authStore.loading">
          {{
            authStore.loading
              ? tr('请稍候…', 'Please wait…')
              : mode === 'login'
                ? tr('登录', 'Sign In')
                : tr('立即注册', 'Create Account')
          }}
        </button>
      </div>
    </form>
  </Modal>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { useI18n } from '../../composables/useI18n';
import { useToast } from '../../composables/useToast';
import { useAuthStore } from '../../stores/auth';
import { useAIStore } from '../../stores/ai';
import { useSyncStore } from '../../stores/sync';
import { useUIStore } from '../../stores/ui';
import Modal from '../base/Modal.vue';

const uiStore = useUIStore();
const authStore = useAuthStore();
const syncStore = useSyncStore();
const aiStore = useAIStore();
const { tr } = useI18n();
const { toast } = useToast();

const mode = ref<'login' | 'register'>('login');
const email = ref('');
const password = ref('');
const inviteCode = ref('');
const challengeQuestion = ref('');
const challengeToken = ref('');
const challengeAnswer = ref('');
const registerMode = ref<'open' | 'invite' | 'closed'>('open');
const errorMsg = ref('');

async function loadChallenge() {
  const ch = await authStore.fetchChallenge();
  if (ch) {
    challengeQuestion.value = ch.question;
    challengeToken.value = ch.token;
    registerMode.value = ch.registerMode;
    challengeAnswer.value = '';
  }
}

function switchMode(next: 'login' | 'register') {
  mode.value = next;
  errorMsg.value = '';
  if (next === 'register') {
    void loadChallenge();
  }
}

watch(
  () => uiStore.modals.auth,
  (open) => {
    if (open) {
      errorMsg.value = '';
      if (mode.value === 'register') {
        void loadChallenge();
      }
    }
  }
);

async function onSubmit() {
  errorMsg.value = '';
  try {
    if (mode.value === 'login') {
      await authStore.login(email.value, password.value);
      toast(tr('登录成功 ✓', 'Signed in ✓'), 'ok');
    } else {
      await authStore.register({
        email: email.value,
        password: password.value,
        inviteCode: inviteCode.value || undefined,
        challengeToken: challengeToken.value || undefined,
        challengeAnswer: challengeAnswer.value || undefined
      });
      toast(tr('注册并登录成功 ✓', 'Account created ✓'), 'ok');
    }
    uiStore.closeModal('auth');
    await syncStore.onAuthSuccess();
    void aiStore.loadCloudConfig();
  } catch (err: any) {
    errorMsg.value = err?.message || tr('操作失败，请重试', 'Operation failed');
    if (mode.value === 'register') {
      void loadChallenge();
    }
  }
}
</script>
