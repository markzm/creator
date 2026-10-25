<template>
  <section class="card" :class="{ open: isOpen }">
    <div class="card-h" @click="isOpen = !isOpen">
      <span class="idx">CODE</span>
      <h3>🔑 {{ tr('草稿码（导入 / 导出）', 'Draft Code (Import / Export)') }}</h3>
      <span class="arrow">▶</span>
    </div>
    <div class="card-b">
      <div class="row">
        <button type="button" class="btn sm primary" @click="onGenerate">
          {{ tr('生成草稿码', 'Generate Code') }}
        </button>
        <button v-if="generatedCode" type="button" class="btn sm" @click="onCopy">
          📋 {{ tr('复制', 'Copy') }}
        </button>
        <button v-if="!readonly" type="button" class="btn sm" @click="mode = mode === 'in' ? 'out' : 'in'">
          📥 {{ tr('导入草稿码', 'Import Code') }}
        </button>
        <span v-if="generatedCode && mode === 'out'" class="row-help">
          {{ generatedCode.length }} {{ tr('字符', 'chars') }}
        </span>
      </div>

      <div v-if="mode === 'out' && generatedCode" class="code-panel">
        <textarea readonly :value="generatedCode" rows="3" />
      </div>

      <div v-if="mode === 'in'" class="code-panel">
        <textarea
          v-model="inputCode"
          :placeholder="prefix + 'r-...'"
          rows="3"
        />
        <div class="row">
          <button type="button" class="btn sm primary" @click="onApplyImport">
            {{ tr('应用导入', 'Apply Code') }}
          </button>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useConfirm } from '../../composables/useConfirm';
import { useI18n } from '../../composables/useI18n';
import { useToast } from '../../composables/useToast';
import { buildCode, type DraftCodeKind, parseCode } from '../../core/draftCode';

const props = defineProps<{
  data: Record<string, string>;
  order: string[];
  prefix: string;
  expectedKind: DraftCodeKind;
  customOrder?: string[] | null;
  readonly?: boolean;
}>();

const emit = defineEmits<{
  (e: 'importData', data: Record<string, string>): void;
}>();

const { t, tr } = useI18n();
const { toast } = useToast();
const { confirm } = useConfirm();

const isOpen = ref(false);
const mode = ref<'out' | 'in'>('out');
const generatedCode = ref('');
const inputCode = ref('');

function onGenerate() {
  const code = buildCode(props.data, props.order, props.prefix);
  if (!code) {
    toast(t.value.empty, 'warn');
    return;
  }
  generatedCode.value = code;
  mode.value = 'out';
  toast(t.value.madeCode, 'ok');
}

async function onCopy() {
  if (!generatedCode.value) {
    toast(t.value.noCode, 'warn');
    return;
  }
  try {
    await navigator.clipboard.writeText(generatedCode.value);
    toast(t.value.codeCopied, 'ok');
  } catch {
    toast(tr('复制失败', 'Copy failed'), 'err');
  }
}

async function onApplyImport() {
  if (props.readonly) return;
  const code = inputCode.value.trim();
  if (!code) {
    toast(t.value.notCode, 'warn');
    return;
  }
  const hasExisting = Object.values(props.data || {}).some((v) => v && String(v).trim());
  if (
    hasExisting &&
    !(await confirm(
      t.value.importConfirm,
      tr('导入会覆盖当前内容，是否继续？', 'Importing will overwrite current content. Continue?')
    ))
  ) {
    return;
  }

  try {
    const parsed = parseCode(code, props.customOrder);
    if (parsed.kind !== props.expectedKind) {
      const kindLabel =
        parsed.kind === 'world'
          ? '世界观'
          : parsed.kind === 'org'
            ? '组织'
            : '角色';
      toast(t.value.codeKindErr.replace('%s', kindLabel), 'warn');
      return;
    }
    emit('importData', parsed.data);
    inputCode.value = '';
    toast(t.value.importOk, 'ok');
  } catch (err: any) {
    toast(t.value.importFail + (err?.message || ''), 'err');
  }
}
</script>
