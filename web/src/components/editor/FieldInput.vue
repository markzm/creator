<template>
  <div
    class="f"
    :class="{
      wide: Boolean(field.w),
      'hint-open': showHint,
      invalid: invalid,
      'just-filled': justFilled,
      readonly: readonly
    }"
    :data-fid="field.id"
  >
    <div class="f-head">
      <label :for="'f-' + field.id">{{ label }}</label>
      <span class="tag" :class="field.r ? 'req' : 'opt'">
        {{ field.r ? t.req : t.opt }}
      </span>
      <div class="f-btns">
        <button
          type="button"
          :class="{ on: showHint }"
          :title="tr('显示 / 隐藏提示', 'Toggle hint')"
          @click="showHint = !showHint"
        >
          ?
        </button>
        <button
          v-if="!readonly"
          type="button"
          :title="tr('随机灵感（Shift+点击追加）', 'Random (Shift = append)')"
          @click="onRoll($event)"
        >
          🎲
        </button>
        <button
          v-if="!readonly"
          type="button"
          :title="tr('AI 智能生成 / 扩写该字段', 'AI Generate / Expand')"
          @click="onAIGen($event)"
        >
          ✨
        </button>
        <button
          v-if="!readonly"
          type="button"
          class="danger-btn"
          :title="t.clear"
          @click="updateVal('')"
        >
          ✕
        </button>
      </div>
    </div>

    <p class="hint">
      <span>{{ hintText }}</span>
    </p>

    <textarea
      v-if="field.w"
      :id="'f-' + field.id"
      ref="textareaRef"
      :data-id="field.id"
      rows="3"
      :class="{ expanded: isExpanded }"
      :placeholder="field.ph || ''"
      :value="modelValue"
      :readonly="readonly"
      @input="onInput"
      @blur="$emit('blur', field.id)"
    />
    <input
      v-else
      :id="'f-' + field.id"
      :data-id="field.id"
      type="text"
      :placeholder="field.ph || ''"
      :value="modelValue"
      :readonly="readonly"
      @input="onInput"
      @blur="$emit('blur', field.id)"
    />

    <p class="err">{{ t.requiredField }}</p>

    <div class="meta">
      <span>{{ charCount ? t.wText(charCount) : '' }}</span>
      <button
        v-if="field.w && (modelValue || '').length > 80"
        type="button"
        class="expand-btn"
        @click="isExpanded = !isExpanded"
      >
        {{ isExpanded ? t.collapse : t.expand }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from '../../composables/useI18n';
import type { LegacyFieldDef } from '../../core/legacy/fields';

const props = defineProps<{
  field: LegacyFieldDef;
  modelValue: string;
  invalid?: boolean;
  readonly?: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', val: string): void;
  (e: 'roll', fieldId: string, isTextarea: boolean, append: boolean): void;
  (e: 'aiGen', fieldId: string, isTextarea: boolean, append: boolean): void;
  (e: 'blur', fieldId: string): void;
}>();

const { lang, t, tr } = useI18n();
const showHint = ref(false);
const isExpanded = ref(false);
const justFilled = ref(false);
const textareaRef = ref<HTMLTextAreaElement | null>(null);

const label = computed(() =>
  lang.value === 'zh' ? props.field.l : props.field.lE || props.field.l
);

const hintText = computed(() => props.field.h || '');

const charCount = computed(() => (props.modelValue || '').length);

function updateVal(val: string) {
  if (props.readonly) return;
  emit('update:modelValue', val);
}

function onInput(e: Event) {
  if (props.readonly) return;
  const target = e.target as HTMLInputElement | HTMLTextAreaElement;
  updateVal(target.value);
}

function onRoll(e: MouseEvent) {
  if (props.readonly) return;
  emit('roll', props.field.id, Boolean(props.field.w), e.shiftKey);
  justFilled.value = false;
  setTimeout(() => {
    justFilled.value = true;
  }, 10);
}

function onAIGen(e: MouseEvent) {
  if (props.readonly) return;
  emit('aiGen', props.field.id, Boolean(props.field.w), e.shiftKey);
}
</script>
