<template>
  <span class="pill" :class="[tone, size === 'sm' ? 'sm' : '']">
    <component :is="icon" v-if="icon" />
    <slot />
  </span>
</template>

<script setup lang="ts">
import type { Component } from 'vue';

withDefaults(
  defineProps<{
    /** Visual tone or entity kind. */
    tone?:
      | ''
      | 'accent'
      | 'ok'
      | 'warn'
      | 'danger'
      | 'info'
      | 'outline'
      | 'k-world'
      | 'k-org'
      | 'k-char'
      | 'k-article'
      | 'k-glossary';
    size?: 'sm' | 'md';
    icon?: Component;
  }>(),
  { tone: '', size: 'md' }
);
</script>
