<template>
  <section class="locked-gate">
    <span class="gate-icon"><component :is="icon || Lock" /></span>
    <h2>{{ title }}</h2>
    <p>{{ description }}</p>
    <div class="gate-actions">
      <slot>
        <button type="button" class="btn primary lg" @click="uiStore.openModal('auth')">
          <LogIn /> {{ tr('登录 / 注册', 'Sign in / Register') }}
        </button>
        <button type="button" class="btn lg" @click="router.push('/char')">
          <BookOpen /> {{ tr('浏览官方范例', 'Browse the examples') }}
        </button>
      </slot>
    </div>
  </section>
</template>

<script setup lang="ts">
import { BookOpen, Lock, LogIn } from 'lucide-vue-next';
import type { Component } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from '../../composables/useI18n';
import { useUIStore } from '../../stores/ui';

defineProps<{
  title: string;
  description: string;
  icon?: Component;
}>();

const uiStore = useUIStore();
const router = useRouter();
const { tr } = useI18n();
</script>
