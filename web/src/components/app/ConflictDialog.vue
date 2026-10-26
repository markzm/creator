<template>
  <Modal
    v-model="uiStore.modals.conflict"
    :title="tr('⚠️ 多端同步冲突处理', '⚠️ Resolve Sync Conflict')"
    max-width="680px"
    persistent
  >
    <template v-if="cState">
      <p style="margin: 0 0 12px; color: var(--ink2); font-size: 13.5px">
        {{
          tr(
            '检测到本地与云端对同一条目做了不同修改。非冲突内容已自动合并，请为以下冲突选择保留版本：',
            'Both local and cloud modified the same item(s). Non-conflicting changes were auto-merged. Choose how to resolve:'
          )
        }}
      </p>

      <div
        style="
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          padding: 10px 12px;
          background: var(--acs);
          border-radius: 10px;
          font-size: 12px;
          margin-bottom: 14px;
        "
      >
        <span>🌍 {{ tr('世界观变更：', 'Worlds: ') }}+{{ cState.summary.worldsAdded }} / ~{{ cState.summary.worldsModified }}</span>
        <span>🏛️ {{ tr('组织变更：', 'Orgs: ') }}+{{ cState.summary.orgsAdded }} / ~{{ cState.summary.orgsModified }}</span>
        <span>👤 {{ tr('角色变更：', 'Chars: ') }}+{{ cState.summary.charsAdded }} / ~{{ cState.summary.charsModified }}</span>
        <span>🖋️ {{ tr('文章变更：', 'Articles: ') }}{{ cState.summary.articlesDelta }}</span>
        <span>
          📑 {{ tr('其他条目：', 'Other: ') }}
          {{ cState.summary.timelineDelta + cState.summary.plotsDelta + cState.summary.scenesDelta + cState.summary.glossaryDelta + cState.summary.templatesDelta }}
        </span>
      </div>

      <div
        style="
          max-height: 44vh;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 10px;
        "
      >
        <div
          v-for="conf in cState.conflicts"
          :key="keyOf(conf)"
          style="border: 1px solid var(--li); border-radius: 12px; padding: 12px"
        >
          <div style="font-weight: 700; font-size: 13px; margin-bottom: 8px">
            [{{ kindLabel(conf.kind) }}] {{ conf.entityName }} ·
            <code>{{ conf.fieldId === '*' ? tr('整条记录', 'whole record') : conf.fieldId.replace(/^\$/, '') }}</code>
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px">
            <label
              v-for="side in SIDES"
              :key="side"
              style="
                border: 1.5px solid var(--li);
                border-radius: 8px;
                padding: 8px 10px;
                cursor: pointer;
                font-size: 12.5px;
              "
              :style="{
                borderColor: pick(conf) === side ? 'var(--ac)' : 'var(--li)',
                background: pick(conf) === side ? 'var(--acs)' : 'var(--soft)'
              }"
            >
              <input
                type="radio"
                :name="'conf_' + keyOf(conf)"
                :value="side"
                :checked="pick(conf) === side"
                @change="choices[keyOf(conf)] = side"
              />
              <strong style="margin-left: 6px">{{ side === 'local' ? tr('本地版本', 'Local') : tr('云端版本', 'Cloud') }}</strong>
              <div style="margin-top: 4px; color: var(--ink2); white-space: pre-wrap">
                {{ displayVal(conf, side === 'local' ? conf.localVal : conf.remoteVal) }}
              </div>
            </label>
          </div>
        </div>
      </div>
    </template>

    <template #footer>
      <button type="button" class="btn sm" @click="syncStore.resolveConflict('remote')">
        {{ tr('全部采用云端', 'Adopt Cloud All') }}
      </button>
      <button type="button" class="btn sm" @click="syncStore.resolveConflict('local')">
        {{ tr('全部保留本地', 'Keep Local All') }}
      </button>
      <button type="button" class="btn primary sm" @click="onApplyMerged">
        {{ tr('合并所选并保存 ✓', 'Save Merged ✓') }}
      </button>
    </template>
  </Modal>
</template>

<script setup lang="ts">
import { computed, reactive, watch } from 'vue';
import { useI18n } from '../../composables/useI18n';
import { applyConflictChoices } from '../../core/diff';
import type { ConflictKind, FieldConflict } from '../../core/schema/types';
import { useSyncStore } from '../../stores/sync';
import { useUIStore } from '../../stores/ui';
import Modal from '../base/Modal.vue';

type Side = 'local' | 'remote';
const SIDES: Side[] = ['local', 'remote'];

const uiStore = useUIStore();
const syncStore = useSyncStore();
const { tr } = useI18n();

const cState = computed(() => syncStore.conflictState);
// Keyed by a stable id so a re-detected conflict set never resets what the user already picked.
const choices = reactive<Record<string, Side>>({});

function keyOf(conf: FieldConflict): string {
  return `${conf.kind}:${conf.entityId}:${conf.fieldId}`;
}

function pick(conf: FieldConflict): Side {
  return choices[keyOf(conf)] || 'local';
}

const KIND_LABELS: Record<ConflictKind, [string, string]> = {
  world: ['世界观', 'World'],
  org: ['组织', 'Org'],
  char: ['角色', 'Char'],
  template: ['模板', 'Template'],
  timeline: ['时间线', 'Timeline'],
  plot: ['剧情', 'Plot'],
  scene: ['场景', 'Scene'],
  glossary: ['词汇', 'Glossary'],
  article: ['文章', 'Article'],
  preferences: ['偏好', 'Preferences']
};

function kindLabel(kind: ConflictKind): string {
  const pair = KIND_LABELS[kind] || [kind, kind];
  return tr(pair[0], pair[1]);
}

/** Whole-record conflicts carry JSON; show a human summary instead of the raw blob. */
function displayVal(conf: FieldConflict, raw: string): string {
  if (!raw) return tr('（空）', '(empty)');
  if (conf.fieldId !== '*') return raw;
  try {
    const obj = JSON.parse(raw);
    const title = obj.title || obj.name || obj.term || conf.entityName;
    const when = obj.updatedAt ? new Date(obj.updatedAt).toLocaleString() : '';
    const body = obj.content || obj.summary || obj.desc || obj.note || obj.def || '';
    return `${title}${when ? ' · ' + when : ''}${body ? '\n' + String(body).slice(0, 160) : ''}`;
  } catch {
    return raw.slice(0, 200);
  }
}

watch(
  cState,
  (val) => {
    if (!val) return;
    val.conflicts.forEach((conf) => {
      const k = keyOf(conf);
      if (!(k in choices)) choices[k] = 'local';
    });
  },
  { immediate: true }
);

function onApplyMerged() {
  if (!cState.value) return;
  const customDoc = applyConflictChoices(cState.value.mergedDoc, cState.value.conflicts, (conf) => pick(conf));
  void syncStore.resolveConflict('merged', customDoc);
}
</script>
