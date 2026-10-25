<template>
  <Modal
    v-model="visible"
    :title="'✨ ' + tr('AI 智能创作工坊', 'AI Worldbuilder Workshop')"
    max-width="580px"
  >
    <div style="display: flex; flex-direction: column; gap: 14px">
      <!-- Current AI Engine Badge -->
      <div style="display: flex; justify-content: space-between; align-items: center; background: var(--soft); padding: 8px 12px; border-radius: 8px; font-size: 12px">
        <span style="color: var(--mu)">
          {{ tr('当前引擎：', 'Engine: ') }}
          <strong style="color: var(--ac)">
            {{ aiStore.activeProvider === 'custom' ? `个人外部 AI (${aiStore.customAi.model || 'DeepSeek'})` : `公共免费 AI (${aiStore.selectedFreeModel})` }}
          </strong>
        </span>
        <button
          type="button"
          class="btn sm"
          style="padding: 2px 8px; font-size: 11px"
          @click="uiStore.openModal('aiConfig')"
        >
          ⚙️ {{ tr('切换引擎 / 偏好', 'Switch') }}
        </button>
      </div>

      <!-- Mode & Prompt -->
      <div>
        <label style="display: block; font-weight: 600; font-size: 13px; margin-bottom: 5px">
          {{ targetTitle }}
        </label>
        <textarea
          v-model="promptInput"
          rows="3"
          :placeholder="promptPlaceholder"
        />
      </div>

      <!-- Result Area -->
      <div v-if="generatedContent" style="display: flex; flex-direction: column; gap: 6px">
        <div style="display: flex; justify-content: space-between; align-items: center">
          <label style="font-weight: 600; font-size: 13px">
            {{ tr('生成结果（可直接修改）：', 'Generated Output (Editable):') }}
          </label>
          <span style="font-size: 11px; color: var(--mu)">
            {{ generatedContent.length }} {{ tr('字', 'chars') }}
          </span>
        </div>
        <textarea
          v-model="generatedContent"
          rows="6"
          style="font-size: 13px; line-height: 1.6"
        />
      </div>

      <p v-if="errorMsg" style="margin: 0; color: var(--dg); font-size: 12px">
        {{ errorMsg }}
      </p>
    </div>

    <template #footer>
      <button type="button" class="btn sm" @click="visible = false">
        {{ tr('取消', 'Cancel') }}
      </button>
      <button
        type="button"
        class="btn sm"
        :disabled="aiStore.loading"
        @click="onGenerate"
      >
        {{ aiStore.loading ? tr('生成中…', 'Generating…') : (generatedContent ? tr('重新生成', 'Regenerate') : '✨ ' + tr('开始生成', 'Generate')) }}
      </button>
      <button
        v-if="generatedContent"
        type="button"
        class="btn primary sm"
        @click="onApply"
      >
        {{ tr('应用到当前设定', 'Apply to Sheet') }}
      </button>
    </template>
  </Modal>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from '../../composables/useI18n';
import { useToast } from '../../composables/useToast';
import type { EntityKind } from '../../core/schema/types';
import { useAIStore } from '../../stores/ai';
import { useUIStore } from '../../stores/ui';
import Modal from '../base/Modal.vue';

const props = defineProps<{
  modelValue: boolean;
  kind: EntityKind | 'article';
  fieldId?: string;
  fieldLabel?: string;
  currentValue?: string;
  entityData?: Record<string, string>;
  context?: string;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', val: boolean): void;
  (e: 'apply', content: string): void;
}>();

const uiStore = useUIStore();
const aiStore = useAIStore();
const { tr } = useI18n();
const { toast } = useToast();

const promptInput = ref('');
const generatedContent = ref('');
const errorMsg = ref('');

const visible = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val)
});

const targetTitle = computed(() => {
  if (props.fieldLabel) {
    return tr(`为字段「${props.fieldLabel}」提供灵感要求（可选）：`, `Inspiration for "${props.fieldLabel}":`);
  }
  const kindNames: Record<string, string> = {
    world: '世界观',
    org: '组织',
    char: '角色',
    article: '文章'
  };
  return tr(`构思设定主题或核心要素（可选）：`, `Theme or core ideas:`);
});

const promptPlaceholder = computed(() => {
  if (props.fieldLabel) {
    return tr('例：希望带有神秘诡谲的色彩，反差感强烈…（可留空随机生成）', 'e.g. mysterious, sharp contrast…');
  }
  return tr('例：蒸汽朋克风格的空中探险家，性格幽默护短，右眼带机械义眼…（可留空随机发挥）', 'e.g. Steampunk sky explorer, witty and protective…');
});

async function onGenerate() {
  errorMsg.value = '';
  try {
    const task = props.fieldId ? 'field_gen' : 'entity_gen';
    const res = await aiStore.generate({
      task,
      fieldId: props.fieldId,
      fieldLabel: props.fieldLabel,
      entityKind: props.kind,
      entityData: props.entityData,
      currentText: props.currentValue,
      prompt: promptInput.value,
      context: props.context
    });
    generatedContent.value = res.content;
    toast(tr('生成完成 ✓', 'Generated ✓'), 'ok');
  } catch (err: any) {
    errorMsg.value = err?.message || tr('生成失败，请检查网络或 AI 设置', 'Generation failed');
  }
}

function onApply() {
  if (!generatedContent.value) return;
  emit('apply', generatedContent.value);
  visible.value = false;
  toast(tr('已应用设定 ✓', 'Applied ✓'), 'ok');
}
</script>
