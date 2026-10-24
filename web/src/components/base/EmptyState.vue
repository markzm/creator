<template>
  <div class="tl-empty">
    <p v-if="icon" style="font-size: 40px; margin: 0 0 8px">{{ icon }}</p>
    <h4 v-if="title" style="margin: 0 0 6px; color: var(--ink)">{{ title }}</h4>
    <p style="margin: 0">{{ description }}</p>
    <div v-if="$slots.default" style="margin-top: 14px">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  icon?: string;
  title?: string;
  description?: string;
}>();
</script>
