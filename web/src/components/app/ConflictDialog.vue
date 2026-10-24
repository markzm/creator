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
            '检测到本地与云端对同一实体的同一字段做了不同修改。非冲突字段已自动合并，请为以下冲突字段选择保留版本：',
            'Both local and cloud modified the same field(s). Non-conflicting fields were auto-merged. Choose how to resolve:'
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
          v-for="(conf, idx) in cState.conflicts"
          :key="idx"
          style="border: 1px solid var(--li); border-radius: 12px; padding: 12px"
        >
          <div style="font-weight: 700; font-size: 13px; margin-bottom: 8px">
            [{{ conf.kind }}] {{ conf.entityName }} · <code>{{ conf.fieldId }}</code>
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px">
            <label
              style="
                border: 1.5px solid var(--li);
                border-radius: 8px;
                padding: 8px 10px;
                cursor: pointer;
                font-size: 12.5px;
              "
              :style="{
                borderColor: choices[idx] !== 'remote' ? 'var(--ac)' : 'var(--li)',
                background: choices[idx] !== 'remote' ? 'var(--acs)' : 'var(--soft)'
              }"
            >
              <input
                type="radio"
                :name="'conf_' + idx"
                value="local"
                :checked="choices[idx] !== 'remote'"
                @change="choices[idx] = 'local'"
              />
              <strong style="margin-left: 6px">{{ tr('本地版本', 'Local') }}</strong>
              <div style="margin-top: 4px; color: var(--ink2); white-space: pre-wrap">
                {{ conf.localVal || '（空）' }}
              </div>
            </label>

            <label
              style="
                border: 1.5px solid var(--li);
                border-radius: 8px;
                padding: 8px 10px;
                cursor: pointer;
                font-size: 12.5px;
              "
              :style="{
                borderColor: choices[idx] === 'remote' ? 'var(--ac)' : 'var(--li)',
                background: choices[idx] === 'remote' ? 'var(--acs)' : 'var(--soft)'
              }"
            >
              <input
                type="radio"
                :name="'conf_' + idx"
                value="remote"
                :checked="choices[idx] === 'remote'"
                @change="choices[idx] = 'remote'"
              />
              <strong style="margin-left: 6px">{{ tr('云端版本', 'Cloud') }}</strong>
              <div style="margin-top: 4px; color: var(--ink2); white-space: pre-wrap">
                {{ conf.remoteVal || '（空）' }}
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
import type { DocV6 } from '../../core/schema/types';
import { useSyncStore } from '../../stores/sync';
import { useUIStore } from '../../stores/ui';
import Modal from '../base/Modal.vue';

const uiStore = useUIStore();
const syncStore = useSyncStore();
const { tr } = useI18n();

const cState = computed(() => syncStore.conflictState);
const choices = reactive<Record<number, 'local' | 'remote'>>({});

watch(
  cState,
  (val) => {
    if (val) {
      val.conflicts.forEach((_, idx) => {
        choices[idx] = 'local';
      });
    }
  },
  { immediate: true }
);

function onApplyMerged() {
  if (!cState.value) return;
  const customDoc: DocV6 = JSON.parse(JSON.stringify(cState.value.mergedDoc));
  cState.value.conflicts.forEach((conf, idx) => {
    const pickVal = choices[idx] === 'remote' ? conf.remoteVal : conf.localVal;
    const coll =
      conf.kind === 'world'
        ? customDoc.worlds
        : conf.kind === 'org'
          ? customDoc.orgs
          : customDoc.chars;
    if (coll[conf.entityId]) {
      coll[conf.entityId].data[conf.fieldId] = pickVal;
    }
  });
  void syncStore.resolveConflict('merged', customDoc);
}
</script>
