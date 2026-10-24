<template>
  <Modal
    v-model="uiStore.modals.revisions"
    :title="tr('🕒 云端历史版本快照', '🕒 Cloud Revision History')"
    max-width="640px"
  >
    <p v-if="loading" class="hint" style="display: block">
      {{ tr('加载历史版本中…', 'Loading revisions…') }}
    </p>
    <p v-else-if="!revisions.length" class="hint" style="display: block">
      {{ tr('暂无云端历史快照。每次同步会自动按策略生成快照。', 'No revision snapshots yet.') }}
    </p>
    <div
      v-else
      style="max-height: 50vh; overflow-y: auto; display: flex; flex-direction: column; gap: 8px"
    >
      <div
        v-for="rev in revisions"
        :key="rev.id"
        class="gl-row"
        style="margin-bottom: 0; padding: 10px 12px"
      >
        <div style="flex: 1; min-width: 0">
          <div style="font-weight: 700; font-size: 13px">
            Rev #{{ rev.rev }} · {{ formatTime(rev.createdAt) }}
          </div>
          <div style="font-size: 12px; color: var(--mu)">
            {{ rev.summary || '—' }} ({{ (rev.byteSize / 1024).toFixed(1) }} KB)
          </div>
        </div>
        <button type="button" class="btn sm primary" @click="onRestoreRevision(rev.id, rev.rev)">
          {{ tr('回滚到此版本', 'Restore') }}
        </button>
      </div>
    </div>

    <template #footer>
      <button type="button" class="btn sm" @click="uiStore.closeModal('revisions')">
        {{ tr('关闭', 'Close') }}
      </button>
    </template>
  </Modal>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { useConfirm } from '../../composables/useConfirm';
import { useI18n } from '../../composables/useI18n';
import { useToast } from '../../composables/useToast';
import { api, type RevisionMeta } from '../../data/api';
import { useDocStore } from '../../stores/doc';
import { useSyncStore } from '../../stores/sync';
import { useUIStore } from '../../stores/ui';
import Modal from '../base/Modal.vue';

const uiStore = useUIStore();
const docStore = useDocStore();
const syncStore = useSyncStore();
const { tr } = useI18n();
const { confirm } = useConfirm();
const { toast } = useToast();

const loading = ref(false);
const revisions = ref<RevisionMeta[]>([]);

async function loadRevisions() {
  loading.value = true;
  try {
    const res = await api.getRevisions();
    revisions.value = res.revisions || [];
  } catch (err: any) {
    toast((tr('加载历史版本失败：', 'Failed: ')) + (err?.message || ''), 'err');
  } finally {
    loading.value = false;
  }
}

watch(
  () => uiStore.modals.revisions,
  (open) => {
    if (open) {
      void loadRevisions();
    }
  }
);

function formatTime(ts: number): string {
  const d = new Date(ts > 1e11 ? ts : ts * 1000);
  return d.toLocaleString();
}

async function onRestoreRevision(id: number, revNum: number) {
  if (
    !(await confirm(
      tr('确认回滚历史版本', 'Restore Revision'),
      tr(
        `确定回滚到历史版本 Rev #${revNum}？回滚前会自动保存当前快照以便撤销。`,
        `Restore to Rev #${revNum}? Current state will be saved to Undo stack.`
      )
    ))
  ) {
    return;
  }
  try {
    const detail = await api.getRevisionDetail(id);
    if (detail && detail.data) {
      docStore.replaceDoc(detail.data, true, true);
      uiStore.closeModal('revisions');
      await syncStore.push(true);
      toast(tr(`已回滚至 Rev #${revNum} ✓`, `Restored Rev #${revNum} ✓`), 'ok');
    }
  } catch (err: any) {
    toast((tr('回滚失败：', 'Restore failed: ')) + (err?.message || ''), 'err');
  }
}
</script>
