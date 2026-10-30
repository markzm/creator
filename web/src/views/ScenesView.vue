<template>
  <div class="page-container" style="max-width: 1020px; margin: 0 auto; padding: 20px">
    <div class="row" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; margin-bottom: 18px">
      <div>
        <h2 style="margin: 0; font-size: 20px">🎬 {{ tr('场景卡', 'Scene Cards') }}</h2>
        <p class="hint" style="margin: 4px 0 0">
          {{ tr('管理每场戏的地点、出场角色、戏剧冲突与状态；角色与地点名支持点击跳转。', 'Manage scene locations, characters, and core conflicts.') }}
        </p>
      </div>
      <div class="row" style="display: flex; gap: 8px; align-items: center">
        <input
          v-model="filterText"
          type="text"
          :placeholder="tr('按角色/地点/标题筛选…', 'Filter scenes...')"
          style="width: 210px"
        />
        <button class="btn sm primary" @click="handleNewScene">＋ {{ tr('新建场景', 'New Scene') }}</button>
      </div>
    </div>

    <div v-if="filteredScenes.length === 0" class="card" style="padding: 48px 20px; text-align: center">
      <p style="font-size: 40px; margin: 0 0 8px">🎬</p>
      <p class="hint">{{ tr('还没有场景。点右上角「＋ 新建场景」创建第一张场景卡。', 'No scene cards yet.') }}</p>
    </div>

    <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 14px">
      <div
        v-for="sc in filteredScenes"
        :key="sc.id"
        class="card"
        style="padding: 16px; display: flex; flex-direction: column; justify-content: space-between; gap: 10px"
      >
        <div>
          <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 8px">
            <div style="display: flex; align-items: center; gap: 6px">
              <strong style="font-size: 15px">{{ sc.title }}</strong>
              <span
                v-if="sc.isReference"
                class="pill"
                style="font-size: 10px; padding: 1px 6px; border-radius: 99px; background: var(--acs); color: var(--ac); font-weight: 700"
              >
                📚 {{ tr('官方', 'Official') }}
              </span>
            </div>
            <span
              class="pill"
              style="font-size: 11px; padding: 2px 8px; border-radius: 6px; font-weight: 600"
              :style="statusStyle(sc.status)"
            >
              {{ sc.status || '未写' }}
            </span>
          </div>

          <InspirationOrigin :id="sc.inspirationId" />
          <p v-if="sc.location || sc.place" style="margin: 4px 0; font-size: 13px; color: var(--ink2)">
            📍 <WikiText :text="sc.location || sc.place || ''" />
          </p>
          <p v-if="sc.chars" style="margin: 4px 0; font-size: 13px; color: var(--ink2)">
            👥 <WikiText :text="sc.chars" />
          </p>
          <p v-if="sc.conflict || sc.purpose" style="margin: 6px 0 0; font-size: 13px; color: var(--ink)">
            ⚔️ <WikiText :text="sc.conflict || sc.purpose || ''" />
          </p>
          <p v-if="sc.note || sc.beat" class="hint" style="margin: 6px 0 0; font-size: 12.5px">
            <WikiText :text="sc.note || sc.beat || ''" />
          </p>
        </div>

        <div style="display: flex; justify-content: flex-end; gap: 6px; margin-top: 8px">
          <button
            v-if="sc.isReference && !authStore.isAdmin"
            class="btn sm primary"
            @click="handleForkScene(sc.id)"
          >
            📑 {{ tr('复制衍生场景', 'Fork Scene') }}
          </button>
          <button v-if="!sc.isReference || authStore.isAdmin" class="btn sm" @click="openSceneModal(sc)">{{ tr('编辑', 'Edit') }}</button>
          <button v-if="!sc.isReference || authStore.isAdmin" class="btn sm danger" @click="deleteScene(sc.id, sc.title)">{{ tr('删除', 'Delete') }}</button>
        </div>
      </div>
    </div>

    <datalist id="worldLocationsList">
      <option v-for="loc in worldLocations" :key="loc" :value="loc" />
    </datalist>

    <!-- Scene -->
    <Modal v-model="modal.show" :title="modal.target ? tr('编辑场景', 'Edit scene') : tr('新建场景', 'New scene')" max-width="480px">
      <label class="f-label">{{ tr('场景名', 'Scene title') }}</label>
      <input v-model="modal.title" type="text" :placeholder="tr('例：雨夜酒馆对峙', 'e.g. Tavern Standoff')" style="margin-bottom: 10px" />
      <label class="f-label">{{ tr('地点（可从世界观地点表选）', 'Location') }}</label>
      <input v-model="modal.location" type="text" list="worldLocationsList" style="margin-bottom: 10px" />
      <label class="f-label">{{ tr('出场角色（、分隔）', 'Appearing characters') }}</label>
      <input v-model="modal.chars" type="text" :placeholder="tr('例：凯恩、玛尔塔', 'e.g. Kane, Martha')" style="margin-bottom: 10px" />
      <label class="f-label">{{ tr('核心冲突目标', 'Core conflict') }}</label>
      <textarea v-model="modal.conflict" rows="3" style="margin-bottom: 10px"></textarea>
      <label class="f-label">{{ tr('备注', 'Notes') }}</label>
      <textarea v-model="modal.note" rows="2" style="margin-bottom: 10px"></textarea>
      <label class="f-label">{{ tr('状态', 'Status') }}</label>
      <select v-model="modal.status">
        <option value="未写">{{ tr('未写', 'Not started') }}</option>
        <option value="写作中">{{ tr('写作中', 'Writing') }}</option>
        <option value="已完成">{{ tr('已完成', 'Done') }}</option>
      </select>
      <template #footer>
        <button class="btn sm" @click="modal.show = false">{{ tr('取消', 'Cancel') }}</button>
        <button class="btn sm primary" @click="saveScene">{{ tr('保存', 'Save') }}</button>
      </template>
    </Modal>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import InspirationOrigin from '../components/inspiration/InspirationOrigin.vue';
import Modal from '../components/base/Modal.vue';
import WikiText from '../components/base/WikiText.vue';
import { useConfirm } from '../composables/useConfirm';
import { useI18n } from '../composables/useI18n';
import { useToast } from '../composables/useToast';
import type { ChapterStatus, SceneCard } from '../core/schema/types';
import { uid } from '../core/uid';
import { useDocStore } from '../stores/doc';
import { useAuthStore } from '../stores/auth';
import { useUIStore } from '../stores/ui';

const docStore = useDocStore();
const authStore = useAuthStore();
const uiStore = useUIStore();
const route = useRoute(), router = useRouter();
const { t, tr } = useI18n();
const { toast } = useToast();
const { confirm } = useConfirm();

function handleNewScene() {
  if (!authStore.isLoggedIn) {
    toast(tr('请先登录个人账号，登录后即可自由创建与管理您的专属核心场景~', 'Please sign in to create personal scenes.'), 'info');
    uiStore.openModal('auth');
    return;
  }
  openSceneModal();
}

function handleForkScene(id: string) {
  if (!authStore.isLoggedIn) {
    toast(tr('请先登录个人账号，登录后即可一键复制官方场景至您的专属库进行二次创作~', 'Please sign in to fork official scenes.'), 'info');
    uiStore.openModal('auth');
    return;
  }
  docStore.forkReferenceScene(id);
}

const filterText = ref('');

const worldLocations = computed(() => {
  const locs = new Set<string>();
  Object.values(docStore.doc.worlds || {}).forEach((w) => {
    ((w.data && w.data.w_locations) || '').split('\n').forEach((line) => {
      const n = line.split('|')[0]?.trim();
      if (n) locs.add(n);
    });
  });
  return Array.from(locs);
});

const filteredScenes = computed(() => {
  const q = filterText.value.trim().toLowerCase();
  if (!q) return docStore.doc.scenes || [];
  return (docStore.doc.scenes || []).filter((s) =>
    [s.title, s.location, s.place, s.chars, s.conflict, s.note]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(q))
  );
});

function statusStyle(status?: string) {
  if (status === '已完成') return { background: 'var(--oks)', color: 'var(--ok)' };
  if (status === '写作中') return { background: 'var(--wns)', color: 'var(--wn)' };
  return { background: 'var(--li2)', color: 'var(--mu)' };
}

const modal = reactive<{
  show: boolean;
  target: SceneCard | null;
  title: string;
  location: string;
  chars: string;
  conflict: string;
  note: string;
  status: ChapterStatus;
}>({
  show: false,
  target: null,
  title: '',
  location: '',
  chars: '',
  conflict: '',
  note: '',
  status: '未写'
});

function openSceneModal(sc?: SceneCard) {
  modal.target = sc || null;
  modal.title = sc ? sc.title : '';
  modal.location = (sc && (sc.location || sc.place)) || '';
  modal.chars = sc?.chars || '';
  modal.conflict = (sc && (sc.conflict || sc.purpose)) || '';
  modal.note = (sc && (sc.note || sc.beat)) || '';
  modal.status = (sc?.status as ChapterStatus) || '未写';
  modal.show = true;
}

watch([() => route.query.edit, () => docStore.ready], ([id, ready]) => {
  if (!ready || !authStore.isLoggedIn || typeof id !== 'string') return;
  const scene = docStore.doc.scenes.find(item => item.id === id && !item.isReference);
  if (scene) openSceneModal(scene);
  const { edit: _edit, ...query } = route.query;
  void router.replace({ query });
}, { immediate: true });

function saveScene() {
  if (modal.target?.isReference && !authStore.isAdmin) {
    toast('官方公共参考素材不可直接修改。请点击「📑 复制衍生场景」在个人库中修改~', 'warn');
    return;
  }
  if (!modal.title.trim()) {
    toast(tr('场景名不能为空', 'Scene title required'), 'warn');
    return;
  }
  const now = Date.now();
  if (modal.target) {
    modal.target.title = modal.title.trim();
    modal.target.location = modal.location.trim();
    modal.target.chars = modal.chars.trim();
    modal.target.conflict = modal.conflict.trim();
    modal.target.note = modal.note.trim();
    // Keep legacy alias keys in lockstep so a re-migration never resurrects stale values.
    modal.target.place = modal.target.location;
    modal.target.purpose = modal.target.conflict;
    modal.target.beat = modal.target.note;
    modal.target.status = modal.status;
    modal.target.updatedAt = now;
  } else {
    docStore.doc.scenes.push({
      id: uid('sc_'),
      title: modal.title.trim(),
      location: modal.location.trim(),
      place: modal.location.trim(),
      chars: modal.chars.trim(),
      conflict: modal.conflict.trim(),
      purpose: modal.conflict.trim(),
      note: modal.note.trim(),
      beat: modal.note.trim(),
      status: modal.status,
      updatedAt: now
    });
  }
  docStore.touch(true);
  modal.show = false;
  toast(tr('场景已保存 ✓', 'Scene saved ✓'), 'ok');
}

async function deleteScene(id: string, title: string) {
  const sc = (docStore.doc.scenes || []).find((s) => s.id === id);
  if (sc?.isReference && !authStore.isAdmin) {
    toast('此场景卡为官方公共参考素材，仅供大家查阅与引用~', 'warn');
    return;
  }
  if (!(await confirm(t.value.delConfirm, tr(`确定删除场景「${title}」？`, `Delete scene "${title}"?`)))) return;
  docStore.doc.scenes = docStore.doc.scenes.filter((s) => s.id !== id);
  docStore.touch(true);
  toast(tr('已删除', 'Deleted'), 'ok');
}
</script>
