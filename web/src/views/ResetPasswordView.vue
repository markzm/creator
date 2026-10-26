<template>
  <div class="page narrow" style="max-width: 460px">
    <PageHeader :title="tr('重置密码', 'Reset password')" :icon="KeyRound" :subtitle="tr('输入邮件中的重置令牌并设置新密码。', 'Paste the token from the email and choose a new password.')" />
    <form class="card flat" style="padding: 20px; display: flex; flex-direction: column; gap: 12px" @submit.prevent="onSubmit">
      <div>
        <label class="f-label">{{ tr('重置令牌', 'Reset token') }}</label>
        <input v-model="token" type="text" required autocomplete="one-time-code" />
      </div>
      <div>
        <label class="f-label">{{ tr('新密码（至少 8 位，含字母与数字）', 'New password (min 8, letters + digits)') }}</label>
        <input v-model="password" type="password" required minlength="8" autocomplete="new-password" />
      </div>
      <div>
        <label class="f-label">{{ tr('再输入一次', 'Repeat password') }}</label>
        <input v-model="password2" type="password" required minlength="8" autocomplete="new-password" />
      </div>
      <p v-if="error" style="margin: 0; color: var(--dg); font-size: var(--fs-12)">{{ error }}</p>
      <div style="display: flex; gap: 8px; justify-content: flex-end">
        <button type="button" class="btn sm" @click="router.push('/welcome')">{{ tr('返回', 'Back') }}</button>
        <button type="submit" class="btn primary sm" :disabled="busy">{{ busy ? tr('提交中…', 'Working…') : tr('设置新密码', 'Set new password') }}</button>
      </div>
    </form>
  </div>
</template>

<script setup lang="ts">
import { KeyRound } from 'lucide-vue-next';
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import PageHeader from '../components/base/PageHeader.vue';
import { useI18n } from '../composables/useI18n';
import { useToast } from '../composables/useToast';
import { api } from '../data/api';
import { useUIStore } from '../stores/ui';

const route = useRoute();
const router = useRouter();
const uiStore = useUIStore();
const { tr } = useI18n();
const { toast } = useToast();

const token = ref(typeof route.query.token === 'string' ? route.query.token : '');
const password = ref('');
const password2 = ref('');
const error = ref('');
const busy = ref(false);

async function onSubmit() {
  error.value = '';
  if (password.value !== password2.value) {
    error.value = tr('两次输入的密码不一致', 'Passwords do not match');
    return;
  }
  busy.value = true;
  try {
    await api.resetPassword(token.value.trim(), password.value);
    toast(tr('密码已重置，请使用新密码登录', 'Password reset — sign in with the new one'), 'ok');
    await router.push('/welcome');
    uiStore.openModal('auth');
  } catch (err: any) {
    error.value = err?.message || tr('重置失败', 'Reset failed');
  } finally {
    busy.value = false;
  }
}
</script>
