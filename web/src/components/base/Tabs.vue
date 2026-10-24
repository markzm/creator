<template>
  <div style="display: inline-flex; gap: 4px; background: var(--li2); padding: 4px; border-radius: 10px">
    <button
      v-for="item in items"
      :key="item.value"
      type="button"
      class="btn sm"
      :class="modelValue === item.value ? 'primary' : 'ghost'"
      @click="$emit('update:modelValue', item.value)"
    >
      {{ item.label }}
    </button>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  modelValue: string;
  items: Array<{ label: string; value: string }>;
}>();

defineEmits<{
  (e: 'update:modelValue', val: string): void;
}>();
</script>
