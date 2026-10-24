<template>
  <span>
    <template v-for="(tok, idx) in tokens" :key="idx">
      <span
        v-if="tok.type === 'ref' && tok.target"
        class="wiki-ref"
        :title="kindLabel(tok.target.kind) + ' · ' + tok.target.name"
        @click.stop="jumpToEntity(tok.target)"
      >
        <span>{{ kindIcon(tok.target.kind) }}</span>
        <span>{{ tok.text }}</span>
      </span>
      <span v-else>{{ tok.text }}</span>
    </template>
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { type EntityIndexEntry, tokenizeEntityRefs } from '../../core/backlinks';
import { useDocStore } from '../../stores/doc';

const props = defineProps<{
  text: string;
  excludeId?: string;
}>();

const docStore = useDocStore();
const router = useRouter();

const tokens = computed(() =>
  tokenizeEntityRefs(props.text || '', docStore.entityIndex, props.excludeId)
);

function kindIcon(kind: EntityIndexEntry['kind']): string {
  if (kind === 'world') return '🌍';
  if (kind === 'org') return '🏛️';
  if (kind === 'char') return '👤';
  return '📚';
}

function kindLabel(kind: EntityIndexEntry['kind']): string {
  if (kind === 'world') return '世界观';
  if (kind === 'org') return '组织';
  if (kind === 'char') return '角色';
  return '术语';
}

function jumpToEntity(target: EntityIndexEntry) {
  if (target.kind === 'world') {
    docStore.selectWorld(target.id);
    router.push('/world');
  } else if (target.kind === 'org') {
    docStore.selectOrg(target.id);
    router.push('/org');
  } else if (target.kind === 'char') {
    docStore.selectChar(target.id);
    router.push('/char');
  } else {
    router.push('/glossary');
  }
}
</script>
