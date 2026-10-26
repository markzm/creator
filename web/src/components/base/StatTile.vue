<template>
  <div class="stat-tile" :class="tone ? 'tone-' + tone : ''">
    <span v-if="icon" class="stat-icon"><component :is="icon" /></span>
    <div style="min-width: 0">
      <div class="stat-value" :style="valueColor ? { color: valueColor } : undefined">
        <slot name="value">{{ value }}</slot>
      </div>
      <div class="stat-label">{{ label }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Component } from 'vue';

defineProps<{
  value?: string | number;
  label: string;
  icon?: Component;
  tone?: 'ok' | 'warn' | 'world' | 'article' | '';
  valueColor?: string;
}>();
</script>
