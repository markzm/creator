<template>
  <div class="page">
    <PageHeader
      :title="tr('时间线', 'Timeline')"
      :subtitle="tr('自动汇总世界观、组织、角色、剧情章节中的时间节点，也可手动添加独立历史事件。', 'Auto-aggregates events across worlds, orgs, chars and plots; add standalone events too.')"
      :icon="Scroll"
    >
      <template #actions>
        <select v-model="sourceFilter" style="width: auto; min-width: 130px">
          <option value="all">{{ tr('全部来源', 'All sources') }} ({{ allEvents.length }})</option>
          <option value="独立">{{ tr('独立事件', 'Manual') }}</option>
          <option value="世界观">{{ tr('世界观', 'World') }}</option>
          <option value="组织">{{ tr('组织', 'Organization') }}</option>
          <option value="角色">{{ tr('角色', 'Character') }}</option>
          <option value="剧情">{{ tr('剧情章节', 'Plot') }}</option>
        </select>
        <button class="btn sm" @click="exportTimelineCode"><Code2 /> {{ tr('导出时间线码', 'Export CC3T') }}</button>
        <button class="btn sm" @click="showImportModal = true"><Download /> {{ tr('导入', 'Import') }}</button>
        <button class="btn sm primary" @click="handleNewEvent"><Plus /> {{ tr('添加事件', 'Add event') }}</button>
      </template>
    </PageHeader>

    <details class="card flat age-calc">
      <summary><Calculator /> {{ tr('年龄推算器', 'Age calculator') }}</summary>
      <div style="padding: 0 4px 4px"><AgeCalculator /></div>
    </details>

    <EmptyState
      v-if="filteredEvents.length === 0"
      :icon="Scroll"
      :title="tr('还没有事件', 'No events yet')"
      :description="t.noEvents"
    >
      <button class="btn primary sm" @click="handleNewEvent"><Plus /> {{ tr('添加第一个事件', 'Add the first event') }}</button>
    </EmptyState>

    <div v-else class="tl-rail">
      <article
        v-for="(ev, idx) in filteredEvents"
        :key="ev.id || idx"
        class="tl-item"
        :class="sourceClass(ev.source)"
      >
        <span class="tl-dot" />
        <div class="card flat tl-card">
          <div class="tl-card-head">
            <span class="tl-year">{{ ev.year || t.unknownTime }}</span>
            <strong class="tl-name"><WikiText :text="ev.name" /></strong>
            <span v-if="ev.isReference" class="pill sm accent"><BookMarked /> {{ tr('官方', 'Official') }}</span>
            <span class="pill sm" :class="sourcePill(ev.source)">{{ ev.source }}</span>
            <span v-if="ev.link" class="tl-link"><WikiText :text="ev.link" /></span>
            <span class="spacer" />
            <div v-if="ev.source === '独立' && ev.id" class="tl-actions">
              <button v-if="ev.isReference && !authStore.isAdmin" class="btn sm" @click="handleForkTimeline(ev.id)"><Copy /> {{ tr('复制', 'Fork') }}</button>
              <template v-else>
                <button class="icon-btn" :aria-label="tr('编辑', 'Edit')" @click="openEventModal(ev.id)"><Pencil /></button>
                <button class="icon-btn danger" :aria-label="tr('删除', 'Delete')" @click="deleteManualEvent(ev.id)"><Trash2 /></button>
              </template>
            </div>
          </div>
          <p v-if="ev.desc" class="tl-desc"><WikiText :text="ev.desc" /></p>
        </div>
      </article>
    </div>

    <!-- Add / edit manual event -->
    <Modal v-model="editingModal" :title="editingId ? tr('编辑事件', 'Edit event') : tr('添加独立事件', 'New event')" max-width="480px">
      <label class="f-label">{{ tr('事件名称', 'Event title') }}</label>
      <input v-model="form.name" type="text" :placeholder="tr('例：雾谷之战', 'e.g. Battle of Mist Valley')" style="margin-bottom: 10px" />
      <label class="f-label">{{ tr('年份 / 时间', 'Year / time') }}</label>
      <input v-model="form.year" type="text" :placeholder="tr('例：302年 / 三百年前', 'e.g. Year 302')" style="margin-bottom: 10px" />
      <label class="f-label">{{ tr('关联世界观 / 角色 / 组织', 'Related entity') }}</label>
      <input v-model="form.link" type="text" :placeholder="tr('例：艾瑟兰、暮光议会', 'e.g. Aetherlan')" style="margin-bottom: 10px" />
      <label class="f-label">{{ tr('详情描述', 'Description') }}</label>
      <textarea v-model="form.desc" rows="3"></textarea>
      <template #footer>
        <button class="btn sm" @click="editingModal = false">{{ tr('取消', 'Cancel') }}</button>
        <button class="btn sm primary" @click="saveManualEvent">{{ tr('保存', 'Save') }}</button>
      </template>
    </Modal>

    <!-- Exported code -->
    <Modal :model-value="Boolean(exportedCode)" :title="tr('时间线草稿码 · CC3T', 'Timeline code · CC3T')" max-width="520px" @update:model-value="(v) => !v && (exportedCode = '')">
      <textarea :value="exportedCode" readonly rows="4" class="mono"></textarea>
      <template #footer>
        <button class="btn sm" @click="copyExportedCode"><Copy /> {{ tr('复制', 'Copy') }}</button>
        <button class="btn sm primary" @click="exportedCode = ''">{{ tr('关闭', 'Close') }}</button>
      </template>
    </Modal>

    <!-- Import code -->
    <Modal v-model="showImportModal" :title="tr('导入时间线草稿码 (CC3T)', 'Import timeline code (CC3T)')" max-width="520px">
      <textarea v-model="importCodeStr" rows="4" placeholder="CC3Tr-..." class="mono"></textarea>
      <template #footer>
        <button class="btn sm" @click="showImportModal = false">{{ tr('取消', 'Cancel') }}</button>
        <button class="btn sm primary" @click="doImportTimelineCode">{{ tr('导入', 'Import') }}</button>
      </template>
    </Modal>
  </div>
</template>

<script setup lang="ts">
import { BookMarked, Calculator, Code2, Copy, Download, Pencil, Plus, Scroll, Trash2 } from 'lucide-vue-next';
import { computed, reactive, ref } from 'vue';
import EmptyState from '../components/base/EmptyState.vue';
import Modal from '../components/base/Modal.vue';
import PageHeader from '../components/base/PageHeader.vue';
import WikiText from '../components/base/WikiText.vue';
import AgeCalculator from '../components/editor/AgeCalculator.vue';
import { useConfirm } from '../composables/useConfirm';
import { useI18n } from '../composables/useI18n';
import { useToast } from '../composables/useToast';
import { buildCode, parseRawCodeItems } from '../core/draftCode';
import { collectAllEvents, parseYear } from '../core/timeline';
import { uid } from '../core/uid';
import { useDocStore } from '../stores/doc';
import { useAuthStore } from '../stores/auth';
import { useUIStore } from '../stores/ui';

const docStore = useDocStore();
const authStore = useAuthStore();
const uiStore = useUIStore();
const { t, tr } = useI18n();
const { toast } = useToast();
const { confirm } = useConfirm();

function handleNewEvent() {
  if (!authStore.isLoggedIn) {
    toast(tr('请先登录个人账号，登录后即可自由创建与管理您的专属时间线事件~', 'Please sign in to create personal events.'), 'info');
    uiStore.openModal('auth');
    return;
  }
  openEventModal();
}

function handleForkTimeline(id: string) {
  if (!authStore.isLoggedIn) {
    toast(tr('请先登录个人账号，登录后即可一键复制官方事件至您的专属库自由调整~', 'Please sign in to fork official events.'), 'info');
    uiStore.openModal('auth');
    return;
  }
  docStore.forkReferenceTimeline(id);
}

const sourceFilter = ref<string>('all');

function sourceClass(src: string): string {
  if (src === '世界观') return 'src-world';
  if (src === '组织') return 'src-org';
  if (src === '角色') return 'src-char';
  if (src === '剧情') return 'src-plot';
  return 'src-manual';
}
function sourcePill(src: string): string {
  if (src === '世界观') return 'k-world';
  if (src === '组织') return 'k-org';
  if (src === '角色') return 'k-char';
  if (src === '剧情') return 'k-article';
  return '';
}
const editingModal = ref(false);
const editingId = ref<string | null>(null);
const form = reactive({
  name: '',
  year: '',
  link: '',
  desc: ''
});

const exportedCode = ref('');
const showImportModal = ref(false);
const importCodeStr = ref('');

const allEvents = computed(() => {
  const list = collectAllEvents(docStore.doc);
  return list.slice().sort((a, b) => {
    if (a.yearNum === null && b.yearNum === null) return 0;
    if (a.yearNum === null) return 1;
    if (b.yearNum === null) return -1;
    return a.yearNum - b.yearNum;
  });
});

const filteredEvents = computed(() => {
  if (sourceFilter.value === 'all') return allEvents.value;
  return allEvents.value.filter((e) => e.source === sourceFilter.value);
});

function openEventModal(id?: string) {
  if (id) {
    const ev = docStore.doc.timeline.find((x) => x.id === id);
    if (!ev) return;
    editingId.value = id;
    form.name = ev.name || '';
    form.year = ev.yearStr !== undefined ? ev.yearStr : String(ev.year ?? '');
    form.link = ev.link || ev.world || '';
    form.desc = ev.desc || '';
  } else {
    editingId.value = null;
    form.name = '';
    form.year = '';
    form.link = '';
    form.desc = '';
  }
  editingModal.value = true;
}

function saveManualEvent() {
  if (editingId.value) {
    const ev = docStore.doc.timeline.find((x) => x.id === editingId.value);
    if (ev?.isReference && !authStore.isAdmin) {
      toast('官方公共参考素材不可直接修改。请点击「📑 复制衍生事件」在个人库中修改~', 'warn');
      return;
    }
  }
  if (!form.name.trim()) {
    toast(tr('事件名称不能为空', 'Event name is required'), 'warn');
    return;
  }
  const yNum = parseYear(form.year.trim());
  const now = Date.now();
  if (editingId.value) {
    const ev = docStore.doc.timeline.find((x) => x.id === editingId.value);
    if (ev) {
      ev.name = form.name.trim();
      ev.yearStr = form.year.trim();
      ev.year = yNum ?? 0;
      ev.yearNum = yNum;
      ev.link = form.link.trim();
      ev.desc = form.desc.trim();
      ev.updatedAt = now;
    }
  } else {
    docStore.doc.timeline.push({
      id: uid('tl_'),
      name: form.name.trim(),
      yearStr: form.year.trim(),
      year: yNum ?? 0,
      yearNum: yNum,
      link: form.link.trim(),
      desc: form.desc.trim(),
      updatedAt: now
    });
  }
  docStore.touch(true);
  editingModal.value = false;
  toast(tr('事件已保存 ✓', 'Event saved ✓'), 'ok');
}

async function deleteManualEvent(id: string) {
  const ev = docStore.doc.timeline.find((x) => x.id === id);
  if (ev?.isReference && !authStore.isAdmin) {
    toast('此条目为官方公共参考素材，仅供大家查阅与引用~', 'warn');
    return;
  }
  if (!(await confirm(t.value.delConfirm, tr('确定删除这条时间线事件？', 'Delete this event?')))) return;
  docStore.doc.timeline = docStore.doc.timeline.filter((x) => x.id !== id);
  docStore.touch(true);
  toast(tr('已删除', 'Deleted'), 'ok');
}

function exportTimelineCode() {
  if (!docStore.doc.timeline.length) {
    toast(tr('还没有独立事件可导出', 'No manual events to export'), 'warn');
    return;
  }
  const code = buildCode({ timeline: JSON.stringify(docStore.doc.timeline) }, ['timeline'], 'CC3T');
  if (code) {
    exportedCode.value = code;
  }
}

async function copyExportedCode() {
  try {
    await navigator.clipboard.writeText(exportedCode.value);
    toast(t.value.codeCopied, 'ok');
  } catch {
    toast(tr('复制失败，请手动复制', 'Copy failed'), 'warn');
  }
}

function doImportTimelineCode() {
  try {
    const c = importCodeStr.value.trim();
    if (!c.startsWith('CC3T')) throw new Error(tr('不是有效的 CC3T 时间线码', 'Invalid CC3T prefix'));
    const { items } = parseRawCodeItems(c);
    const parsed = JSON.parse(items[0] || '[]');
    if (!Array.isArray(parsed)) throw new Error('Invalid format');
    let added = 0;
    parsed.forEach((ev: any) => {
      if (ev && ev.name) {
        docStore.doc.timeline.push({
          id: ev.id || uid('tl_'),
          name: String(ev.name),
          yearStr: String(ev.yearStr ?? ev.year ?? ''),
          year: parseYear(ev.yearStr ?? ev.year) ?? 0,
          yearNum: parseYear(ev.yearStr ?? ev.year),
          link: ev.link || '',
          desc: ev.desc || '',
          updatedAt: Date.now()
        });
        added++;
      }
    });
    docStore.touch(true);
    showImportModal.value = false;
    importCodeStr.value = '';
    toast(tr(`已导入 ${added} 条事件 ✓`, `Imported ${added} events ✓`), 'ok');
  } catch (e: any) {
    toast(t.value.importFail + (e?.message || ''), 'err');
  }
}
</script>

<style scoped>
.age-calc { padding: 10px 14px; margin-bottom: 18px; }
.age-calc summary {
  cursor: pointer;
  font-weight: 700;
  font-size: var(--fs-13);
  display: flex;
  align-items: center;
  gap: 8px;
  list-style: none;
}
.age-calc summary::-webkit-details-marker { display: none; }
.age-calc summary svg { width: 15px; height: 15px; color: var(--ac); }
.tl-card { padding: 12px 16px; }
.tl-card-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.tl-name { font-size: var(--fs-14); }
.tl-link { font-size: var(--fs-12); color: var(--ac); }
.tl-actions { display: flex; gap: 2px; align-items: center; }
.tl-actions .icon-btn { width: 30px; height: 30px; }
.tl-actions .icon-btn svg { width: 15px; height: 15px; }
.tl-actions .icon-btn.danger:hover { background: var(--dgs); color: var(--dg); }
.tl-desc { margin: 6px 0 0; color: var(--ink2); font-size: var(--fs-13); white-space: pre-wrap; line-height: var(--lh-normal); }
.spacer { flex: 1; }
</style>
