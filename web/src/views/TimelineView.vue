<template>
  <div class="page-container" style="max-width: 960px; margin: 0 auto; padding: 20px">
    <div class="row" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; margin-bottom: 18px">
      <div>
        <h2 style="margin: 0; font-size: 20px">📜 {{ tr('时间线', 'Timeline') }}</h2>
        <p class="hint" style="margin: 4px 0 0">
          {{ tr('自动汇总世界观、组织、角色、剧情章节中的时间节点，也可手动添加独立历史事件。', 'Auto-aggregates events across worlds, orgs, chars, and plots.') }}
        </p>
      </div>
      <div class="row" style="display: flex; gap: 8px; flex-wrap: wrap">
        <select v-model="sourceFilter" style="width: auto; min-width: 120px">
          <option value="all">{{ tr('全部来源', 'All Sources') }} ({{ allEvents.length }})</option>
          <option value="独立">{{ tr('独立事件', 'Manual') }}</option>
          <option value="世界观">{{ tr('世界观', 'World') }}</option>
          <option value="组织">{{ tr('组织', 'Organization') }}</option>
          <option value="角色">{{ tr('角色', 'Character') }}</option>
          <option value="剧情">{{ tr('剧情章节', 'Plot') }}</option>
        </select>
        <button class="btn sm" @click="exportTimelineCode">⌘ {{ tr('导出时间线码', 'Export CC3T') }}</button>
        <button class="btn sm" @click="showImportModal = true">📥 {{ tr('导入时间线码', 'Import CC3T') }}</button>
        <button class="btn sm primary" @click="openEventModal()">＋ {{ tr('添加事件', 'Add Event') }}</button>
      </div>
    </div>

    <AgeCalculator />

    <div v-if="filteredEvents.length === 0" class="card" style="padding: 40px; text-align: center">
      <p style="font-size: 36px; margin: 0 0 8px">📜</p>
      <p class="hint">{{ t.noEvents }}</p>
    </div>

    <div v-else class="tl-list" style="display: flex; flex-direction: column; gap: 12px">
      <div
        v-for="(ev, idx) in filteredEvents"
        :key="ev.id || idx"
        class="card"
        style="padding: 14px 18px; display: flex; align-items: flex-start; gap: 14px"
      >
        <div
          style="min-width: 88px; padding: 4px 10px; border-radius: 8px; background: var(--acs); color: var(--ac); font-weight: 700; font-size: 12.5px; text-align: center"
        >
          {{ ev.year || t.unknownTime }}
        </div>
        <div style="flex: 1; min-width: 0">
          <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap">
            <strong style="font-size: 14.5px">
              <WikiText :text="ev.name" />
            </strong>
            <span
              v-if="ev.isReference"
              class="pill"
              style="font-size: 10px; padding: 1px 6px; border-radius: 99px; background: var(--acs); color: var(--ac); font-weight: 700"
            >
              📚 {{ tr('官方', 'Official') }}
            </span>
            <span class="pill" style="font-size: 11px; padding: 2px 8px; border-radius: 99px; background: var(--li2); color: var(--mu)">
              {{ ev.source }}
            </span>
            <span v-if="ev.link" style="font-size: 12px; color: var(--ac)">
              <WikiText :text="ev.link" />
            </span>
          </div>
          <p v-if="ev.desc" style="margin: 6px 0 0; color: var(--ink2); font-size: 13.5px; white-space: pre-wrap">
            <WikiText :text="ev.desc" />
          </p>
        </div>
        <div v-if="ev.source === '独立' && ev.id" style="display: flex; gap: 6px">
          <button v-if="!ev.isReference || authStore.isAdmin" class="btn sm" @click="openEventModal(ev.id)">{{ tr('编辑', 'Edit') }}</button>
          <button v-if="!ev.isReference || authStore.isAdmin" class="btn sm icon danger" @click="deleteManualEvent(ev.id)">✕</button>
        </div>
      </div>
    </div>

    <!-- Add/Edit Manual Event Modal -->
    <div v-if="editingModal" class="tut-mask show" @click.self="editingModal = false">
      <div class="tut-box" style="max-width: 480px">
        <h3 style="margin: 0 0 14px">{{ editingId ? tr('编辑事件', 'Edit Event') : tr('添加独立事件', 'New Event') }}</h3>
        <label class="f-label">{{ tr('事件名称', 'Event Title') }}</label>
        <input v-model="form.name" type="text" :placeholder="tr('例：雾谷之战', 'e.g. Battle of Mist Valley')" style="margin-bottom: 10px" />
        <label class="f-label">{{ tr('年份 / 时间', 'Year / Time') }}</label>
        <input v-model="form.year" type="text" :placeholder="tr('例：302年 / 三百年前', 'e.g. Year 302')" style="margin-bottom: 10px" />
        <label class="f-label">{{ tr('关联世界观 / 角色 / 组织', 'Related Entity') }}</label>
        <input v-model="form.link" type="text" :placeholder="tr('例：艾瑟兰、暮光议会', 'e.g. Aetherlan')" style="margin-bottom: 10px" />
        <label class="f-label">{{ tr('详情描述', 'Description') }}</label>
        <textarea v-model="form.desc" rows="3" style="margin-bottom: 14px"></textarea>
        <div class="tut-actions" style="display: flex; justify-content: flex-end; gap: 8px">
          <button class="btn sm" @click="editingModal = false">{{ tr('取消', 'Cancel') }}</button>
          <button class="btn sm primary" @click="saveManualEvent">{{ tr('保存', 'Save') }}</button>
        </div>
      </div>
    </div>

    <!-- Exported Code Modal -->
    <div v-if="exportedCode" class="tut-mask show" @click.self="exportedCode = ''">
      <div class="tut-box" style="max-width: 520px">
        <h3 style="margin: 0 0 10px">⌘ {{ tr('时间线草稿码 · CC3T', 'Timeline Code · CC3T') }}</h3>
        <textarea :value="exportedCode" readonly rows="4" style="font-family: monospace; margin-bottom: 12px"></textarea>
        <div class="tut-actions" style="display: flex; justify-content: flex-end; gap: 8px">
          <button class="btn sm" @click="copyExportedCode">{{ tr('复制', 'Copy') }}</button>
          <button class="btn sm primary" @click="exportedCode = ''">{{ tr('关闭', 'Close') }}</button>
        </div>
      </div>
    </div>

    <!-- Import Code Modal -->
    <div v-if="showImportModal" class="tut-mask show" @click.self="showImportModal = false">
      <div class="tut-box" style="max-width: 520px">
        <h3 style="margin: 0 0 10px">📥 {{ tr('导入时间线草稿码 (CC3T)', 'Import Timeline Code (CC3T)') }}</h3>
        <textarea v-model="importCodeStr" rows="4" placeholder="CC3Tr-..." style="font-family: monospace; margin-bottom: 12px"></textarea>
        <div class="tut-actions" style="display: flex; justify-content: flex-end; gap: 8px">
          <button class="btn sm" @click="showImportModal = false">{{ tr('取消', 'Cancel') }}</button>
          <button class="btn sm primary" @click="doImportTimelineCode">{{ tr('导入', 'Import') }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
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

const docStore = useDocStore();
const authStore = useAuthStore();
const { t, tr } = useI18n();
const { toast } = useToast();
const { confirm } = useConfirm();

const sourceFilter = ref<string>('all');
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
