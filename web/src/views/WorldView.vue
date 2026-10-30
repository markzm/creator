<template>
  <div v-if="world">
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
          kind="world"
          :title="tr('世界观列表', 'Worlds')"
          :items="worldList"
          :active-id="world.id"
          @select="onSelectWorld"
          @create="handleCreate"
          @duplicate="handleDuplicate"
          @fork="(id) => handleFork('world', id)"
          @delete="onDeleteWorld"
        />

        <div>
          <!-- Reference Material Status Banner -->
          <div
            v-if="world.isReference"
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
                      ? tr('您正以网站管理员身份修改全站示范素材，保存后将同步至全站。', 'You are editing official materials as admin.')
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
                @click="handleFork('world', world.id)"
              >
                📑 {{ tr('复制为衍生副本 (二次创作)', 'Fork Personal Copy') }}
              </button>
            </div>
          </div>

          <InspirationOrigin :id="world.inspirationId" />
          <!-- Toolbar -->
          <div class="row" style="margin: 0 0 12px">
            <button type="button" class="btn sm" @click="setAllOpen(true)">
              {{ t.expand }}
            </button>
            <button type="button" class="btn sm" @click="setAllOpen(false)">
              {{ t.collapse }}
            </button>
            <button type="button" class="btn sm" @click="uiStore.openGuide('world', WG)">
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
            <button
              v-if="!isReadOnlyReference && world"
              type="button"
              class="btn sm"
              :title="tr('发起或管理这个世界的共创企划', 'Start or manage co-creation for this world')"
              @click="uiStore.openCocreationManage(world.id)"
            >
              🤝 {{ world.isCocreation ? tr('共创企划', 'Co-creation') : tr('发起共创', 'Co-create') }}
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
                  `检测到世界观改名：「${pendingRename.oldName}」→「${pendingRename.newName}」，是否同步更新全库 ${pendingRename.refCount} 处关联引用？`,
                  `Renamed "${pendingRename.oldName}" → "${pendingRename.newName}". Update ${pendingRename.refCount} linked references across the database?`
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
            v-for="(g, gi) in WG"
            :key="gi"
            :group="g"
            :index="gi"
            :data="world.data"
            :open="allOpenState"
            :invalid-fields="invalidFields"
            :readonly="isReadOnlyReference"
            @update-field="onUpdateField"
            @clear-group="onClearGroup"
            @roll="fillInspiration"
            @ai-gen="fillWithAI"
            @field-blur="onFieldBlur"
          />

          <!-- Custom Inspiration Pool -->
          <CustomInspPanel
            :list="world.customInsp || []"
            :readonly="isReadOnlyReference"
            @update:list="onUpdateCustomInsp"
          />

          <!-- Related Orgs & Chars in this World -->
          <section class="card" :class="{ open: relOpen }">
            <div class="card-h" @click="relOpen = !relOpen">
              <span class="idx">REL</span>
              <h3>
                🌍 {{ tr('所属组织与角色', 'Affiliated Orgs & Characters') }}
                ({{ relatedOrgs.length + relatedChars.length }})
              </h3>
              <span class="arrow">▶</span>
            </div>
            <div class="card-b">
              <p
                v-if="!world.data.w_name"
                class="hint"
                style="display: block; margin-top: 8px"
              >
                {{ tr('给世界观起个名，就可以看到关联条目。', 'Name this world to see affiliated entries.') }}
              </p>
              <template v-else>
                <p
                  v-if="!relatedOrgs.length && !relatedChars.length"
                  class="hint"
                  style="display: block; margin-top: 8px"
                >
                  {{ tr('还没有角色或组织挂载到这个世界观。', 'No orgs or characters linked to this world yet.') }}
                </p>

                <div v-if="relatedOrgs.length" style="margin-top: 8px">
                  <p style="font-size: 12px; color: var(--mu); margin: 0 0 6px">
                    {{ tr('组织', 'Organizations') }} ({{ relatedOrgs.length }})
                  </p>
                  <div
                    v-for="o in relatedOrgs"
                    :key="o.id"
                    style="
                      padding: 6px 10px;
                      background: var(--acs);
                      border-radius: 8px;
                      margin-bottom: 5px;
                      cursor: pointer;
                    "
                    @click="jumpToOrg(o.id)"
                  >
                    <strong>{{ o.data.o_name || o.name }}</strong>
                    <span style="color: var(--mu); font-size: 12px; margin-left: 8px">
                      {{ o.data.o_type || '' }}
                    </span>
                  </div>
                </div>

                <div v-if="relatedChars.length" style="margin-top: 12px">
                  <p style="font-size: 12px; color: var(--mu); margin: 0 0 6px">
                    {{ tr('角色', 'Characters') }} ({{ relatedChars.length }})
                  </p>
                  <div
                    v-for="c in relatedChars"
                    :key="c.id"
                    style="
                      padding: 6px 10px;
                      background: var(--acs);
                      border-radius: 8px;
                      margin-bottom: 5px;
                      cursor: pointer;
                    "
                    @click="jumpToChar(c.id)"
                  >
                    <strong>{{ c.data.name || c.name }}</strong>
                    <span style="color: var(--mu); font-size: 12px; margin-left: 8px">
                      {{ c.data.race || '' }}
                    </span>
                  </div>
                </div>
              </template>
            </div>
          </section>

          <!-- Backlinks -->
          <BacklinksPanel :items="backlinks" />

          <!-- Draft Code -->
          <DraftCodePanel
            :data="world.data"
            :order="WORLD_ORDER"
            prefix="CC3W"
            expected-kind="world"
            :readonly="isReadOnlyReference"
            @import-data="onImportDraftData"
          />

          <!-- Consistency Checks -->
          <ConsistencyBox :issues="consistencyIssues" />

          <!-- Output & Share -->
          <OutputPanel
            kind="world"
            :groups="WG"
            :data="world.data"
            :entity-id="world.id"
            :entity-name="world.data.w_name || world.name"
            :draft-order="WORLD_ORDER"
            draft-prefix="CC3W"
            :readonly="isReadOnlyReference"
            @validate-required="validateRequiredFields"
            @clear-all="onClearAll"
            @open-guide="uiStore.openGuide('world', WG)"
          />

          <!-- AI Generation Modal -->
          <AIGenerateModal
            v-model="aiModalOpen"
            kind="world"
            :entity-data="world.data"
            :entity-id="world.id"
            @apply="onApplyAIGen"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import InspirationOrigin from '../components/inspiration/InspirationOrigin.vue';
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AIGenerateModal from '../components/editor/AIGenerateModal.vue';
import BacklinksPanel from '../components/editor/BacklinksPanel.vue';
import ConsistencyBox from '../components/editor/ConsistencyBox.vue';
import CustomInspPanel from '../components/editor/CustomInspPanel.vue';
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
import { WG, WORLD_ORDER } from '../core/legacy/fields';
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

const world = computed(() => docStore.activeWorld);
const worldList = computed(() => Object.values(docStore.doc.worlds || {}));
const isReadOnlyReference = computed(() => Boolean(world.value?.isReference && !authStore.isAdmin));

function handleCreate() {
  if (!authStore.isLoggedIn) {
    toast(tr('请先登录个人账号，登录后即可自由创建与管理您的专属设定素材~', 'Please sign in to create personal materials.'), 'info');
    uiStore.openModal('auth');
    return;
  }
  docStore.createWorld();
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
  docStore.duplicateWorld();
}

const allOpenState = ref(true);
const relOpen = ref(false);
const invalidFields = ref<Set<string>>(new Set());
const aiModalOpen = ref(false);

const committedName = ref('');
const pendingRename = ref<{ oldName: string; newName: string; refCount: number } | null>(null);

watch(
  () => route.params.id,
  (id) => {
    if (typeof id === 'string' && id && docStore.doc.worlds[id]) {
      docStore.selectWorld(id);
    }
  },
  { immediate: true }
);

watch(
  () => world.value?.id,
  () => {
    committedName.value = (world.value?.data?.w_name || '').trim();
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
  'world',
  () => world.value,
  () => WG
);

const relatedOrgs = computed(() => {
  const wname = (world.value?.data?.w_name || '').trim();
  if (!wname) return [];
  return Object.values(docStore.doc.orgs || {}).filter(
    (o) => o.data && o.data.o_world === wname
  );
});

const relatedChars = computed(() => {
  const wname = (world.value?.data?.w_name || '').trim();
  if (!wname) return [];
  return Object.values(docStore.doc.chars || {}).filter(
    (c) => c.data && c.data.world === wname
  );
});

function setAllOpen(open: boolean) {
  allOpenState.value = open;
}

function onSelectWorld(id: string) {
  docStore.selectWorld(id);
}

function onUpdateField(fieldId: string, val: string) {
  if (!world.value || isReadOnlyReference.value) return;
  world.value.data[fieldId] = val;
  invalidFields.value.delete(fieldId);
  docStore.syncEntityName('world', world.value);
  docStore.touch();
}

function onFieldBlur(fieldId: string) {
  if (fieldId !== 'w_name' || !world.value) return;
  const newName = (world.value.data.w_name || '').trim();
  const oldName = committedName.value;
  if (oldName && newName && oldName !== newName && oldName !== '未命名') {
    const refs = findBacklinks(docStore.doc, world.value.id, oldName);
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
  if (!world.value || isReadOnlyReference.value) return;
  fieldIds.forEach((fid) => {
    world.value!.data[fid] = '';
  });
  docStore.syncEntityName('world', world.value);
  docStore.touch();
}

async function onClearAll() {
  if (!world.value || isReadOnlyReference.value) return;
  if (!(await confirm(t.value.clearConfirm, t.value.clearAllConfirm))) return;
  world.value.data = {};
  docStore.syncEntityName('world', world.value);
  docStore.touch(true);
  toast(t.value.clearAllDone, 'ok');
}

async function onDeleteWorld() {
  if (!world.value) return;
  if (world.value.isReference && !authStore.isAdmin) {
    docStore.deleteWorld(world.value.id);
    return;
  }
  if (worldList.value.length <= 1) {
    toast(tr('至少保留一个世界观', 'Keep at least one world'), 'warn');
    return;
  }
  const nm = world.value.data.w_name || world.value.name || t.value.unnamed;
  if (
    !(await confirm(
      tr('删除世界观', 'Delete World'),
      tr(`确定删除世界观「${nm}」？`, `Delete "${nm}"?`)
    ))
  ) {
    return;
  }
  docStore.deleteWorld(world.value.id);
  toast(tr('已删除', 'Deleted'), 'ok');
}

function onUpdateCustomInsp(next: string[]) {
  if (!world.value || isReadOnlyReference.value) return;
  world.value.customInsp = next;
  docStore.touch();
}

function onApplyAIGen(content: string) {
  if (!world.value || isReadOnlyReference.value) return;
  if (!world.value.data.w_core) {
    world.value.data.w_core = content;
  } else {
    world.value.data.w_extra = (world.value.data.w_extra ? world.value.data.w_extra + '\n\n' : '') + content;
  }
  docStore.syncEntityName('world', world.value);
  docStore.touch(true);
}

function onImportDraftData(data: Record<string, string>) {
  if (!world.value || isReadOnlyReference.value) return;
  world.value.data = { ...data };
  docStore.syncEntityName('world', world.value);
  committedName.value = (world.value.data.w_name || '').trim();
  docStore.touch(true);
}

function validateRequiredFields() {
  if (!world.value) return false;
  const nextInvalid = new Set<string>();
  WG.flatMap((g) => g.f).forEach((f) => {
    if (f.r && !(world.value!.data[f.id] || '').trim()) {
      nextInvalid.add(f.id);
    }
  });
  invalidFields.value = nextInvalid;
  return nextInvalid.size === 0;
}

function jumpToOrg(id: string) {
  docStore.selectOrg(id);
  router.push('/org');
}

function jumpToChar(id: string) {
  docStore.selectChar(id);
  router.push('/char');
}
</script>
