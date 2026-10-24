<template>
  <Teleport to="body">
    <div v-if="modelValue" class="tut-mask show" @click.self="close">
      <div class="tut-box" :style="{ maxWidth: maxWidth || '540px' }">
        <div v-if="stepLabel" class="tut-step">{{ stepLabel }}</div>
        <h3 v-if="title" style="margin: 0 0 14px">{{ title }}</h3>
        <slot />
        <div v-if="$slots.footer" class="tut-actions" style="margin-top: 16px">
          <slot name="footer" />
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
const props = defineProps<{
  modelValue: boolean;
  title?: string;
  stepLabel?: string;
  maxWidth?: string;
  persistent?: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', val: boolean): void;
  (e: 'close'): void;
}>();

function close() {
  if (props.persistent) return;
  emit('update:modelValue', false);
  emit('close');
}
</script>
