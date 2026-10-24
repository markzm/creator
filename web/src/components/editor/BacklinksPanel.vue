<template>
  <section class="card" :class="{ open: isOpen }">
    <div class="card-h" @click="isOpen = !isOpen">
      <span class="idx">WIKI</span>
      <h3>🔗 {{ tr('反向引用（Backlinks）', 'Backlinks') }} ({{ items.length }})</h3>
      <span class="arrow">▶</span>
    </div>
    <div class="card-b">
      <p v-if="!items.length" class="hint" style="display: block; margin: 8px 0 0">
        {{ tr('全库暂无其他条目提及此名称。', 'No other entries mention this entity yet.') }}
      </p>
      <div v-else style="display: flex; flex-direction: column; gap: 6px; margin-top: 10px">
        <div
          v-for="(item, idx) in items"
          :key="idx"
          class="sres"
          style="margin-bottom: 0"
          @click="jumpToSource(item)"
        >
          <span class="k">{{ kindBadge(item.sourceKind) }}</span>
          <strong>{{ item.sourceName }}</strong>
          <span style="font-size: 12px; color: var(--mu); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap">
            <WikiText :text="item.snippet" />
          </span>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from '../../composables/useI18n';
import type { BacklinkItem } from '../../core/backlinks';
import { useDocStore } from '../../stores/doc';
import WikiText from '../base/WikiText.vue';

defineProps<{
  items: BacklinkItem[];
}>();

const { tr } = useI18n();
const docStore = useDocStore();
const router = useRouter();
const isOpen = ref(true);

function kindBadge(kind: BacklinkItem['sourceKind']): string {
  const map: Record<BacklinkItem['sourceKind'], string> = {
    world: tr('世界观', 'World'),
    org: tr('组织', 'Org'),
    char: tr('角色', 'Char'),
    event: tr('事件', 'Event'),
    plot: tr('剧情', 'Plot'),
    scene: tr('场景', 'Scene')
  };
  return map[kind] || kind;
}

function jumpToSource(item: BacklinkItem) {
  if (item.sourceKind === 'world') {
    docStore.selectWorld(item.sourceId);
    router.push('/world');
  } else if (item.sourceKind === 'org') {
    docStore.selectOrg(item.sourceId);
    router.push('/org');
  } else if (item.sourceKind === 'char') {
    docStore.selectChar(item.sourceId);
    router.push('/char');
  } else if (item.sourceKind === 'event') {
    router.push('/timeline');
  } else if (item.sourceKind === 'plot') {
    router.push('/plots');
  } else if (item.sourceKind === 'scene') {
    router.push('/scenes');
  }
}
</script>
