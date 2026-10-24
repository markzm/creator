<template>
  <button
    :type="type"
    class="btn"
    :class="[
      variant ? variant : '',
      size ? size : '',
      icon ? 'icon' : ''
    ]"
    :disabled="disabled"
  >
    <slot />
  </button>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    type?: 'button' | 'submit' | 'reset';
    variant?: 'primary' | 'danger' | 'ghost' | '';
    size?: 'sm' | 'lg' | '';
    icon?: boolean;
    disabled?: boolean;
  }>(),
  {
    type: 'button',
    variant: '',
    size: '',
    icon: false,
    disabled: false
  }
);
</script>
