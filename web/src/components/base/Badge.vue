<template>
  <span class="tag" :class="variant === 'req' ? 'req' : 'opt'">
    <slot />
  </span>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    variant?: 'req' | 'opt';
  }>(),
  {
    variant: 'opt'
  }
);
</script>
