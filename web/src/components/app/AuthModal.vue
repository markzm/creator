<template>
  <Modal
    v-model="uiStore.modals.auth"
    :title="mode === 'login' ? tr('登录云端账号', 'Sign In') : tr('注册新账号', 'Create Account')"
    max-width="440px"
  >
    <SegmentedTabs
      v-if="mode !== 'forgot'"
      :model-value="mode"
      :items="[
        { value: 'login', label: tr('登录', 'Sign in') },
        { value: 'register', label: tr('注册', 'Register') }
      ]"
      style="margin-bottom: 14px; width: 100%; display: flex"
      @update:model-value="(v) => switchMode(v as 'login' | 'register')"
    />

    <form style="display: flex; flex-direction: column; gap: 12px" @submit.prevent="onSubmit">
      <p v-if="mode === 'forgot'" class="hint" style="margin: 0">
        {{ tr('输入注册邮箱，我们会发送一封包含重置令牌的邮件（15 分钟内有效）。', 'Enter your account email; we will send a reset token valid for 15 minutes.') }}
      </p>
      <div>
        <label class="f-label">{{ tr('邮箱账号', 'Email') }}</label>
        <input
          v-model="email"
          type="email"
          required
          placeholder="you@example.com"
          autocomplete="email"
        />
      </div>

      <div v-if="mode !== 'forgot'">
        <label class="f-label">{{ tr('密码（至少 8 位，含字母与数字）', 'Password (min 8 chars, letters + digits)') }}</label>
        <input
          v-model="password"
          type="password"
          required
          minlength="8"
          placeholder="••••••••"
          :autocomplete="mode === 'register' ? 'new-password' : 'current-password'"
        />
        <button
          v-if="mode === 'login' && smtpEnabled"
          type="button"
          class="btn sm ghost"
          style="margin-top: 4px; padding-left: 0"
          @click="switchMode('forgot')"
        >
          {{ tr('忘记密码？', 'Forgot password?') }}
        </button>
      </div>

      <template v-if="mode === 'register'">
        <div v-if="registerMode === 'invite'">
          <label class="f-label">{{ tr('邀请码', 'Invite Code') }}</label>
          <input
            v-model="inviteCode"
            type="text"
            required
            :placeholder="tr('请输入邀请码', 'Invite code')"
          />
        </div>

        <div v-if="challengeQuestion">
          <label class="f-label">
            {{ tr('安全验证：', 'Security check: ') }}
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
              <RefreshCw /> {{ tr('换一题', 'Refresh') }}
            </button>
          </div>
        </div>
      </template>

      <p v-if="errorMsg" style="margin: 0; color: var(--dg); font-size: 12.5px">
        {{ errorMsg }}
      </p>

      <div style="display: flex; gap: 8px; justify-content: flex-end; margin-top: 6px">
        <button v-if="mode === 'forgot'" type="button" class="btn sm" @click="switchMode('login')">
          {{ tr('返回登录', 'Back to sign in') }}
        </button>
        <button v-else type="button" class="btn sm" @click="uiStore.closeModal('auth')">
          {{ tr('取消', 'Cancel') }}
        </button>
        <button type="submit" class="btn primary sm" :disabled="authStore.loading || busy">
          {{
            authStore.loading || busy
              ? tr('请稍候…', 'Please wait…')
              : mode === 'login'
                ? tr('登录', 'Sign in')
                : mode === 'register'
                  ? tr('立即注册', 'Create account')
                  : tr('发送重置邮件', 'Send reset email')
          }}
        </button>
      </div>
    </form>
  </Modal>
</template>

<script setup lang="ts">
import { RefreshCw } from 'lucide-vue-next';
import { ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from '../../composables/useI18n';
import { api } from '../../data/api';
import SegmentedTabs from '../base/SegmentedTabs.vue';
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

const route = useRoute();
const router = useRouter();
const mode = ref<'login' | 'register' | 'forgot'>('login');
const smtpEnabled = ref(false);
const busy = ref(false);
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
    smtpEnabled.value = Boolean(ch.smtpEnabled);
    challengeAnswer.value = '';
  }
}

function switchMode(next: 'login' | 'register' | 'forgot') {
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
      // Also learns whether SMTP (forgot-password) is available.
      void loadChallenge();
    }
  }
);

async function onSubmit() {
  errorMsg.value = '';
  if (mode.value === 'forgot') {
    busy.value = true;
    try {
      await api.forgotPassword(email.value.trim());
      toast(tr('如果该邮箱已注册，重置邮件已发送', 'If that address is registered, a reset email is on its way'), 'ok');
      uiStore.closeModal('auth');
      await router.push('/reset');
    } catch (err: any) {
      errorMsg.value = err?.message || tr('发送失败', 'Could not send');
    } finally {
      busy.value = false;
    }
    return;
  }
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
    // Continue to where the guest was heading (router guard put it in ?next=).
    const next = typeof route.query.next === 'string' && route.query.next.startsWith('/') ? route.query.next : null;
    if (route.name === 'welcome') {
      await router.push(next || '/');
    }
  } catch (err: any) {
    errorMsg.value = err?.message || tr('操作失败，请重试', 'Operation failed');
    if (mode.value === 'register') {
      void loadChallenge();
    }
  }
}
</script>
