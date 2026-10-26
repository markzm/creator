<template>
  <header class="page-header">
    <div style="min-width: 0">
      <div v-if="eyebrow" class="page-eyebrow">{{ eyebrow }}</div>
      <h2 class="page-title">
        <span v-if="icon" class="page-icon" :style="iconStyle"><component :is="icon" /></span>
        <span>{{ title }}</span>
        <slot name="title-extra" />
      </h2>
      <p v-if="subtitle || $slots.subtitle" class="page-sub">
        <slot name="subtitle">{{ subtitle }}</slot>
      </p>
    </div>
    <div v-if="$slots.actions" class="page-actions">
      <slot name="actions" />
    </div>
  </header>
</template>

<script setup lang="ts">
import { computed, type Component } from 'vue';

const props = defineProps<{
  title: string;
  subtitle?: string;
  eyebrow?: string;
  icon?: Component;
  /** CSS colour token for the icon chip, e.g. 'var(--k-world)'. */
  tone?: string;
}>();

const iconStyle = computed(() =>
  props.tone
    ? { background: `color-mix(in srgb, ${props.tone} 14%, transparent)`, color: props.tone }
    : undefined
);
</script>
