<template>
  <Modal
    :model-value="confirmVisible"
    :title="confirmTitle"
    max-width="460px"
    persistent
    level="confirm"
  >
    <p
      style="
        margin: 0;
        color: var(--mu);
        font-size: var(--fs-13);
        line-height: 1.7;
        white-space: pre-wrap;
      "
    >
      {{ confirmMessage }}
    </p>
    <template #footer>
      <button type="button" class="btn sm" @click="resolveConfirm(false)">
        {{ tr('取消', 'Cancel') }}
      </button>
      <button ref="okRef" type="button" class="btn primary sm" @click="resolveConfirm(true)">
        {{ tr('确定', 'OK') }}
      </button>
    </template>
  </Modal>
</template>

<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';
import { useConfirm } from '../../composables/useConfirm';
import { useI18n } from '../../composables/useI18n';
import Modal from './Modal.vue';

const { confirmVisible, confirmTitle, confirmMessage, resolveConfirm } = useConfirm();
const { tr } = useI18n();
const okRef = ref<HTMLButtonElement | null>(null);

watch(confirmVisible, (v) => {
  if (v) void nextTick(() => okRef.value?.focus());
});
</script>
