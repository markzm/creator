<template>
  <section class="card" :class="{ open: isOpen }">
    <div class="card-h" @click="toggle">
      <span class="idx">{{ String(index + 1).padStart(2, '0') }}</span>
      <h3>{{ groupTitle }}</h3>
      <button type="button" class="clr-group" @click.stop="onClearGroup">
        {{ t.clearGroup }}
      </button>
      <span class="arrow">▶</span>
    </div>
    <div class="card-b">
      <div class="grid">
        <FieldInput
          v-for="f in group.f"
          :key="f.id"
          :field="f"
          :model-value="data[f.id] || ''"
          :invalid="invalidFields?.has(f.id)"
          @update:model-value="(val) => onUpdateField(f.id, val)"
          @roll="(fid, isTa, append) => $emit('roll', fid, isTa, append)"
          @blur="(fid) => $emit('fieldBlur', fid)"
        />
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useConfirm } from '../../composables/useConfirm';
import { useI18n } from '../../composables/useI18n';
import { useToast } from '../../composables/useToast';
import type { LegacyFieldGroup } from '../../core/legacy/fields';
import FieldInput from './FieldInput.vue';

const props = withDefaults(
  defineProps<{
    group: LegacyFieldGroup;
    index: number;
    data: Record<string, string>;
    open?: boolean;
    invalidFields?: Set<string>;
  }>(),
  {
    open: true
  }
);

const emit = defineEmits<{
  (e: 'updateField', fieldId: string, val: string): void;
  (e: 'clearGroup', fieldIds: string[]): void;
  (e: 'roll', fieldId: string, isTextarea: boolean, append: boolean): void;
  (e: 'fieldBlur', fieldId: string): void;
}>();

const { lang, t } = useI18n();
const { confirm } = useConfirm();
const { toast } = useToast();

const isOpen = ref(props.open);

watch(
  () => props.open,
  (val) => {
    isOpen.value = val;
  }
);

const groupTitle = computed(() =>
  lang.value === 'zh' ? props.group.t : props.group.tE || props.group.t
);

function toggle() {
  isOpen.value = !isOpen.value;
}

function onUpdateField(fieldId: string, val: string) {
  emit('updateField', fieldId, val);
}

async function onClearGroup() {
  const gname = groupTitle.value;
  if (!(await confirm(t.value.clearConfirm, t.value.clearGroupConfirm(gname)))) return;
  emit(
    'clearGroup',
    props.group.f.map((f) => f.id)
  );
  toast(t.value.clearGroupDone(gname), 'ok');
}
</script>
