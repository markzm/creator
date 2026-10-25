<template>
  <div class="page-container" style="max-width: 960px; margin: 0 auto; padding: 20px">
    <div class="row" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; margin-bottom: 18px">
      <div>
        <h2 style="margin: 0; font-size: 20px">📖 {{ tr('剧情线大纲（卷 / 幕 / 章）', 'Plot Outlines (Volume / Act / Chapter)') }}</h2>
        <p class="hint" style="margin: 4px 0 0">
          {{ tr('管理卷、幕、章三级结构；章节填写年份后会自动汇入时间线，概要中提及的角色/组织名支持点击跳转。', 'Manage Volumes, Acts, and Chapters. Chapter years sync automatically with the Timeline.') }}
        </p>
      </div>
      <button class="btn sm primary" @click="openVolModal()">＋ {{ tr('新建卷', 'New Volume') }}</button>
    </div>

    <div v-if="!docStore.doc.plots.length" class="card" style="padding: 48px 20px; text-align: center">
      <p style="font-size: 40px; margin: 0 0 8px">📖</p>
      <p class="hint">{{ tr('还没有剧情线。点右上角「＋ 新建卷」开始搭建大纲。', 'No plot volumes yet. Click "+ New Volume" to begin.') }}</p>
    </div>

    <div v-for="(vol, vi) in docStore.doc.plots" :key="vol.id" class="card open" style="margin-bottom: 14px">
      <div class="card-h" style="display: flex; align-items: center; gap: 10px">
        <span class="idx">{{ tr(`卷${vi + 1}`, `Vol ${vi + 1}`) }}</span>
        <h3 style="flex: 1; margin: 0; display: flex; align-items: center; gap: 8px">
          <span>{{ vol.title || tr('未命名', 'Untitled') }}</span>
          <span
            v-if="vol.isReference"
            class="pill"
            style="font-size: 10px; padding: 1px 6px; border-radius: 99px; background: var(--acs); color: var(--ac); font-weight: 700"
          >
            📚 {{ tr('官方', 'Official') }}
          </span>
        </h3>
        <button v-if="!vol.isReference || authStore.isAdmin" class="btn sm" @click="openVolModal(vol)">{{ tr('重命名', 'Rename') }}</button>
        <button v-if="!vol.isReference || authStore.isAdmin" class="btn sm" @click="openActModal(vol)">＋ {{ tr('添加幕', 'Add Act') }}</button>
        <button v-if="!vol.isReference || authStore.isAdmin" class="btn sm icon danger" @click="deleteVol(vol.id, vol.title)">✕</button>
      </div>
      <div class="card-b" style="display: block">
        <p v-if="vol.note" class="hint" style="margin: 0 0 12px">
          <WikiText :text="vol.note" />
        </p>

        <div
          v-for="(act, ai) in vol.acts || []"
          :key="act.id"
          style="border: 1px solid var(--li); border-radius: 10px; padding: 12px 14px; margin-bottom: 10px; background: var(--soft)"
        >
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px; flex-wrap: wrap">
            <span class="pill" style="font-size: 11.5px; padding: 2px 8px; border-radius: 6px; background: var(--acs); color: var(--ac); font-weight: 600">
              {{ tr(`幕 ${vi + 1}-${ai + 1}`, `Act ${vi + 1}-${ai + 1}`) }}
            </span>
            <strong style="flex: 1">{{ act.title || tr('未命名', 'Untitled') }}</strong>
            <button class="btn sm" @click="openActModal(vol, act)">{{ tr('重命名', 'Rename') }}</button>
            <button class="btn sm primary" @click="openChapterModal(act)">＋ {{ tr('章', 'Chapter') }}</button>
            <button class="btn sm icon danger" @click="deleteAct(vol, act.id, act.title)">✕</button>
          </div>

          <div v-if="!(act.chapters && act.chapters.length)" class="hint" style="font-size: 12.5px">
            {{ tr('还没有章节', 'No chapters yet') }}
          </div>

          <div
            v-for="(ch, ci) in act.chapters || []"
            :key="ch.id"
            style="border-top: 1px dashed var(--li); padding-top: 8px; margin-top: 8px"
          >
            <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap">
              <span
                class="pill"
                style="cursor: pointer; font-size: 11.5px; padding: 2px 8px; border-radius: 6px; font-weight: 600"
                :style="statusStyle(ch.status)"
                :title="tr('点击切换状态', 'Click to cycle status')"
                @click="cycleStatus(ch)"
              >
                {{ ch.status || '未写' }}
              </span>
              <span style="font-weight: 600; flex: 1">
                {{ tr(`第${ci + 1}章 · `, `Ch ${ci + 1} · `) }}<WikiText :text="ch.title" />
              </span>
              <span v-if="ch.year" class="pill" style="font-size: 11.5px; color: var(--ac); background: var(--acs); padding: 2px 8px; border-radius: 6px">
                🕒 {{ ch.year }}
              </span>
              <button class="btn sm" @click="openChapterModal(act, ch)">{{ tr('编辑', 'Edit') }}</button>
              <button class="btn sm icon danger" @click="deleteChapter(act, ch.id, ch.title)">✕</button>
            </div>
            <div v-if="ch.summary" style="margin-top: 4px; font-size: 13px; color: var(--ink2); padding-left: 8px">
              <WikiText :text="ch.summary" />
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Volume Modal -->
    <div v-if="volModal.show" class="tut-mask show" @click.self="volModal.show = false">
      <div class="tut-box" style="max-width: 440px">
        <h3 style="margin: 0 0 12px">{{ volModal.target ? tr('编辑卷', 'Edit Volume') : tr('新建卷', 'New Volume') }}</h3>
        <label class="f-label">{{ tr('卷标题', 'Volume Title') }}</label>
        <input v-model="volModal.title" type="text" :placeholder="tr('例：第一卷 · 雾谷之影', 'Volume 1')" style="margin-bottom: 10px" />
        <label class="f-label">{{ tr('卷备注（可选）', 'Note (Optional)') }}</label>
        <textarea v-model="volModal.note" rows="3" style="margin-bottom: 14px"></textarea>
        <div class="tut-actions" style="display: flex; justify-content: flex-end; gap: 8px">
          <button class="btn sm" @click="volModal.show = false">{{ tr('取消', 'Cancel') }}</button>
          <button class="btn sm primary" @click="saveVol">{{ tr('保存', 'Save') }}</button>
        </div>
      </div>
    </div>

    <!-- Act Modal -->
    <div v-if="actModal.show" class="tut-mask show" @click.self="actModal.show = false">
      <div class="tut-box" style="max-width: 420px">
        <h3 style="margin: 0 0 12px">{{ actModal.target ? tr('重命名幕', 'Rename Act') : tr('添加幕', 'New Act') }}</h3>
        <label class="f-label">{{ tr('幕标题', 'Act Title') }}</label>
        <input v-model="actModal.title" type="text" :placeholder="tr('例：第一幕 · 风暴前夜', 'Act 1')" style="margin-bottom: 14px" />
        <div class="tut-actions" style="display: flex; justify-content: flex-end; gap: 8px">
          <button class="btn sm" @click="actModal.show = false">{{ tr('取消', 'Cancel') }}</button>
          <button class="btn sm primary" @click="saveAct">{{ tr('保存', 'Save') }}</button>
        </div>
      </div>
    </div>

    <!-- Chapter Modal -->
    <div v-if="chModal.show" class="tut-mask show" @click.self="chModal.show = false">
      <div class="tut-box" style="max-width: 480px">
        <h3 style="margin: 0 0 12px">{{ chModal.target ? tr('编辑章节', 'Edit Chapter') : tr('添加章节', 'New Chapter') }}</h3>
        <label class="f-label">{{ tr('章标题', 'Chapter Title') }}</label>
        <input v-model="chModal.title" type="text" style="margin-bottom: 10px" />
        <label class="f-label">{{ tr('时间（可选，填写后自动同步至时间线）', 'Time (syncs to Timeline)') }}</label>
        <input v-model="chModal.year" type="text" :placeholder="tr('例：304年', 'e.g. Year 304')" style="margin-bottom: 10px" />
        <label class="f-label">{{ tr('状态', 'Status') }}</label>
        <select v-model="chModal.status" style="margin-bottom: 10px">
          <option value="未写">未写</option>
          <option value="写作中">写作中</option>
          <option value="已完成">已完成</option>
        </select>
        <label class="f-label">{{ tr('内容概要', 'Summary') }}</label>
        <textarea v-model="chModal.summary" rows="4" style="margin-bottom: 14px"></textarea>
        <div class="tut-actions" style="display: flex; justify-content: flex-end; gap: 8px">
          <button class="btn sm" @click="chModal.show = false">{{ tr('取消', 'Cancel') }}</button>
          <button class="btn sm primary" @click="saveChapter">{{ tr('保存', 'Save') }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive } from 'vue';
import WikiText from '../components/base/WikiText.vue';
import { useConfirm } from '../composables/useConfirm';
import { useI18n } from '../composables/useI18n';
import { useToast } from '../composables/useToast';
import type { ChapterStatus, PlotAct, PlotChapter, PlotVolume } from '../core/schema/types';
import { uid } from '../core/uid';
import { useDocStore } from '../stores/doc';
import { useAuthStore } from '../stores/auth';

const docStore = useDocStore();
const authStore = useAuthStore();
const { t, tr } = useI18n();
const { toast } = useToast();
const { confirm } = useConfirm();

const ST_ORDER: ChapterStatus[] = ['未写', '写作中', '已完成'];

function statusStyle(status?: string) {
  if (status === '已完成') return { background: 'var(--oks)', color: 'var(--ok)' };
  if (status === '写作中') return { background: 'var(--wns)', color: 'var(--wn)' };
  return { background: 'var(--li2)', color: 'var(--mu)' };
}

function cycleStatus(ch: PlotChapter) {
  const idx = ST_ORDER.indexOf((ch.status as ChapterStatus) || '未写');
  ch.status = ST_ORDER[(idx + 1) % ST_ORDER.length];
  ch.updatedAt = Date.now();
  docStore.touch(true);
}

const volModal = reactive<{ show: boolean; target: PlotVolume | null; title: string; note: string }>({
  show: false,
  target: null,
  title: '',
  note: ''
});

function openVolModal(vol?: PlotVolume) {
  volModal.target = vol || null;
  volModal.title = vol ? vol.title : '';
  volModal.note = vol?.note || '';
  volModal.show = true;
}

function saveVol() {
  if (!volModal.title.trim()) {
    toast(tr('标题不能为空', 'Title required'), 'warn');
    return;
  }
  if (volModal.target) {
    volModal.target.title = volModal.title.trim();
    volModal.target.note = volModal.note.trim();
    volModal.target.updatedAt = Date.now();
  } else {
    docStore.doc.plots.push({
      id: uid('pl_'),
      title: volModal.title.trim(),
      note: volModal.note.trim(),
      acts: [],
      updatedAt: Date.now()
    });
  }
  docStore.touch(true);
  volModal.show = false;
}

async function deleteVol(id: string, title: string) {
  const vol = (docStore.doc.plots || []).find((x) => x.id === id);
  if (vol?.isReference && !authStore.isAdmin) {
    toast('此条目为官方公共参考素材，仅供大家查阅与引用~', 'warn');
    return;
  }
  if (!(await confirm(t.value.delConfirm, tr(`确定删除卷「${title}」及其所有幕、章？`, `Delete volume "${title}"?`)))) return;
  docStore.doc.plots = docStore.doc.plots.filter((x) => x.id !== id);
  docStore.touch(true);
  toast(tr('已删除', 'Deleted'), 'ok');
}

const actModal = reactive<{ show: boolean; vol: PlotVolume | null; target: PlotAct | null; title: string }>({
  show: false,
  vol: null,
  target: null,
  title: ''
});

function openActModal(vol: PlotVolume, act?: PlotAct) {
  actModal.vol = vol;
  actModal.target = act || null;
  actModal.title = act ? act.title : '';
  actModal.show = true;
}

function saveAct() {
  if (!actModal.title.trim() || !actModal.vol) {
    toast(tr('标题不能为空', 'Title required'), 'warn');
    return;
  }
  if (actModal.target) {
    actModal.target.title = actModal.title.trim();
  } else {
    if (!actModal.vol.acts) actModal.vol.acts = [];
    actModal.vol.acts.push({
      id: uid('at_'),
      title: actModal.title.trim(),
      chapters: []
    });
  }
  docStore.touch(true);
  actModal.show = false;
}

async function deleteAct(vol: PlotVolume, actId: string, title: string) {
  if (!(await confirm(t.value.delConfirm, tr(`确定删除幕「${title}」？`, `Delete act "${title}"?`)))) return;
  vol.acts = (vol.acts || []).filter((a) => a.id !== actId);
  docStore.touch(true);
  toast(tr('已删除', 'Deleted'), 'ok');
}

const chModal = reactive<{
  show: boolean;
  act: PlotAct | null;
  target: PlotChapter | null;
  title: string;
  year: string;
  status: ChapterStatus;
  summary: string;
}>({
  show: false,
  act: null,
  target: null,
  title: '',
  year: '',
  status: '未写',
  summary: ''
});

function openChapterModal(act: PlotAct, ch?: PlotChapter) {
  chModal.act = act;
  chModal.target = ch || null;
  chModal.title = ch ? ch.title : `第${(act.chapters?.length || 0) + 1}章`;
  chModal.year = ch?.year || '';
  chModal.status = (ch?.status as ChapterStatus) || '未写';
  chModal.summary = ch?.summary || '';
  chModal.show = true;
}

function saveChapter() {
  if (!chModal.title.trim() || !chModal.act) {
    toast(tr('标题不能为空', 'Title required'), 'warn');
    return;
  }
  if (chModal.target) {
    chModal.target.title = chModal.title.trim();
    chModal.target.year = chModal.year.trim();
    chModal.target.status = chModal.status;
    chModal.target.summary = chModal.summary.trim();
    chModal.target.updatedAt = Date.now();
  } else {
    if (!chModal.act.chapters) chModal.act.chapters = [];
    chModal.act.chapters.push({
      id: uid('chp_'),
      title: chModal.title.trim(),
      year: chModal.year.trim(),
      status: chModal.status,
      summary: chModal.summary.trim(),
      updatedAt: Date.now()
    });
  }
  docStore.touch(true);
  chModal.show = false;
}

async function deleteChapter(act: PlotAct, chId: string, title: string) {
  if (!(await confirm(t.value.delConfirm, tr(`确定删除章节「${title}」？`, `Delete chapter "${title}"?`)))) return;
  act.chapters = (act.chapters || []).filter((c) => c.id !== chId);
  docStore.touch(true);
  toast(tr('已删除', 'Deleted'), 'ok');
}
</script>
