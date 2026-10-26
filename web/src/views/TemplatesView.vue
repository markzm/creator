<template>
  <div class="page-container" style="max-width: 1020px; margin: 0 auto; padding: 20px">
    <div class="row" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; margin-bottom: 18px">
      <div>
        <h2 style="margin: 0; font-size: 20px">🎨 {{ tr('角色模板管理', 'Character Templates') }}</h2>
        <p class="hint" style="margin: 4px 0 0">
          {{ tr('自定义角色字段集，可导出 CC3P 草稿码分享或一键用于创建新角色。', 'Custom field sets for characters. Export CC3P codes or apply to new characters.') }}
        </p>
      </div>
      <div class="row" style="display: flex; gap: 8px; flex-wrap: wrap">
        <button class="btn sm" @click="exportAllCode">⌘ {{ tr('导出模板集码 (CC3P)', 'Export CC3P') }}</button>
        <button class="btn sm" @click="showImportModal = true">📥 {{ tr('导入模板集码', 'Import CC3P') }}</button>
        <button class="btn sm primary" @click="handleNewTemplate">＋ {{ t.tmplNew }}</button>
      </div>
    </div>

    <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 14px">
      <div
        v-for="tpl in templatesList"
        :key="tpl.id"
        class="card"
        style="padding: 18px; position: relative; display: flex; flex-direction: column; justify-content: space-between"
      >
        <div>
          <button
            v-if="(!tpl.builtin && !tpl.isReference) || authStore.isAdmin"
            class="btn sm icon danger"
            style="position: absolute; top: 12px; right: 12px"
            @click="deleteTpl(tpl.id, tpl.name)"
          >
            ✕
          </button>
          <span style="font-size: 26px">🎨</span>
          <h3 style="margin: 8px 0 4px; font-size: 16px">{{ tpl.name }}</h3>
          <p class="hint" style="margin: 0">
            {{ tpl.fields.length }} {{ tr('个字段', 'fields') }}{{ tpl.builtin ? (tr(' · 内置', ' · Built-in')) : '' }}
          </p>
        </div>

        <div style="margin-top: 16px; display: flex; gap: 6px; flex-wrap: wrap">
          <button class="btn sm" @click="viewingTpl = tpl">{{ tr('查看字段', 'View') }}</button>
          <button class="btn sm primary" @click="applyTpl(tpl.id, tpl.name)">{{ tr('用于新角色', 'Use') }}</button>
          <button class="btn sm" @click="exportSingleCode(tpl)">{{ tr('模板码', 'Code') }}</button>
        </div>
      </div>
    </div>

    <!-- View Template -->
    <Modal :model-value="Boolean(viewingTpl)" :title="viewingTpl?.name || ''" max-width="440px" @update:model-value="(v) => !v && (viewingTpl = null)">
      <pre v-if="viewingTpl" class="tpl-pre">{{ viewingTpl.fields.map((f, i) => `${i + 1}. ${f}`).join('\n') }}</pre>
      <template #footer>
        <button class="btn sm primary" @click="viewingTpl = null">{{ tr('关闭', 'Close') }}</button>
      </template>
    </Modal>

    <!-- New Template -->
    <Modal v-model="showNewModal" :title="t.tmplNew" max-width="460px">
      <label class="f-label">{{ t.tmplName }}</label>
      <input v-model="newForm.name" type="text" :placeholder="tr('例：我的修仙模板', 'e.g. Cultivation Template')" style="margin-bottom: 10px" />
      <label class="f-label">{{ t.tmplFields }}</label>
      <textarea v-model="newForm.fields" rows="6"></textarea>
      <template #footer>
        <button class="btn sm" @click="showNewModal = false">{{ tr('取消', 'Cancel') }}</button>
        <button class="btn sm primary" @click="createTemplate">{{ tr('创建', 'Create') }}</button>
      </template>
    </Modal>

    <!-- Exported Code -->
    <Modal :model-value="Boolean(exportedCode)" :title="tr('模板草稿码 · CC3P', 'Template code · CC3P')" max-width="520px" @update:model-value="(v) => !v && (exportedCode = '')">
      <textarea :value="exportedCode" readonly rows="4" class="mono"></textarea>
      <template #footer>
        <button class="btn sm" @click="copyCode">{{ tr('复制', 'Copy') }}</button>
        <button class="btn sm primary" @click="exportedCode = ''">{{ tr('关闭', 'Close') }}</button>
      </template>
    </Modal>

    <!-- Import Code -->
    <Modal v-model="showImportModal" :title="tr('导入模板集码 (CC3P)', 'Import template code (CC3P)')" max-width="520px">
      <textarea v-model="importCodeStr" rows="4" placeholder="CC3Pr-..." class="mono"></textarea>
      <template #footer>
        <button class="btn sm" @click="showImportModal = false">{{ tr('取消', 'Cancel') }}</button>
        <button class="btn sm primary" @click="doImportCode">{{ tr('导入', 'Import') }}</button>
      </template>
    </Modal>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import Modal from '../components/base/Modal.vue';
import { useConfirm } from '../composables/useConfirm';
import { useI18n } from '../composables/useI18n';
import { useToast } from '../composables/useToast';
import { buildCode, parseRawCodeItems } from '../core/draftCode';
import type { TemplateDef } from '../core/schema/types';
import { uid } from '../core/uid';
import { useDocStore } from '../stores/doc';
import { useAuthStore } from '../stores/auth';
import { useUIStore } from '../stores/ui';

const docStore = useDocStore();
const authStore = useAuthStore();
const uiStore = useUIStore();
const router = useRouter();
const { t, tr } = useI18n();
const { toast } = useToast();
const { confirm } = useConfirm();

function handleNewTemplate() {
  if (!authStore.isLoggedIn) {
    toast(tr('请先登录个人账号，登录后即可自由创建与管理您的专属设定模板~', 'Please sign in to create personal templates.'), 'info');
    uiStore.openModal('auth');
    return;
  }
  openNewModal();
}

const templatesList = computed(() => Object.values(docStore.doc.templates || {}));

const viewingTpl = ref<TemplateDef | null>(null);
const showNewModal = ref(false);
const newForm = reactive({
  name: '',
  fields: '姓名\n一句话简介\n三个关键词\n核心冲突'
});
const exportedCode = ref('');
const showImportModal = ref(false);
const importCodeStr = ref('');

function openNewModal() {
  newForm.name = '';
  newForm.fields = '姓名\n一句话简介\n三个关键词\n核心冲突';
  showNewModal.value = true;
}

function createTemplate() {
  const name = newForm.name.trim();
  if (!name) {
    toast(tr('模板名不能为空', 'Template name required'), 'warn');
    return;
  }
  const fields = newForm.fields
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
  if (!fields.length) {
    toast(tr('字段列表不能为空', 'Fields required'), 'warn');
    return;
  }
  const id = uid('tp_');
  docStore.doc.templates[id] = {
    id,
    name,
    fields,
    builtin: false,
    updatedAt: Date.now()
  };
  docStore.touch(true);
  showNewModal.value = false;
  toast(tr(`已创建模板「${name}」`, `Created template "${name}"`), 'ok');
}

async function deleteTpl(id: string, name: string) {
  const tpl = docStore.doc.templates[id];
  if ((tpl?.builtin || tpl?.isReference) && !authStore.isAdmin) {
    toast('官方公共参考素材不可直接删除~', 'warn');
    return;
  }
  if (!(await confirm(t.value.delConfirm, t.value.tmplDelConfirm(name)))) return;
  delete docStore.doc.templates[id];
  docStore.touch(true);
  toast(tr('已删除', 'Deleted'), 'ok');
}

function applyTpl(id: string, name: string) {
  docStore.createChar(id);
  toast(tr(`已用模板「${name}」创建新角色`, `Created character with template "${name}"`), 'ok');
  router.push('/char');
}

function exportSingleCode(tpl: TemplateDef) {
  const payload = { [tpl.id]: { id: tpl.id, name: tpl.name, fields: tpl.fields } };
  const code = buildCode({ templates: JSON.stringify(payload) }, ['templates'], 'CC3P');
  if (code) exportedCode.value = code;
}

function exportAllCode() {
  const code = buildCode({ templates: JSON.stringify(docStore.doc.templates) }, ['templates'], 'CC3P');
  if (code) exportedCode.value = code;
}

async function copyCode() {
  try {
    await navigator.clipboard.writeText(exportedCode.value);
    toast(t.value.codeCopied, 'ok');
  } catch {
    toast(tr('复制失败', 'Copy failed'), 'warn');
  }
}

function doImportCode() {
  try {
    const c = importCodeStr.value.trim();
    if (!c.startsWith('CC3P')) throw new Error(tr('前缀无效', 'Invalid CC3P prefix'));
    const { items } = parseRawCodeItems(c);
    const tpls = JSON.parse(items[0] || '{}');
    if (!tpls || typeof tpls !== 'object') throw new Error('Invalid format');
    Object.assign(docStore.doc.templates, tpls);
    docStore.touch(true);
    showImportModal.value = false;
    importCodeStr.value = '';
    toast(tr(`已导入 ${Object.keys(tpls).length} 个模板 ✓`, `Imported ${Object.keys(tpls).length} templates ✓`), 'ok');
  } catch (e: any) {
    toast(t.value.importFail + (e?.message || ''), 'err');
  }
}
</script>

<style scoped>
.tpl-pre { background: var(--soft); padding: 12px; border-radius: 8px; max-height: 300px; overflow: auto; font-size: 13px; margin: 0; }
</style>
