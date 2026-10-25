<template>
  <div class="progress">
    <span class="stat" style="white-space: nowrap">{{ t.pText(done, total) }}</span>
    <div class="pbar">
      <div :style="{ width: pct + '%' }" />
    </div>
    <span class="stat" style="white-space: nowrap">{{ t.wText(charCount) }}</span>
    <span v-if="savedTimeStr" class="saved-badge" style="color: var(--ok); font-weight: 600; white-space: nowrap">
      <span class="hide-micro">{{ tr('已保存 ', 'Saved ') }}</span>✓ {{ savedTimeStr }}
    </span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from '../../composables/useI18n';

const props = defineProps<{
  done: number;
  total: number;
  pct: number;
  charCount: number;
  lastSavedAt?: number | null;
}>();

const { t, tr } = useI18n();

const savedTimeStr = computed(() => {
  if (!props.lastSavedAt) return '';
  const d = new Date(props.lastSavedAt);
  return (
    String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0')
  );
});
</script>

<style scoped>
@media (max-width: 480px) {
  .hide-micro {
    display: none;
  }
}
</style>
