<template>
  <div v-if="issues.length" class="consistency show">
    <h4>⚠️ {{ tr('设定一致性提醒', 'Consistency Checks') }} ({{ issues.length }})</h4>
    <ul>
      <li v-for="(issue, i) in issues" :key="i">{{ issue }}</li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from '../../composables/useI18n';

defineProps<{
  issues: string[];
}>();

const { tr } = useI18n();
</script>
