<template>
  <div :style="{ display: 'flex', flexDirection: 'column', gap: '8px' }" aria-hidden="true">
    <template v-if="variant === 'card'">
      <span v-for="i in count" :key="i" class="skeleton card" />
    </template>
    <template v-else-if="variant === 'row'">
      <div v-for="i in count" :key="i" style="display: flex; align-items: center; gap: 10px">
        <span class="skeleton avatar" />
        <div style="flex: 1; display: flex; flex-direction: column; gap: 6px">
          <span class="skeleton title" />
          <span class="skeleton line" style="width: 85%" />
        </div>
      </div>
    </template>
    <template v-else>
      <span v-for="i in count" :key="i" class="skeleton line" :style="{ width: i === count ? '60%' : '100%' }" />
    </template>
  </div>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    variant?: 'line' | 'row' | 'card';
    count?: number;
  }>(),
  { variant: 'line', count: 3 }
);
</script>
