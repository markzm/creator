<template>
  <div class="empty-state">
    <span v-if="icon" class="empty-icon"><component :is="icon" /></span>
    <h4 v-if="title">{{ title }}</h4>
    <p v-if="description">{{ description }}</p>
    <div v-if="$slots.default" class="empty-actions">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Component } from 'vue';

defineProps<{
  icon?: Component;
  title?: string;
  description?: string;
}>();
</script>
