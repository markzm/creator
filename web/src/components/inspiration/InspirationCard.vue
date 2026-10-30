<template>
  <RouterLink :to="{ path: '/inspiration', query: { item: item.id } }" class="inspiration-card">
    <div class="inspiration-cover">
      <VisualImage :src="asset?.src" :alt="item.description" :position="item.position" :fallback="'从一句设定开始想象'" />
      <span class="image-credit">{{ inspirationSourceLabel(item) }}</span>
      <span class="inspiration-number" aria-hidden="true">{{ String(index + 1).padStart(2, '0') }}</span>
    </div>
    <div class="inspiration-copy"><div class="inspiration-meta"><span>{{ genreLabels[item.genre] }}</span><span>{{ item.kind === 'character' ? '角色灵感' : '场景灵感' }}</span></div>
      <h3>{{ item.title }}</h3><p>{{ item.description }}</p>
      <div class="inspiration-footer"><span>{{ item.tags.slice(0, 2).join(' · ') }}</span><span class="discover">展开想象 <ArrowUpRight :size="15" /></span></div>
    </div>
  </RouterLink>
</template>
<script setup lang="ts">
import { computed } from 'vue';
import { ArrowUpRight } from 'lucide-vue-next';
import VisualImage from '../base/VisualImage.vue';
import { genreLabels, inspirationAsset, inspirationSourceLabel, type InspirationItem } from '../../data/inspiration';
const props = withDefaults(defineProps<{ item: InspirationItem; index?: number }>(), { index: 0 });
const asset = computed(() => inspirationAsset(props.item.id));
</script>
<style scoped>
.inspiration-card { display: flex; flex-direction: column; border: 1px solid var(--li); border-radius: 18px; overflow: hidden; color: var(--ink); text-decoration: none; background: var(--card); transition: transform .2s, box-shadow .2s; min-width: 0; }
.inspiration-card:hover { transform: translateY(-3px); box-shadow: var(--el-3); }
.inspiration-card:focus-visible { outline: 3px solid var(--ac); outline-offset: 3px; }
.inspiration-cover { aspect-ratio: 8 / 5; position: relative; overflow: hidden; }
.inspiration-cover .visual-image { height: 100%; }
.image-credit { position: absolute; left: 12px; bottom: 12px; color: white; background: #171a2bb8; backdrop-filter: blur(8px); padding: 4px 8px; border-radius: 6px; font-size: 10px; }
.inspiration-number { position: absolute; right: 14px; top: 12px; color: white; text-shadow: 0 1px 6px #0009; font-size: 12px; letter-spacing: .1em; }
.inspiration-copy { padding: 18px; flex: 1; display: flex; flex-direction: column; }
.inspiration-meta { display: flex; gap: 8px; font-size: 10px; font-weight: 700; color: var(--ac); letter-spacing: .04em; }
.inspiration-meta span + span { color: var(--mu); }
h3 { font-size: 16px; margin: 9px 0; line-height: 1.5; }
p { font-size: 12px; color: var(--mu); line-height: 1.8; margin: 0; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.inspiration-footer { display: flex; justify-content: space-between; gap: 6px; align-items: center; font-size: 10px; margin-top: auto; padding-top: 18px; color: var(--mu); }
.discover { display: inline-flex; align-items: center; gap: 4px; color: var(--ac); font-weight: 600; }
@media (prefers-reduced-motion: reduce) { .inspiration-card { transition: none; } .inspiration-card:hover { transform: none; } }
</style>
