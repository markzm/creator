<template>
  <Modal
    v-model="uiStore.modals.tutorial"
    :step-label="`STEP ${stepIdx + 1} / ${tutSteps.length}`"
    :title="currentStep[0]"
    max-width="520px"
  >
    <p style="margin: 0 0 18px; color: var(--mu); line-height: 1.7; font-size: 13.5px">
      {{ currentStep[1] }}
    </p>
    <template #footer>
      <div class="tut-dots">
        <span
          v-for="(_, i) in tutSteps"
          :key="i"
          :class="{ on: i === stepIdx }"
        />
      </div>
      <button type="button" class="btn sm" @click="uiStore.markTutorialDone()">
        {{ t.tutSkip }}
      </button>
      <button type="button" class="btn primary sm" @click="onNext">
        {{ stepIdx === tutSteps.length - 1 ? t.tutDone : t.tutNext }}
      </button>
    </template>
  </Modal>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from '../../composables/useI18n';
import { useUIStore } from '../../stores/ui';
import Modal from '../base/Modal.vue';

const uiStore = useUIStore();
const { t, tutSteps } = useI18n();

const stepIdx = ref(0);

watch(
  () => uiStore.modals.tutorial,
  (open) => {
    if (open) stepIdx.value = 0;
  }
);

const currentStep = computed<[string, string]>(() => {
  return tutSteps.value[stepIdx.value] || ['', ''];
});

function onNext() {
  if (stepIdx.value + 1 >= tutSteps.value.length) {
    uiStore.markTutorialDone();
    return;
  }
  stepIdx.value++;
}
</script>
