<template>
  <div class="visual-image" :class="{ 'image-missing': failed || !src }">
    <img v-if="src && !failed" :src="src" :srcset="srcset" :sizes="sizes" :alt="alt" :width="width" :height="height"
      :loading="priority ? 'eager' : 'lazy'" :fetchpriority="priority ? 'high' : 'auto'" decoding="async"
      :style="{ objectPosition: position }" @error="failed = true" />
    <div v-else class="visual-fallback" role="img" :aria-label="alt"><ImageOff v-if="failed" aria-hidden="true" /><Sparkles v-else aria-hidden="true" /><span>{{ fallback || '图片暂不可用' }}</span></div>
  </div>
</template>
<script setup lang="ts">
import { ref, watch } from 'vue';
import { ImageOff, Sparkles } from 'lucide-vue-next';
const props = withDefaults(defineProps<{ src?: string; srcset?: string; sizes?: string; alt: string; width?: number; height?: number; position?: string; priority?: boolean; fallback?: string }>(), { width: 640, height: 400, position: '50% 50%', priority: false });
const failed = ref(false);
watch(() => props.src, () => { failed.value = false; });
</script>
<style scoped>
.visual-image { overflow: hidden; background: var(--soft); min-width: 0; position: relative; }
.visual-image img { width: 100%; height: 100%; display: block; object-fit: cover; }
.visual-fallback { width: 100%; height: 100%; min-height: 120px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; color: var(--mu); background: radial-gradient(ellipse at 20% 15%, var(--acs), transparent 65%), var(--soft); font-size: 12px; }
.visual-fallback svg { width: 30px; height: 30px; opacity: .55; }
</style>
