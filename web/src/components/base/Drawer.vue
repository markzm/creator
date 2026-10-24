<template>
  <Teleport to="body">
    <div v-if="modelValue" class="tut-mask show" style="justify-content: flex-end; padding: 0" @click.self="close">
      <div
        style="
          background: var(--card);
          width: min(480px, 100vw);
          height: 100vh;
          padding: 24px;
          overflow-y: auto;
          box-shadow: var(--shl);
          display: flex;
          flex-direction: column;
        "
      >
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px">
          <h3 style="margin: 0; font-size: 18px">{{ title }}</h3>
          <button type="button" class="btn sm icon ghost" @click="close">✕</button>
        </div>
        <div style="flex: 1; overflow-y: auto">
          <slot />
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
defineProps<{
  modelValue: boolean;
  title?: string;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', val: boolean): void;
}>();

function close() {
  emit('update:modelValue', false);
}
</script>
