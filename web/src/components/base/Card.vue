<template>
  <section class="card" :class="{ open: isOpen }">
    <div v-if="title || $slots.header" class="card-h" @click="toggle">
      <span v-if="idx" class="idx">{{ idx }}</span>
      <h3>
        <slot name="header">{{ title }}</slot>
      </h3>
      <slot name="actions" />
      <span v-if="collapsible" class="arrow">▶</span>
    </div>
    <div class="card-b" :style="!collapsible ? { display: 'block' } : undefined">
      <slot />
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';

const props = withDefaults(
  defineProps<{
    title?: string;
    idx?: string;
    open?: boolean;
    collapsible?: boolean;
  }>(),
  {
    open: true,
    collapsible: true
  }
);

const emit = defineEmits<{
  (e: 'update:open', val: boolean): void;
}>();

const isOpen = ref(props.open);

watch(
  () => props.open,
  (val) => {
    isOpen.value = val;
  }
);

function toggle() {
  if (!props.collapsible) return;
  isOpen.value = !isOpen.value;
  emit('update:open', isOpen.value);
}
</script>
