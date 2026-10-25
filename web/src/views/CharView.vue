<template>
  <div v-if="char">
    <ProgressBar
      :done="requiredProgress.done"
      :total="requiredProgress.total"
      :pct="requiredProgress.pct"
      :char-count="totalCharCount"
      :last-saved-at="docStore.lastSavedAt"
    />

    <div class="wrap">
      <div class="editor-split">
        <EntityListPane
          kind="char"
          :title="tr('角色列表', 'Characters')"
          :items="charList"
          :active-id="char.id"
          :templates="docStore.doc.templates"
          @select="docStore.selectChar"
          @create="(tplId) => docStore.createChar(tplId)"
          @duplicate="docStore.duplicateChar()"
          @fork="(id) => docStore.forkReferenceEntity('char', id)"
          @delete="onDeleteChar"
        />

        <div>
          <!-- Reference Material Status Banner -->
          <div
            v-if="char.isReference"
            class="card open"
            style="
              padding: 12px 16px;
              margin-bottom: 12px;
              background: var(--acs);
              border-color: var(--ac);
              display: flex;
              align-items: center;
              justify-content: space-between;
              gap: 10px;
              flex-wrap: wrap;
            "
          >
            <div style="display: flex; align-items: center; gap: 8px">
              <span style="font-size: 18px">{{ authStore.isAdmin ? '👑' : '📚' }}</span>
              <div>
                <strong>
                  {{
                    authStore.isAdmin
                      ? tr('官方管理员编辑模式（已解锁）', 'Admin Mode (Editing Reference Material)')
                      : tr('官方公共参考素材（查阅与引用模式）', 'Official Reference Material (Read-only)')
                  }}
                </strong>
                <div style="font-size: 12px; color: var(--mu)">
                  {{
                    authStore.isAdmin
                      ? tr('您正以网站管理员身份修改全站示范角色，保存后将同步至全站。', 'You are editing official materials as admin.')
                      : tr('此条目为官方公共参考素材，仅供大家查阅与引用。如需在此基础上修改或创作，请点击「📑 复制为衍生副本」即可在您的专属库中自由调整~', 'Official reference. Click to fork a personal editable copy.')
                  }}
                </div>
              </div>
            </div>
            <div>
              <button
                v-if="authStore.isAdmin"
                type="button"
                class="btn sm primary"
                @click="docStore.saveOfficialReferenceMaterials()"
              >
                💾 {{ tr('保存为全站最新公共素材', 'Save to Server') }}
              </button>
              <button
                v-else
                type="button"
                class="btn sm primary"
                @click="docStore.forkReferenceEntity('char', char.id)"
              >
                📑 {{ tr('复制为衍生副本 (二次创作)', 'Fork Personal Copy') }}
              </button>
            </div>
          </div>

          <!-- Toolbar -->
          <div class="row" style="margin: 0 0 12px">
            <button
              v-if="!char.templateId"
              type="button"
              class="btn sm primary"
              @click="onAutoPersona"
            >
              ✨ {{ tr('一键人设', 'Auto Persona') }}
            </button>
            <button type="button" class="btn sm" @click="allOpenState = true">
              {{ t.expand }}
            </button>
            <button type="button" class="btn sm" @click="allOpenState = false">
              {{ t.collapse }}
            </button>
            <button type="button" class="btn sm" @click="uiStore.openGuide('char', charGroups)">
              🧭 {{ t.guide }}
            </button>
            <button type="button" class="btn sm primary" @click="aiModalOpen = true">
              ✨ {{ tr('AI 智能构思', 'AI Assistant') }}
            </button>
            <span class="spacer" />
            <button
              v-if="!char.isReference || authStore.isAdmin"
              type="button"
              class="btn sm danger"
              @click="onClearAll"
            >
              {{ t.clear }}
            </button>
          </div>

          <!-- Smart Rename Linked References Banner -->
          <div
            v-if="pendingRename"
            class="card open"
            style="
              padding: 12px 16px;
              margin-bottom: 12px;
              background: var(--acs);
              border-color: var(--ac);
              display: flex;
              align-items: center;
              gap: 10px;
              flex-wrap: wrap;
            "
          >
            <span style="flex: 1; font-size: 13px">
              🔗
              {{
                tr(
                  `检测到角色改名：「${pendingRename.oldName}」→「${pendingRename.newName}」，是否同步更新全库 ${pendingRename.refCount} 处关联引用？`,
                  `Renamed "${pendingRename.oldName}" → "${pendingRename.newName}". Update ${pendingRename.refCount} linked references?`
                )
              }}
            </span>
            <button type="button" class="btn sm primary" @click="applyPendingRename">
              {{ tr('同步更新', 'Update All') }}
            </button>
            <button type="button" class="btn sm" @click="pendingRename = null">
              {{ tr('忽略', 'Dismiss') }}
            </button>
          </div>

          <!-- Field Groups -->
          <FieldGroupCard
            v-for="(g, gi) in charGroups"
            :key="gi"
            :group="g"
            :index="gi"
            :data="char.data"
            :open="allOpenState"
            :invalid-fields="invalidFields"
            @update-field="onUpdateField"
            @clear-group="onClearGroup"
            @roll="fillInspiration"
            @ai-gen="fillWithAI"
            @field-blur="onFieldBlur"
          />

          <!-- Backlinks -->
          <BacklinksPanel :items="backlinks" />

          <!-- Draft Code -->
          <DraftCodePanel
            :data="char.data"
            :order="charDraftOrder"
            :custom-order="customTemplateOrder"
            prefix="CC2"
            expected-kind="char"
            @import-data="onImportDraftData"
          />

          <!-- Consistency Checks -->
          <ConsistencyBox :issues="consistencyIssues" />

          <!-- Output & Share -->
          <OutputPanel
            kind="char"
            :groups="charGroups"
            :data="char.data"
            :entity-name="char.data.name || char.name"
            :draft-order="charDraftOrder"
            draft-prefix="CC2"
            :show-auto-persona="!char.templateId"
            @validate-required="validateRequiredFields"
            @clear-all="onClearAll"
            @open-guide="uiStore.openGuide('char', charGroups)"
            @auto-persona="onAutoPersona"
          />

          <!-- AI Generation Modal -->
          <AIGenerateModal
            v-model="aiModalOpen"
            kind="char"
            :entity-data="char.data"
            @apply="onApplyAIGen"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import AIGenerateModal from '../components/editor/AIGenerateModal.vue';
import BacklinksPanel from '../components/editor/BacklinksPanel.vue';
import ConsistencyBox from '../components/editor/ConsistencyBox.vue';
import DraftCodePanel from '../components/editor/DraftCodePanel.vue';
import EntityListPane from '../components/editor/EntityListPane.vue';
import FieldGroupCard from '../components/editor/FieldGroupCard.vue';
import OutputPanel from '../components/editor/OutputPanel.vue';
import ProgressBar from '../components/editor/ProgressBar.vue';
import { useConfirm } from '../composables/useConfirm';
import { useEntityEditor } from '../composables/useEntityEditor';
import { useI18n } from '../composables/useI18n';
import { useToast } from '../composables/useToast';
import { findBacklinks } from '../core/backlinks';
import { getCharGroups } from '../core/format';
import { CHAR_ORDER } from '../core/legacy/fields';
import { generateRandomPersona } from '../core/persona';
import { useDocStore } from '../stores/doc';
import { useUIStore } from '../stores/ui';
import { useAuthStore } from '../stores/auth';

const docStore = useDocStore();
const uiStore = useUIStore();
const authStore = useAuthStore();
const route = useRoute();
const { t, tr } = useI18n();
const { confirm } = useConfirm();
const { toast } = useToast();

const char = computed(() => docStore.activeChar);
const charList = computed(() => Object.values(docStore.doc.chars || {}));

const charGroups = computed(() => getCharGroups(char.value, docStore.doc.templates));

const customTemplateOrder = computed<string[] | null>(() => {
  const c = char.value;
  if (c && c.templateId && docStore.doc.templates[c.templateId]) {
    return docStore.doc.templates[c.templateId].fields.map(
      (_, i) => `tpl_${c.templateId}_${i}`
    );
  }
  return null;
});

const charDraftOrder = computed<string[]>(
  () => customTemplateOrder.value || CHAR_ORDER
);

const allOpenState = ref(true);
const invalidFields = ref<Set<string>>(new Set());
const aiModalOpen = ref(false);

const committedName = ref('');
const pendingRename = ref<{ oldName: string; newName: string; refCount: number } | null>(null);

watch(
  () => route.params.id,
  (id) => {
    if (typeof id === 'string' && id && docStore.doc.chars[id]) {
      docStore.selectChar(id);
    }
  },
  { immediate: true }
);

watch(
  () => char.value?.id,
  () => {
    committedName.value = (char.value?.data?.name || '').trim();
    pendingRename.value = null;
    invalidFields.value.clear();
  },
  { immediate: true }
);

const {
  totalCharCount,
  requiredProgress,
  consistencyIssues,
  backlinks,
  fillInspiration,
  fillWithAI
} = useEntityEditor(
  'char',
  () => char.value,
  () => charGroups.value
);

function onUpdateField(fieldId: string, val: string) {
  if (!char.value) return;
  char.value.data[fieldId] = val;
  invalidFields.value.delete(fieldId);
  docStore.syncEntityName('char', char.value);
  docStore.touch();
}

function onFieldBlur(fieldId: string) {
  if (fieldId !== 'name' || !char.value) return;
  const newName = (char.value.data.name || '').trim();
  const oldName = committedName.value;
  if (oldName && newName && oldName !== newName && oldName !== '未命名') {
    const refs = findBacklinks(docStore.doc, char.value.id, oldName);
    if (refs.length > 0) {
      pendingRename.value = { oldName, newName, refCount: refs.length };
    }
  }
  committedName.value = newName;
}

function applyPendingRename() {
  if (!pendingRename.value) return;
  const { oldName, newName } = pendingRename.value;
  const count = docStore.renameEntity(oldName, newName);
  pendingRename.value = null;
  toast(tr(`已同步更新 ${count} 处关联引用 ✓`, `Updated ${count} references ✓`), 'ok');
}

function onAutoPersona() {
  if (!char.value) return;
  if (char.value.templateId) {
    toast(tr('模板角色请用模板字段自行发挥', 'Template chars not supported'), 'warn');
    return;
  }
  const { data, filledCount } = generateRandomPersona(char.value.data);
  if (filledCount === 0) {
    toast(tr('常用字段都填过了，没我什么事', 'Key fields already filled'), 'warn');
    return;
  }
  char.value.data = data;
  docStore.syncEntityName('char', char.value);
  committedName.value = (char.value.data.name || '').trim();
  docStore.touch(true);
  toast(tr(`已随机填入 ${filledCount} 项`, `Filled ${filledCount} fields`), 'ok');
}

function onClearGroup(fieldIds: string[]) {
  if (!char.value) return;
  fieldIds.forEach((fid) => {
    char.value!.data[fid] = '';
  });
  docStore.syncEntityName('char', char.value);
  docStore.touch();
}

async function onClearAll() {
  if (!char.value) return;
  if (char.value.isReference && !authStore.isAdmin) {
    toast('官方公共参考素材不可直接清空。如需调整，请点击「📑 复制为衍生副本」在个人库中修改~', 'warn');
    return;
  }
  if (!(await confirm(t.value.clearConfirm, t.value.clearAllConfirm))) return;
  char.value.data = {};
  docStore.syncEntityName('char', char.value);
  docStore.touch(true);
  toast(t.value.clearAllDone, 'ok');
}

async function onDeleteChar() {
  if (!char.value) return;
  if (char.value.isReference && !authStore.isAdmin) {
    docStore.deleteChar(char.value.id);
    return;
  }
  if (charList.value.length <= 1) {
    toast(tr('至少保留一个角色', 'Keep at least one character'), 'warn');
    return;
  }
  const nm = char.value.data.name || char.value.name || t.value.unnamed;
  if (
    !(await confirm(
      tr('删除角色', 'Delete Character'),
      tr(`确定删除角色「${nm}」？此操作无法撤销。`, `Delete "${nm}"? This cannot be undone.`)
    ))
  ) {
    return;
  }
  docStore.deleteChar(char.value.id);
  toast(tr('已删除', 'Deleted'), 'ok');
}

function onApplyAIGen(content: string) {
  if (!char.value) return;
  if (!char.value.data.personality) {
    char.value.data.personality = content;
  } else {
    char.value.data.extra = (char.value.data.extra ? char.value.data.extra + '\n\n' : '') + content;
  }
  docStore.syncEntityName('char', char.value);
  docStore.touch(true);
}

function onImportDraftData(data: Record<string, string>) {
  if (!char.value) return;
  char.value.data = { ...data };
  docStore.syncEntityName('char', char.value);
  committedName.value = (char.value.data.name || '').trim();
  docStore.touch(true);
}

function validateRequiredFields() {
  if (!char.value) return false;
  const nextInvalid = new Set<string>();
  charGroups.value.flatMap((g) => g.f).forEach((f) => {
    if (f.r && !(char.value!.data[f.id] || '').trim()) {
      nextInvalid.add(f.id);
    }
  });
  invalidFields.value = nextInvalid;
  return nextInvalid.size === 0;
}
</script>
