<template>
  <div v-if="org">
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
          kind="org"
          :title="tr('组织列表', 'Organizations')"
          :items="orgList"
          :active-id="org.id"
          @select="docStore.selectOrg"
          @create="handleCreate"
          @duplicate="handleDuplicate"
          @fork="(id) => handleFork('org', id)"
          @delete="onDeleteOrg"
        />

        <div>
          <!-- Reference Material Status Banner -->
          <div
            v-if="org.isReference"
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
                      : tr('官方公共参考素材（只读查阅与引用模式）', 'Official Reference Material (Read-only)')
                  }}
                </strong>
                <div style="font-size: 12px; color: var(--mu)">
                  {{
                    authStore.isAdmin
                      ? tr('您正以网站管理员身份修改全站示范组织，保存后将同步至全站。', 'You are editing official materials as admin.')
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
                @click="handleFork('org', org.id)"
              >
                📑 {{ tr('复制为衍生副本 (二次创作)', 'Fork Personal Copy') }}
              </button>
            </div>
          </div>

          <!-- Toolbar -->
          <div class="row" style="margin: 0 0 12px">
            <button type="button" class="btn sm" @click="allOpenState = true">
              {{ t.expand }}
            </button>
            <button type="button" class="btn sm" @click="allOpenState = false">
              {{ t.collapse }}
            </button>
            <button type="button" class="btn sm" @click="uiStore.openGuide('org', OG)">
              🧭 {{ t.guide }}
            </button>
            <button
              v-if="!isReadOnlyReference"
              type="button"
              class="btn sm primary"
              @click="aiModalOpen = true"
            >
              ✨ {{ tr('AI 智能构思', 'AI Assistant') }}
            </button>
            <span class="spacer" />
            <button
              v-if="!isReadOnlyReference"
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
                  `检测到组织改名：「${pendingRename.oldName}」→「${pendingRename.newName}」，是否同步更新全库 ${pendingRename.refCount} 处关联引用？`,
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
            v-for="(g, gi) in OG"
            :key="gi"
            :group="g"
            :index="gi"
            :data="org.data"
            :open="allOpenState"
            :invalid-fields="invalidFields"
            :readonly="isReadOnlyReference"
            @update-field="onUpdateField"
            @clear-group="onClearGroup"
            @roll="fillInspiration"
            @ai-gen="fillWithAI"
            @field-blur="onFieldBlur"
          />

          <!-- Organization Members Panel -->
          <section class="card" :class="{ open: memOpen }">
            <div class="card-h" @click="memOpen = !memOpen">
              <span class="idx">MEM</span>
              <h3>👥 {{ tr('组织成员', 'Organization Members') }} ({{ members.length }})</h3>
              <button
                v-if="!isReadOnlyReference"
                type="button"
                class="btn sm primary"
                @click.stop="openAddMemberModal"
              >
                ＋ {{ t.addMem }}
              </button>
              <span class="arrow">▶</span>
            </div>
            <div class="card-b">
              <p v-if="!orgName" class="hint" style="display: block; margin-top: 8px">
                {{ tr('先给组织起个名，就可以添加成员。', 'Name this organization first to add members.') }}
              </p>
              <p v-else-if="!members.length" class="hint" style="display: block; margin-top: 8px">
                {{ tr('还没有成员。点「添加成员」从角色库中选择。', 'No members yet. Click "Add member" to pick from characters.') }}
              </p>
              <div v-else style="margin-top: 8px">
                <div
                  v-for="m in members"
                  :key="m.charId"
                  style="
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    padding: 8px 12px;
                    background: var(--acs);
                    border-radius: 10px;
                    margin-bottom: 6px;
                  "
                >
                  <strong
                    style="flex: 1; cursor: pointer"
                    @click="jumpToChar(m.charId)"
                  >
                    {{ m.charName }}
                  </strong>
                  <span style="color: var(--mu); font-size: 12px">{{ m.role || '—' }}</span>
                  <span style="color: var(--mu); font-size: 12px">{{ m.term || '' }}</span>
                  <span style="color: var(--mu); font-size: 12px">{{ m.status || '' }}</span>
                  <button
                    v-if="!isReadOnlyReference"
                    type="button"
                    class="btn sm danger"
                    @click="removeMember(m.charId)"
                  >
                    {{ tr('移除', 'Remove') }}
                  </button>
                </div>
              </div>
            </div>
          </section>

          <!-- Backlinks -->
          <BacklinksPanel :items="backlinks" />

          <!-- Draft Code -->
          <DraftCodePanel
            :data="org.data"
            :order="ORG_ORDER"
            prefix="CC2O"
            expected-kind="org"
            :readonly="isReadOnlyReference"
            @import-data="onImportDraftData"
          />

          <!-- Consistency Checks -->
          <ConsistencyBox :issues="consistencyIssues" />

          <!-- Output & Share -->
          <OutputPanel
            kind="org"
            :groups="OG"
            :data="org.data"
            :entity-name="org.data.o_name || org.name"
            :draft-order="ORG_ORDER"
            draft-prefix="CC2O"
            :readonly="isReadOnlyReference"
            @validate-required="validateRequiredFields"
            @clear-all="onClearAll"
            @open-guide="uiStore.openGuide('org', OG)"
          />

          <!-- AI Generation Modal -->
          <AIGenerateModal
            v-model="aiModalOpen"
            kind="org"
            :entity-data="org.data"
            @apply="onApplyAIGen"
          />
        </div>
      </div>
    </div>

    <!-- Add Member Modal -->
    <Modal
      v-model="addMemModalOpen"
      :title="tr(`添加成员到「${orgName}」`, `Add Members to ${orgName}`)"
      max-width="520px"
    >
      <div style="max-height: 340px; overflow-y: auto; margin: 8px 0">
        <p v-if="!namedChars.length" class="hint" style="display: block">
          {{ tr('还没有已命名的角色。', 'No named characters yet.') }}
        </p>
        <label
          v-for="c in namedChars"
          :key="c.id"
          style="
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 8px 10px;
            border-radius: 8px;
            cursor: pointer;
          "
          :style="{ opacity: alreadyMemberIds.has(c.id) ? 0.45 : 1 }"
        >
          <input
            v-model="selectedMemberIds"
            type="checkbox"
            :value="c.id"
            :disabled="alreadyMemberIds.has(c.id)"
            style="width: auto"
          />
          <span style="flex: 1; font-weight: 600">{{ c.data.name || c.name }}</span>
          <input
            v-model="memberRoles[c.id]"
            type="text"
            :placeholder="tr('职位', 'Role')"
            style="width: 110px; font-size: 12px; padding: 4px 8px"
          />
          <input
            v-model="memberTerms[c.id]"
            type="text"
            :placeholder="tr('任期', 'Term')"
            style="width: 90px; font-size: 12px; padding: 4px 8px"
          />
        </label>
      </div>
      <template #footer>
        <button type="button" class="btn sm" @click="addMemModalOpen = false">
          {{ tr('取消', 'Cancel') }}
        </button>
        <button type="button" class="btn primary sm" @click="confirmAddMembers">
          {{ tr('确认添加', 'Add') }}
        </button>
      </template>
    </Modal>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import Modal from '../components/base/Modal.vue';
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
import { OG, ORG_ORDER } from '../core/legacy/fields';
import { useDocStore } from '../stores/doc';
import { useUIStore } from '../stores/ui';
import { useAuthStore } from '../stores/auth';

const docStore = useDocStore();
const uiStore = useUIStore();
const authStore = useAuthStore();
const route = useRoute();
const router = useRouter();
const { t, tr } = useI18n();
const { confirm } = useConfirm();
const { toast } = useToast();

const org = computed(() => docStore.activeOrg);
const orgList = computed(() => Object.values(docStore.doc.orgs || {}));
const orgName = computed(() => (org.value?.data?.o_name || '').trim());
const isReadOnlyReference = computed(() => Boolean(org.value?.isReference && !authStore.isAdmin));

function handleCreate() {
  if (!authStore.isLoggedIn) {
    toast(tr('请先登录个人账号，登录后即可自由创建与管理您的专属设定素材~', 'Please sign in to create personal materials.'), 'info');
    uiStore.openModal('auth');
    return;
  }
  docStore.createOrg();
}

function handleFork(kind: any, id: string) {
  if (!authStore.isLoggedIn) {
    toast(tr('请先登录个人账号，登录后即可一键复制官方素材至您的专属库进行二次创作~', 'Please sign in to fork official materials into your personal studio.'), 'info');
    uiStore.openModal('auth');
    return;
  }
  docStore.forkReferenceEntity(kind, id);
}

function handleDuplicate() {
  if (isReadOnlyReference.value) return;
  docStore.duplicateOrg();
}

const allOpenState = ref(true);
const memOpen = ref(true);
const invalidFields = ref<Set<string>>(new Set());
const aiModalOpen = ref(false);

const committedName = ref('');
const pendingRename = ref<{ oldName: string; newName: string; refCount: number } | null>(null);

const addMemModalOpen = ref(false);
const selectedMemberIds = ref<string[]>([]);
const memberRoles = reactive<Record<string, string>>({});
const memberTerms = reactive<Record<string, string>>({});

watch(
  () => route.params.id,
  (id) => {
    if (typeof id === 'string' && id && docStore.doc.orgs[id]) {
      docStore.selectOrg(id);
    }
  },
  { immediate: true }
);

watch(
  () => org.value?.id,
  () => {
    committedName.value = (org.value?.data?.o_name || '').trim();
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
  'org',
  () => org.value,
  () => OG
);

const namedChars = computed(() =>
  Object.values(docStore.doc.chars || {}).filter((c) => c.data && c.data.name)
);

const members = computed(() => {
  const oname = orgName.value;
  if (!oname) return [];
  const res: Array<{
    charId: string;
    charName: string;
    role: string;
    term: string;
    status: string;
  }> = [];
  namedChars.value.forEach((c) => {
    const lines = (c.data.orgs || '').split('\n').filter((l) => l.trim());
    lines.forEach((line) => {
      const p = line.split('|').map((s) => s.trim());
      if (p[0] === oname) {
        res.push({
          charId: c.id,
          charName: c.data.name,
          role: p[1] || '',
          term: p[2] || '',
          status: p[3] || ''
        });
      }
    });
  });
  return res;
});

const alreadyMemberIds = computed(() => new Set(members.value.map((m) => m.charId)));

function onUpdateField(fieldId: string, val: string) {
  if (!org.value || isReadOnlyReference.value) return;
  org.value.data[fieldId] = val;
  invalidFields.value.delete(fieldId);
  docStore.syncEntityName('org', org.value);
  docStore.touch();
}

function onFieldBlur(fieldId: string) {
  if (fieldId !== 'o_name' || !org.value) return;
  const newName = (org.value.data.o_name || '').trim();
  const oldName = committedName.value;
  if (oldName && newName && oldName !== newName && oldName !== '未命名') {
    const refs = findBacklinks(docStore.doc, org.value.id, oldName);
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

function onClearGroup(fieldIds: string[]) {
  if (!org.value || isReadOnlyReference.value) return;
  fieldIds.forEach((fid) => {
    org.value!.data[fid] = '';
  });
  docStore.syncEntityName('org', org.value);
  docStore.touch();
}

async function onClearAll() {
  if (!org.value || isReadOnlyReference.value) return;
  if (!(await confirm(t.value.clearConfirm, t.value.clearAllConfirm))) return;
  org.value.data = {};
  docStore.syncEntityName('org', org.value);
  docStore.touch(true);
  toast(t.value.clearAllDone, 'ok');
}

async function onDeleteOrg() {
  if (!org.value) return;
  if (org.value.isReference && !authStore.isAdmin) {
    docStore.deleteOrg(org.value.id);
    return;
  }
  if (orgList.value.length <= 1) {
    toast(tr('至少保留一个组织', 'Keep at least one organization'), 'warn');
    return;
  }
  const nm = org.value.data.o_name || org.value.name || t.value.unnamed;
  if (
    !(await confirm(
      tr('删除组织', 'Delete Organization'),
      tr(`确定删除组织「${nm}」？`, `Delete "${nm}"?`)
    ))
  ) {
    return;
  }
  docStore.deleteOrg(org.value.id);
  toast(tr('已删除', 'Deleted'), 'ok');
}

function openAddMemberModal() {
  if (isReadOnlyReference.value) return;
  if (!orgName.value) {
    toast(tr('先给组织起名', 'Name the organization first'), 'warn');
    return;
  }
  selectedMemberIds.value = [];
  addMemModalOpen.value = true;
}

function confirmAddMembers() {
  if (isReadOnlyReference.value) return;
  if (!selectedMemberIds.value.length) {
    toast(tr('没有选择角色', 'No characters selected'), 'warn');
    return;
  }
  let n = 0;
  selectedMemberIds.value.forEach((cid) => {
    const ch = docStore.doc.chars[cid];
    if (!ch) return;
    const role = (memberRoles[cid] || '').trim();
    const term = (memberTerms[cid] || '').trim();
    const cur = (ch.data.orgs || '').split('\n').filter((l) => l.trim());
    cur.push(`${orgName.value} | ${role} | ${term} | 在职`);
    ch.data.orgs = cur.join('\n');
    n++;
  });
  docStore.touch(true);
  addMemModalOpen.value = false;
  toast(t.value.memAdded.replace('%s', String(n)), 'ok');
}

async function removeMember(charId: string) {
  if (!orgName.value || isReadOnlyReference.value) return;
  if (
    !(await confirm(
      tr('移除成员', 'Remove Member'),
      t.value.memRemoveConfirm(orgName.value)
    ))
  ) {
    return;
  }
  const ch = docStore.doc.chars[charId];
  if (!ch || !ch.data) return;
  const lines = (ch.data.orgs || '').split('\n').filter((l) => {
    const p = l.split('|').map((s) => s.trim());
    return p[0] !== orgName.value;
  });
  ch.data.orgs = lines.join('\n');
  docStore.touch(true);
  toast(tr('已移除', 'Removed'), 'ok');
}

function onApplyAIGen(content: string) {
  if (!org.value || isReadOnlyReference.value) return;
  if (!org.value.data.o_core) {
    org.value.data.o_core = content;
  } else {
    org.value.data.o_history = (org.value.data.o_history ? org.value.data.o_history + '\n\n' : '') + content;
  }
  docStore.syncEntityName('org', org.value);
  docStore.touch(true);
}

function onImportDraftData(data: Record<string, string>) {
  if (!org.value || isReadOnlyReference.value) return;
  org.value.data = { ...data };
  docStore.syncEntityName('org', org.value);
  committedName.value = (org.value.data.o_name || '').trim();
  docStore.touch(true);
}

function validateRequiredFields() {
  if (!org.value) return false;
  const nextInvalid = new Set<string>();
  OG.flatMap((g) => g.f).forEach((f) => {
    if (f.r && !(org.value!.data[f.id] || '').trim()) {
      nextInvalid.add(f.id);
    }
  });
  invalidFields.value = nextInvalid;
  return nextInvalid.size === 0;
}

function jumpToChar(id: string) {
  docStore.selectChar(id);
  router.push('/char');
}
</script>
