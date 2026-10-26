<template>
  <div class="seg" role="tablist">
    <button
      v-for="item in items"
      :key="item.value"
      type="button"
      role="tab"
      :aria-selected="modelValue === item.value"
      :class="{ active: modelValue === item.value }"
      @click="$emit('update:modelValue', item.value)"
    >
      <component :is="item.icon" v-if="item.icon" />
      <span>{{ item.label }}</span>
      <span v-if="item.count !== undefined" class="pill sm" style="margin-left: 2px">{{ item.count }}</span>
    </button>
  </div>
</template>

<script setup lang="ts">
import type { Component } from 'vue';

defineProps<{
  modelValue: string;
  items: Array<{ label: string; value: string; icon?: Component; count?: number | string }>;
}>();

defineEmits<{
  (e: 'update:modelValue', val: string): void;
}>();
</script>
