<template>
  <RouterLink v-if="item" :to="{ path: '/inspiration', query: { item: item.id } }" class="inspiration-origin">
    <VisualImage v-if="image" :src="image.src" :alt="item.title" :width="64" :height="48" />
    <Compass v-else :size="20" /><span><small>灵感来源 · {{ inspirationSourceLabel(item) }}</small><strong>{{ item.title }}</strong></span><ArrowUpRight :size="16" />
  </RouterLink>
</template>
<script setup lang="ts">
import { computed } from 'vue';
import { ArrowUpRight, Compass } from 'lucide-vue-next';
import { getInspiration, inspirationAsset, inspirationSourceLabel } from '../../data/inspiration';
import VisualImage from '../base/VisualImage.vue';
const props = defineProps<{ id?: string }>();
const item = computed(() => getInspiration(props.id));
const image = computed(() => props.id && inspirationAsset(props.id));
</script>
<style scoped>
.inspiration-origin { display: flex; align-items: center; gap: 12px; border: 1px solid var(--li); padding: 10px; border-radius: 12px; background: var(--soft); text-decoration: none; color: var(--ac); margin: 12px 0; min-width: 0; }
.visual-image { width: 64px; height: 48px; border-radius: 7px; flex-shrink: 0; }
span { min-width: 0; flex: 1; } small { display: block; font-size: 10px; color: var(--mu); margin-bottom: 4px; } strong { display: block; font-size: 12px; overflow-wrap: anywhere; }
</style>
