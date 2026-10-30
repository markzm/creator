<template>
  <section class="inspiration-shelf">
    <div class="shelf-heading"><div><div class="page-eyebrow">A LITTLE SPARK</div><h2>{{ title || '故事，也许从这一眼开始' }}</h2><p>一处场景、一个陌生人，或一句还没说出口的话。</p></div>
      <RouterLink class="btn sm ghost" to="/inspiration">全部灵感 <ArrowRight :size="16" /></RouterLink></div>
    <div class="shelf-grid"><InspirationCard v-for="(item, index) in items" :key="item.id" :item="item" :index="index" /></div>
  </section>
</template>
<script setup lang="ts">
import { ArrowRight } from 'lucide-vue-next';
import { inspirations, inspirationAsset } from '../../data/inspiration';
import InspirationCard from './InspirationCard.vue';
defineProps<{ title?: string }>();
const featuredIds = ['sky-islands', 'forest-courier', 'summer-rooftop'];
const items = [...inspirations].sort((a, b) => Number(Boolean(inspirationAsset(b.id))) - Number(Boolean(inspirationAsset(a.id))) || Number(featuredIds.includes(b.id)) - Number(featuredIds.includes(a.id))).slice(0, 3);
</script>
<style scoped>
.inspiration-shelf { margin: 36px 0; }
.shelf-heading { display: flex; justify-content: space-between; align-items: end; gap: 16px; margin-bottom: 20px; }
h2 { font-size: 23px; letter-spacing: -.035em; margin: 5px 0 8px; }
p { margin: 0; color: var(--mu); font-size: 12px; line-height: 1.7; }
.shelf-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 18px; }
@media (max-width: 950px) { .shelf-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 600px) { .shelf-grid { grid-template-columns: 1fr; } .shelf-heading { align-items: start; flex-direction: column; gap: 6px; } h2 { font-size: 21px; } }
</style>
