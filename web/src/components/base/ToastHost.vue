<template>
  <Teleport to="body">
    <div
      class="toast"
      :class="[toastVisible ? 'show' : '', toastType]"
      role="status"
      aria-live="polite"
    >
      {{ toastMessage }}
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { useToast } from '../../composables/useToast';

const { toastMessage, toastType, toastVisible } = useToast();
</script>
