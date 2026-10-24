<template>
  <div class="f" :class="{ wide, invalid }">
    <div v-if="label || $slots.head" class="f-head">
      <label>{{ label }}</label>
      <span v-if="badge" class="tag" :class="required ? 'req' : 'opt'">{{ badge }}</span>
      <slot name="head" />
    </div>
    <p v-if="hint" class="hint" style="display: block">{{ hint }}</p>
    <slot />
    <p v-if="invalid && errorText" class="err" style="display: block">{{ errorText }}</p>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  label?: string;
  hint?: string;
  badge?: string;
  required?: boolean;
  wide?: boolean;
  invalid?: boolean;
  errorText?: string;
}>();
</script>
