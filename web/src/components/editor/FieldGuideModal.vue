<template>
  <Modal
    v-model="uiStore.modals.guide"
    :step-label="`${idx + 1} / ${fields.length || 1}`"
    :title="currentLabel"
    max-width="540px"
  >
    <p style="margin: 0 0 12px; color: var(--mu); font-size: 13.5px">
      {{ currentHint }}
    </p>
    <textarea
      v-if="currentField"
      ref="inputRef"
      rows="4"
      :placeholder="currentField.ph || ''"
      :value="currentValue"
      @input="onInput"
    />
    <template #footer>
      <span class="row-help" style="margin-right: auto">
        {{ idx + 1 }} / {{ fields.length }}
      </span>
      <button type="button" class="btn sm" @click="nextStep">
        {{ t.skip }}
      </button>
      <button type="button" class="btn primary sm" @click="nextStep">
        {{ t.next }}
      </button>
      <button type="button" class="btn sm" @click="closeGuide">
        {{ t.exit }}
      </button>
    </template>
  </Modal>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { useI18n } from '../../composables/useI18n';
import { useToast } from '../../composables/useToast';
import type { LegacyFieldDef } from '../../core/legacy/fields';
import { useDocStore } from '../../stores/doc';
import { useUIStore } from '../../stores/ui';
import Modal from '../base/Modal.vue';

const uiStore = useUIStore();
const docStore = useDocStore();
const { lang, t } = useI18n();
const { toast } = useToast();

const idx = ref(0);
const inputRef = ref<HTMLTextAreaElement | null>(null);

const fields = computed<LegacyFieldDef[]>(() => {
  const ctx = uiStore.guideContext;
  if (!ctx) return [];
  return ctx.groups.flatMap((g) => g.f);
});

const currentField = computed<LegacyFieldDef | null>(() => fields.value[idx.value] || null);

const currentLabel = computed(() => {
  if (!currentField.value) return t.value.guide;
  return lang.value === 'zh'
    ? currentField.value.l
    : currentField.value.lE || currentField.value.l;
});

const currentHint = computed(() => currentField.value?.h || '');

const activeEntity = computed(() => {
  const mode = uiStore.guideContext?.mode;
  if (mode === 'world') return docStore.activeWorld;
  if (mode === 'org') return docStore.activeOrg;
  if (mode === 'char') return docStore.activeChar;
  return null;
});

const currentValue = computed(() => {
  if (!activeEntity.value || !currentField.value) return '';
  return activeEntity.value.data[currentField.value.id] || '';
});

watch(
  () => uiStore.modals.guide,
  (open) => {
    if (open) {
      idx.value = 0;
      nextTick(() => inputRef.value?.focus());
    }
  }
);

function onInput(e: Event) {
  const val = (e.target as HTMLTextAreaElement).value;
  const ent = activeEntity.value;
  const f = currentField.value;
  const mode = uiStore.guideContext?.mode;
  if (!ent || !f || !mode) return;
  ent.data[f.id] = val;
  docStore.syncEntityName(mode, ent);
  docStore.touch();
}

function nextStep() {
  if (idx.value + 1 >= fields.value.length) {
    toast(t.value.guideDone, 'ok');
    uiStore.closeModal('guide');
    return;
  }
  idx.value++;
  nextTick(() => inputRef.value?.focus());
}

function closeGuide() {
  uiStore.closeModal('guide');
  toast(t.value.guideOff);
}
</script>
