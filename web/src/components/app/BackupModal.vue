<template>
  <Modal
    v-model="uiStore.modals.backup"
    :title="'💾 ' + tr('备份恢复与全库导出', 'Backup, Restore & Full Export')"
    max-width="520px"
  >
    <div style="display: flex; flex-direction: column; gap: 14px">
      <div class="card open" style="padding: 14px; margin: 0">
        <h4 style="margin: 0 0 6px">📦 {{ tr('导出 JSON 备份 (v6)', 'Export JSON Backup (v6)') }}</h4>
        <p class="hint" style="display: block; margin-bottom: 10px">
          {{ tr('包含所有世界观、组织、角色、模板、时间线、剧情、场景、术语及统计数据。', 'Includes all worlds, orgs, chars, templates, timeline, plots, scenes, glossary & stats.') }}
        </p>
        <button type="button" class="btn sm primary" @click="onDownloadJson">
          ⬇️ {{ tr('下载 JSON 备份', 'Download JSON Backup') }}
        </button>
      </div>

      <div class="card open" style="padding: 14px; margin: 0">
        <h4 style="margin: 0 0 6px">📥 {{ tr('导入 / 恢复历史备份 (v4 / v5 / v6)', 'Import / Merge Backup') }}</h4>
        <p class="hint" style="display: block; margin-bottom: 10px">
          {{ tr('支持任意旧版或新版 JSON 备份文件无损合并到当前文档（导入前自动创建撤销快照）。', 'Supports merging any v4/v5/v6 JSON backup file into local data.') }}
        </p>
        <input
          ref="fileInputRef"
          type="file"
          accept=".json,application/json"
          hidden
          @change="onFileSelected"
        />
        <button type="button" class="btn sm" @click="fileInputRef?.click()">
          📂 {{ tr('选择备份文件导入…', 'Choose JSON File…') }}
        </button>
      </div>

      <div class="card open" style="padding: 14px; margin: 0">
        <h4 style="margin: 0 0 6px">📄 {{ tr('导出全部 Markdown 设定集', 'Export Full Markdown Anthology') }}</h4>
        <p class="hint" style="display: block; margin-bottom: 10px">
          {{ tr('将全库所有非空条目排版为一份完整的 Markdown 文档下载。', 'Exports all non-empty entries as a formatted Markdown file.') }}
        </p>
        <button type="button" class="btn sm" @click="onExportMarkdown">
          📄 {{ tr('下载 Markdown 合集 (.md)', 'Download Markdown (.md)') }}
        </button>
      </div>
    </div>

    <template #footer>
      <button type="button" class="btn sm" @click="uiStore.closeModal('backup')">
        {{ tr('关闭', 'Close') }}
      </button>
    </template>
  </Modal>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useConfirm } from '../../composables/useConfirm';
import { useI18n } from '../../composables/useI18n';
import { useToast } from '../../composables/useToast';
import { mergeBackupIntoDoc, serializeBackupV6 } from '../../core/backup';
import { exportAllMd } from '../../core/format';
import { useDocStore } from '../../stores/doc';
import { useUIStore } from '../../stores/ui';
import Modal from '../base/Modal.vue';

const uiStore = useUIStore();
const docStore = useDocStore();
const { lang, t, tr } = useI18n();
const { toast } = useToast();
const { confirm } = useConfirm();

const fileInputRef = ref<HTMLInputElement | null>(null);

function onDownloadJson() {
  try {
    const jsonStr = serializeBackupV6(docStore.doc);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'worldbuilding-v6-' + new Date().toISOString().slice(0, 10) + '.json';
    a.click();
    URL.revokeObjectURL(a.href);
    toast(t.value.backupOk, 'ok');
  } catch (err: any) {
    toast(t.value.backupFail + (err?.message || ''), 'err');
  }
}

function onFileSelected(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (ev) => {
    try {
      const raw = JSON.parse(String(ev.target?.result || ''));
      if (!(await confirm(tr('恢复备份', 'Restore Backup'), t.value.restoreConfirm))) {
        return;
      }
      const merged = mergeBackupIntoDoc(docStore.doc, raw);
      docStore.replaceDoc(merged, true, true);
      uiStore.closeModal('backup');
      toast(t.value.restoreOk, 'ok');
    } catch (err: any) {
      toast(t.value.restoreFail + (err?.message || ''), 'err');
    }
  };
  reader.readAsText(file);
}

function onExportMarkdown() {
  const md = exportAllMd(docStore.doc, lang.value);
  if (!md) {
    toast(t.value.empty, 'warn');
    return;
  }
  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'worldbuilding-' + new Date().toISOString().slice(0, 10) + '.md';
  a.click();
  URL.revokeObjectURL(a.href);
  toast(tr('合集已下载 ✓', 'Exported ✓'), 'ok');
}
</script>
