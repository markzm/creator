<template>
  <span
    class="avatar-box"
    :style="{
      width: sizePx,
      height: sizePx,
      fontSize: fontSizePx,
      borderRadius: '50%',
      background: 'var(--acs)',
      color: 'var(--ac)',
      border: '1px solid var(--li)',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      flexShrink: 0,
      fontWeight: 700,
      userSelect: 'none'
    }"
  >
    <img
      v-if="isImageUrl"
      :src="resolvedUrl"
      alt=""
      style="width: 100%; height: 100%; object-fit: cover; display: block"
    />
    <span v-else>{{ displayChar }}</span>
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    avatar?: string;
    name?: string;
    size?: number;
  }>(),
  {
    avatar: '',
    name: '',
    size: 40
  }
);

const sizePx = computed(() => `${props.size}px`);
const fontSizePx = computed(() => `${Math.round(props.size * 0.48)}px`);

const isImageUrl = computed(() => {
  const a = (props.avatar || '').trim();
  return a.startsWith('/') || a.startsWith('http://') || a.startsWith('https://') || a.startsWith('data:image/') || a.startsWith('img:');
});

const resolvedUrl = computed(() => {
  const a = (props.avatar || '').trim();
  if (a.startsWith('img:')) return a.slice(4);
  return a;
});

const displayChar = computed(() => {
  const a = (props.avatar || '').trim();
  if (a && !isImageUrl.value) return a;
  return (props.name || '创').trim().slice(0, 1) || '创';
});
</script>
