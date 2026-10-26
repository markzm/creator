<template>
  <div class="page-container" style="max-width: 960px; margin: 0 auto; padding: 20px">
    <div style="margin-bottom: 18px">
      <h2 style="margin: 0; font-size: 20px">📚 {{ tr('术语表与全局查替换', 'Glossary & Global Find/Replace') }}</h2>
      <p class="hint" style="margin: 4px 0 0">
        {{ tr('维护专有名词标准写法，或一键扫描并替换全库（世界观/组织/角色/剧情/场景/时间线）中的旧称呼。', 'Maintain canonical terms and batch-replace names across your entire worldbuilding database.') }}
      </p>
    </div>

    <!-- Global Find & Replace Box -->
    <div class="card open" style="margin-bottom: 20px">
      <div class="card-h" style="cursor: default">
        <span class="idx">🔍</span>
        <h3>{{ tr('全库查找与一键替换', 'Global Find & Replace') }}</h3>
      </div>
      <div class="card-b" style="display: block">
        <div class="row" style="display: flex; gap: 10px; flex-wrap: wrap; align-items: flex-end">
          <div style="flex: 1; min-width: 180px">
            <label class="f-label">{{ tr('查找词（旧名称/旧写法）', 'Find') }}</label>
            <input v-model="findStr" type="text" :placeholder="tr('例：暮光议会', 'e.g. Old Name')" />
          </div>
          <div style="flex: 1; min-width: 180px">
            <label class="f-label">{{ tr('替换为（新名称/标准写法）', 'Replace With') }}</label>
            <input v-model="replaceStr" type="text" :placeholder="tr('例：破晓议会', 'e.g. New Name')" />
          </div>
          <div style="display: flex; gap: 8px">
            <button class="btn sm" @click="doScan">{{ tr('扫描匹配', 'Scan') }}</button>
            <button class="btn sm primary" @click="doReplaceAll">{{ tr('全部替换', 'Replace All') }}</button>
            <button
              v-if="docStore.undoSnapshot"
              class="btn sm danger"
              @click="doUndo"
            >
              ↩ {{ tr('撤销上次替换', 'Undo Last Replace') }}
            </button>
          </div>
        </div>

        <div v-if="hasScanned" style="margin-top: 12px; padding-top: 10px; border-top: 1px dashed var(--li)">
          <p v-if="scanTotal === 0" class="hint" style="margin: 0">
            {{ tr('没有找到匹配内容。', 'No matches found.') }}
          </p>
          <div v-else>
            <p style="margin: 0 0 6px; font-size: 13px">
              {{ tr('共找到', 'Found') }} <strong>{{ scanTotal }}</strong> {{ tr('处匹配：', 'occurrences:') }}
            </p>
            <div style="display: flex; flex-wrap: wrap; gap: 8px">
              <span
                v-for="hit in scanHits"
                :key="hit.kind + '_' + hit.id"
                class="pill"
                style="padding: 3px 10px; border-radius: 8px; background: var(--soft); border: 1px solid var(--li); font-size: 12.5px"
              >
                {{ hit.name }} <strong style="color: var(--ac)">× {{ hit.n }}</strong>
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Glossary List & Add Form -->
    <div class="card open">
      <div class="card-h" style="cursor: default">
        <span class="idx">📖</span>
        <h3>{{ tr('专有名词术语表', 'Glossary Terms') }} ({{ docStore.doc.glossary.length }})</h3>
      </div>
      <div class="card-b" style="display: block">
        <div class="row" style="display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 16px">
          <input
            v-model="newTerm.term"
            type="text"
            :placeholder="tr('词条 / 常见写法（例：源石）', 'Term')"
            style="flex: 1; min-width: 150px"
          />
          <input
            v-model="newTerm.std"
            type="text"
            :placeholder="tr('标准写法 / 分类（可选）', 'Standard / Category')"
            style="flex: 1; min-width: 150px"
          />
          <input
            v-model="newTerm.note"
            type="text"
            :placeholder="tr('释义或备注说明', 'Definition / Note')"
            style="flex: 2; min-width: 220px"
          />
          <button class="btn sm primary" @click="addTerm">＋ {{ tr('添加术语', 'Add Term') }}</button>
        </div>

        <div v-if="!docStore.doc.glossary.length" class="hint" style="padding: 20px 0; text-align: center">
          {{ tr('还没有术语。添加「常见写法 → 标准写法」，并在正文里自动产生设定维基高亮链接。', 'No glossary terms yet.') }}
        </div>

        <div v-else style="display: flex; flex-direction: column; gap: 8px">
          <div
            v-for="g in docStore.doc.glossary"
            :key="g.id"
            style="display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-radius: 10px; background: var(--soft); border: 1px solid var(--li)"
          >
            <div style="display: flex; align-items: center; gap: 6px">
              <strong style="font-size: 14px">{{ g.term }}</strong>
              <span
                v-if="g.isReference"
                class="pill"
                style="font-size: 10px; padding: 1px 6px; border-radius: 99px; background: var(--acs); color: var(--ac); font-weight: 700"
              >
                📚 {{ tr('官方', 'Official') }}
              </span>
            </div>
            <template v-if="g.std || g.cat">
              <span style="color: var(--mu)">→</span>
              <span class="pill" style="font-size: 12px; padding: 2px 8px; border-radius: 6px; background: var(--acs); color: var(--ac); font-weight: 600">
                {{ g.std || g.cat }}
              </span>
            </template>
            <span style="flex: 1; font-size: 13px; color: var(--ink2)">
              <WikiText :text="g.note || g.def || ''" />
            </span>
            <button v-if="!g.isReference || authStore.isAdmin" class="btn sm icon danger" @click="removeTerm(g.id)">✕</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import WikiText from '../components/base/WikiText.vue';
import { useConfirm } from '../composables/useConfirm';
import { useI18n } from '../composables/useI18n';
import { useToast } from '../composables/useToast';
import {
  type OccurrenceHit,
  replaceAllOccurrences,
  scanAllOccurrences
} from '../core/glossary';
import { uid } from '../core/uid';
import { useDocStore } from '../stores/doc';
import { useAuthStore } from '../stores/auth';
import { useUIStore } from '../stores/ui';

const docStore = useDocStore();
const authStore = useAuthStore();
const uiStore = useUIStore();
const { tr } = useI18n();
const { toast } = useToast();
const { confirm } = useConfirm();

const findStr = ref('');
const replaceStr = ref('');
const hasScanned = ref(false);
const scanHits = ref<OccurrenceHit[]>([]);

const scanTotal = computed(() => scanHits.value.reduce((acc, h) => acc + h.n, 0));

function doScan() {
  const q = findStr.value;
  if (!q) {
    toast(tr('请先输入要查找的词', 'Enter a search term first'), 'warn');
    return;
  }
  scanHits.value = scanAllOccurrences(docStore.doc, q);
  hasScanned.value = true;
}

async function doReplaceAll() {
  const from = findStr.value;
  const to = replaceStr.value;
  if (!from) {
    toast(tr('请先输入要查找的词', 'Enter a search term first'), 'warn');
    return;
  }
  const hits = scanAllOccurrences(docStore.doc, from);
  const total = hits.reduce((acc, h) => acc + h.n, 0);
  if (!total) {
    toast(tr('没有找到匹配内容', 'No matches found'), 'warn');
    return;
  }
  const ok = await confirm(
    tr('确认全库替换', 'Confirm Global Replace'),
    tr(
      `将把全库全部 ${total} 处「${from}」替换为「${to}」。替换后可随时点击「撤销上次替换」恢复。`,
      `Replace all ${total} occurrences of "${from}" with "${to}"?`
    )
  );
  if (!ok) return;

  docStore.saveUndoSnapshot();
  const res = replaceAllOccurrences(docStore.doc, from, to, !authStore.isAdmin);
  docStore.replaceDoc(res.doc, false, true);
  hasScanned.value = false;
  scanHits.value = [];
  toast(tr(`已替换 ${res.count} 处 ✓`, `Replaced ${res.count} occurrences ✓`), 'ok');
}

function doUndo() {
  if (docStore.undoLastOperation()) {
    hasScanned.value = false;
    scanHits.value = [];
    toast(tr('已撤销上次替换 ✓', 'Replace undone ✓'), 'ok');
  }
}

const newTerm = reactive({
  term: '',
  std: '',
  note: ''
});

function addTerm() {
  if (!authStore.isLoggedIn) {
    toast(tr('请先登录个人账号，登录后即可自由创建与管理您的专属设定词典~', 'Please sign in to create personal glossary terms.'), 'info');
    uiStore.openModal('auth');
    return;
  }
  const term = newTerm.term.trim();
  if (!term) {
    toast(tr('请填写术语名称', 'Term is required'), 'warn');
    return;
  }
  if (docStore.doc.glossary.some((g) => g.term === term)) {
    toast(tr('该术语已存在', 'Term already exists'), 'warn');
    return;
  }
  docStore.doc.glossary.push({
    id: uid('gl_'),
    term,
    std: newTerm.std.trim(),
    cat: newTerm.std.trim(),
    note: newTerm.note.trim(),
    def: newTerm.note.trim(),
    updatedAt: Date.now()
  });
  newTerm.term = '';
  newTerm.std = '';
  newTerm.note = '';
  docStore.touch(true);
  toast(tr('已添加术语 ✓', 'Added term ✓'), 'ok');
}

function removeTerm(id: string) {
  const g = (docStore.doc.glossary || []).find((x) => x.id === id);
  if (g?.isReference && !authStore.isAdmin) {
    toast('此词条为官方公共参考素材，仅供大家查阅与引用~', 'warn');
    return;
  }
  docStore.doc.glossary = docStore.doc.glossary.filter((g) => g.id !== id);
  docStore.touch(true);
  toast(tr('已删除', 'Deleted'), 'ok');
}
</script>
