<template>
  <section class="card" :class="{ open: isOpen }">
    <div class="card-h" @click="isOpen = !isOpen">
      <span class="idx">INSP</span>
      <h3>🎲 {{ tr('专属世界观灵感池', 'World Custom Inspiration Pool') }} ({{ list.length }})</h3>
      <span class="arrow">▶</span>
    </div>
    <div class="card-b">
      <p v-if="!list.length" class="hint" style="display: block; margin-top: 8px">
        {{ tr('还没有专属灵感。在下方添加后，点字段的 🎲 将优先从中抽取。', 'No custom inspirations yet. Add below.') }}
      </p>
      <div v-else style="margin-top: 8px">
        <div
          v-for="(item, idx) in list"
          :key="idx"
          style="
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 6px 10px;
            background: var(--acs);
            border-radius: 8px;
            margin-bottom: 5px;
          "
        >
          <span style="flex: 1; font-size: 12.5px">{{ item }}</span>
          <span
            v-if="!readonly"
            style="cursor: pointer; color: var(--dg); font-size: 14px"
            @click="onRemove(idx)"
          >
            ×
          </span>
        </div>
      </div>

      <div v-if="!readonly" class="row" style="margin-top: 10px">
        <input
          v-model="newItem"
          type="text"
          style="flex: 1"
          :placeholder="tr('输入一条灵感词条，回车添加…', 'Add custom inspiration…')"
          @keydown.enter.prevent="onAdd"
        />
        <button type="button" class="btn sm primary" @click="onAdd">
          ＋ {{ tr('添加', 'Add') }}
        </button>
        <button type="button" class="btn sm" @click="onExportCode">
          📤 {{ tr('导出灵感码', 'Export CC3I') }}
        </button>
        <button type="button" class="btn sm" @click="showImport = !showImport">
          📥 {{ tr('导入灵感码', 'Import CC3I') }}
        </button>
      </div>

      <div v-if="exportedCode" class="code-panel">
        <textarea readonly :value="exportedCode" rows="2" />
      </div>

      <div v-if="showImport" class="code-panel">
        <textarea v-model="importCodeStr" placeholder="CC3Ir-..." rows="2" />
        <div class="row">
          <button type="button" class="btn sm primary" @click="onImportCode">
            {{ tr('确认导入', 'Import') }}
          </button>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from '../../composables/useI18n';
import { useToast } from '../../composables/useToast';
import { buildCode, parseRawCodeItems, SEP } from '../../core/draftCode';

const props = defineProps<{
  list: string[];
  readonly?: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:list', next: string[]): void;
}>();

const { tr } = useI18n();
const { toast } = useToast();

const isOpen = ref(false);
const newItem = ref('');
const exportedCode = ref('');
const showImport = ref(false);
const importCodeStr = ref('');

function onAdd() {
  if (props.readonly) return;
  const v = newItem.value.trim();
  if (!v) return;
  const next = [...props.list, v];
  emit('update:list', next);
  newItem.value = '';
  toast(tr('已添加', 'Added'), 'ok');
}

function onRemove(idx: number) {
  if (props.readonly) return;
  const next = props.list.slice();
  next.splice(idx, 1);
  emit('update:list', next);
}

function onExportCode() {
  if (!props.list.length) {
    toast(tr('还没有专属灵感', 'No custom inspirations yet'), 'warn');
    return;
  }
  const code = buildCode({ insp: props.list.join(SEP) }, ['insp'], 'CC3I');
  if (code) {
    exportedCode.value = code;
    toast(tr('世界观灵感码已生成 ✓', 'Inspiration code ready ✓'), 'ok');
  }
}

function onImportCode() {
  try {
    const { kind, items } = parseRawCodeItems(importCodeStr.value);
    if (kind !== 'insp') {
      toast(tr('不是有效的 CC3I 灵感码', 'Invalid CC3I code'), 'warn');
      return;
    }
    const merged = [...props.list];
    let added = 0;
    items.filter(Boolean).forEach((s) => {
      if (!merged.includes(s)) {
        merged.push(s);
        added++;
      }
    });
    emit('update:list', merged);
    importCodeStr.value = '';
    showImport.value = false;
    toast(tr(`已导入 ${added} 条灵感`, `Imported ${added} items`), 'ok');
  } catch (err: any) {
    toast(tr('导入失败：', 'Import failed: ') + (err?.message || ''), 'err');
  }
}
</script>
