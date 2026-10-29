<template>
  <Modal
    :model-value="uiStore.modals.adminConsole"
    title="🛡️ 管理员治理控制台"
    max-width="760px"
    @update:model-value="(v) => !v && uiStore.closeModal('adminConsole')"
  >
    <div style="display: flex; flex-direction: column; gap: 14px">
      <RouterLink v-if="authStore.isSuperAdmin" class="btn primary" to="/admin/content" @click="uiStore.closeModal('adminConsole')">全站创作管理</RouterLink>
      <!-- Tabs -->
      <div style="display: flex; gap: 8px; border-bottom: 1px solid var(--li2); padding-bottom: 8px">
        <button
          type="button"
          class="tab-btn"
          :class="{ active: currentTab === 'users' }"
          @click="currentTab = 'users'"
        >
          👥 创作者权限与惩罚管理
        </button>
        <button
          type="button"
          class="tab-btn"
          :class="{ active: currentTab === 'examples' }"
          @click="currentTab = 'examples'"
        >
          📚 官方范例设定库管理
        </button>
      </div>

      <!-- Tab 1: Users & Permissions -->
      <div v-if="currentTab === 'users'">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px">
          <span class="hint" style="font-size: 12px">
            {{ authStore.isSuperAdmin ? '超级管理员已锁定，可授予普通管理员并管理其他账号。' : '管理员权限生效：可管理禁言创作者、限制登录账号与解除惩罚。' }}
          </span>
          <button type="button" class="btn sm" :disabled="loadingUsers" @click="fetchUsers">
            🔄 刷新
          </button>
        </div>

        <input type="text" v-model="userSearch" class="input" placeholder="搜索昵称或邮箱" style="width:100%;margin-bottom:10px" />
        <div v-if="loadingUsers" class="hint" style="text-align: center; padding: 30px 0">
          加载用户列表中…
        </div>
        <div v-else style="max-height: 480px; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; padding-right: 4px">
          <div
            v-for="u in usersList"
            :key="u.id"
            class="card flat"
            style="padding: 10px 14px; display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-shrink: 0; min-height: 54px"
          >
            <div style="display: flex; align-items: center; gap: 10px; min-width: 0; flex: 1">
              <Avatar :avatar="u.avatar" :name="u.name" :size="34" style="flex-shrink: 0" />
              <div style="min-width: 0">
                <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap">
                  <strong style="font-size: 13.5px; line-height: 1.4">{{ u.name }}</strong>
                  <span class="hint" style="font-size: 11.5px">({{ u.email }})</span>
                  <span v-if="u.isSuperAdmin" class="pill" style="font-size: 10px; padding: 1px 6px; border-radius: 99px; background: #f59e0b; color: #fff; font-weight: 700">
                    👑 超级管理员
                  </span>
                  <span v-else-if="u.isAdmin" class="pill" style="font-size: 10px; padding: 1px 6px; border-radius: 99px; background: var(--ac); color: #fff; font-weight: 700">
                    🛡️ 管理员
                  </span>
                  <span v-if="u.isMuted" class="pill" style="font-size: 10px; padding: 1px 6px; border-radius: 99px; background: #ef4444; color: #fff; font-weight: 700">
                    🔇 禁言中
                  </span>
                  <span v-if="u.isDisabled" class="pill" style="font-size: 10px; padding: 1px 6px; border-radius: 99px; background: #6b7280; color: #fff; font-weight: 700">
                    🚫 已限制登录
                  </span>
                </div>
                <div class="hint" style="font-size: 11px; margin-top: 2px">
                  UID: {{ u.id }} · 注册于 {{ formatDate(u.createdAt) }}
                </div>
              </div>
            </div>

            <!-- Action buttons -->
            <div v-if="u.id !== authStore.user?.id && !u.isSuperAdmin && (authStore.isSuperAdmin || !u.isAdmin)" style="display: flex; gap: 6px; flex-shrink: 0; align-items: center; flex-wrap: wrap; justify-content: flex-end">
              <!-- super admin toggle -->
              <button
                v-if="authStore.isSuperAdmin && !u.isSuperAdmin"
                type="button"
                class="btn sm"
                style="font-size: 11.5px; padding: 3px 8px; white-space: nowrap"
                @click="toggleUserAdmin(u)"
              >
                {{ u.isAdmin ? '撤销管理员' : '设为管理员' }}
              </button>

              <!-- Mute/Unmute -->
              <button
                type="button"
                class="btn sm"
                style="font-size: 11.5px; padding: 3px 8px; white-space: nowrap"
                @click="toggleUserMute(u)"
              >
                {{ u.isMuted ? '🔊 解除禁言' : '🔇 禁言' }}
              </button>

              <!-- Disable/Enable -->
              <button
                type="button"
                class="btn sm danger"
                style="font-size: 11.5px; padding: 3px 8px; white-space: nowrap"
                @click="toggleUserStatus(u)"
              >
                {{ u.isDisabled ? '🔓 解除登录限制' : '🚫 限制登录' }}
              </button>

              <!-- Lift penalties -->
              <button
                v-if="u.isMuted || u.isDisabled"
                type="button"
                class="btn sm primary"
                style="font-size: 11.5px; padding: 3px 8px; white-space: nowrap"
                @click="liftPenalties(u)"
              >
                ✨ 解除惩罚
              </button>
            </div>
          </div>
        </div>
      </div>

      <div v-if="currentTab === 'users'" style="display:flex;justify-content:space-between;align-items:center;gap:8px">
        <span class="hint">共 {{ userTotal }} 人 · 第 {{ userPage }} 页</span>
        <button class="btn sm" :disabled="userPage <= 1 || loadingUsers" @click="userPage--; fetchUsers()">上一页</button>
        <button class="btn sm" :disabled="userPage * 20 >= userTotal || loadingUsers" @click="userPage++; fetchUsers()">下一页</button>
      </div>
      <!-- Tab 2: Reference Materials Management -->
      <div v-else-if="currentTab === 'examples'">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px">
          <span class="hint" style="font-size: 12px">
            管理员可将当前正在编辑的设定作为官方范例设定库补充，也可以删除自己撰写的范例设定。
          </span>
          <button type="button" class="btn primary sm" style="font-size: 11.5px" @click="showAddExampleModal = true">
            ＋ 增加官方范例设定
          </button>
        </div>

        <div v-if="loadingExamples" class="hint" style="text-align: center; padding: 30px 0">
          加载官方范例列表中…
        </div>
        <div v-else style="max-height: 480px; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; padding-right: 4px">
          <!-- Worlds -->
          <div v-for="w in refWorlds" :key="w.id" class="card flat" style="padding: 10px 14px; display: flex; justify-content: space-between; align-items: center; flex-shrink: 0; min-height: 48px">
            <div>
              <span class="pill" style="font-size: 10.5px; padding: 1px 6px; background: var(--acs); color: var(--ac); margin-right: 6px">🌍 世界观</span>
              <strong style="font-size: 13px">{{ w.name }}</strong>
              <span v-if="w.refAuthorName" class="hint" style="font-size: 11px; margin-left: 6px">贡献者: {{ w.refAuthorName }}</span>
            </div>
            <button
              v-if="canDeleteExample(w)"
              type="button"
              class="btn sm danger"
              style="font-size: 11px; flex-shrink: 0"
              @click="deleteExample('world', w.id, w.name)"
            >
              删除范例
            </button>
          </div>

          <!-- Chars -->
          <div v-for="c in refChars" :key="c.id" class="card flat" style="padding: 10px 14px; display: flex; justify-content: space-between; align-items: center; flex-shrink: 0; min-height: 48px">
            <div>
              <span class="pill" style="font-size: 10.5px; padding: 1px 6px; background: var(--acs); color: var(--ac); margin-right: 6px">👤 角色</span>
              <strong style="font-size: 13px">{{ c.name }}</strong>
              <span v-if="c.refAuthorName" class="hint" style="font-size: 11px; margin-left: 6px">贡献者: {{ c.refAuthorName }}</span>
            </div>
            <button
              v-if="canDeleteExample(c)"
              type="button"
              class="btn sm danger"
              style="font-size: 11px; flex-shrink: 0"
              @click="deleteExample('char', c.id, c.name)"
            >
              删除范例
            </button>
          </div>

          <!-- Orgs -->
          <div v-for="o in refOrgs" :key="o.id" class="card flat" style="padding: 10px 14px; display: flex; justify-content: space-between; align-items: center; flex-shrink: 0; min-height: 48px">
            <div>
              <span class="pill" style="font-size: 10.5px; padding: 1px 6px; background: var(--acs); color: var(--ac); margin-right: 6px">🏛️ 组织</span>
              <strong style="font-size: 13px">{{ o.name }}</strong>
              <span v-if="o.refAuthorName" class="hint" style="font-size: 11px; margin-left: 6px">贡献者: {{ o.refAuthorName }}</span>
            </div>
            <button
              v-if="canDeleteExample(o)"
              type="button"
              class="btn sm danger"
              style="font-size: 11px; flex-shrink: 0"
              @click="deleteExample('org', o.id, o.name)"
            >
              删除范例
            </button>
          </div>

          <!-- Articles -->
          <div v-for="a in refArticles" :key="a.id" class="card flat" style="padding: 10px 14px; display: flex; justify-content: space-between; align-items: center; flex-shrink: 0; min-height: 48px">
            <div>
              <span class="pill" style="font-size: 10.5px; padding: 1px 6px; background: var(--acs); color: var(--ac); margin-right: 6px">🖋️ 文章</span>
              <strong style="font-size: 13px">{{ a.title }}</strong>
              <span v-if="a.refAuthorName" class="hint" style="font-size: 11px; margin-left: 6px">贡献者: {{ a.refAuthorName }}</span>
            </div>
            <button
              v-if="canDeleteExample(a)"
              type="button"
              class="btn sm danger"
              style="font-size: 11px; flex-shrink: 0"
              @click="deleteExample('article', a.id, a.title)"
            >
              删除范例
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Quick Add Example Modal -->
    <Modal
      :model-value="showAddExampleModal"
      title="＋ 增加官方范例设定"
      max-width="500px"
      @update:model-value="(v) => !v && (showAddExampleModal = false)"
    >
      <div style="display: flex; flex-direction: column; gap: 12px">
        <label style="font-size: 12px; font-weight: 700">选择条目类型</label>
        <select v-model="addKind" class="input">
          <option value="world">🌍 世界观设定</option>
          <option value="org">🏛️ 组织设定</option>
          <option value="char">👤 角色设定</option>
          <option value="article">🖋️ 文章作品</option>
        </select>

        <label style="font-size: 12px; font-weight: 700">从您当前库中挑选条目</label>
        <select v-model="selectedItemId" class="input">
          <option v-for="opt in currentEntityOptions" :key="opt.id" :value="opt.id">
            {{ opt.name }}
          </option>
        </select>
      </div>
      <template #footer>
        <button type="button" class="btn sm" @click="showAddExampleModal = false">取消</button>
        <button type="button" class="btn primary sm" :disabled="!selectedItemId" @click="confirmAddExample">
          确认加入官方范例库
        </button>
      </template>
    </Modal>

    <template #footer>
      <button type="button" class="btn sm" @click="uiStore.closeModal('adminConsole')">
        关闭
      </button>
    </template>
  </Modal>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue';
import Avatar from '../base/Avatar.vue';
import Modal from '../base/Modal.vue';
import { useConfirm } from '../../composables/useConfirm';
import { useToast } from '../../composables/useToast';
import type { DocV6 } from '../../core/schema/types';
import { api, type AuthUser } from '../../data/api';
import { useAuthStore } from '../../stores/auth';
import { useDocStore } from '../../stores/doc';
import { useUIStore } from '../../stores/ui';

const authStore = useAuthStore();
const docStore = useDocStore();
const uiStore = useUIStore();
const { toast } = useToast();
const { confirm } = useConfirm();

const currentTab = ref<'users' | 'examples'>('users');
const usersList = ref<AuthUser[]>([]);
const loadingUsers = ref(false);
const userSearch = ref('');
const userPage = ref(1);
const userTotal = ref(0);
let userSequence = 0;
let searchTimer: ReturnType<typeof setTimeout>;
watch(userSearch, () => { clearTimeout(searchTimer); userSequence++; searchTimer = setTimeout(() => { userPage.value = 1; void fetchUsers(); }, 300); });
onUnmounted(() => clearTimeout(searchTimer));

const refDoc = ref<DocV6 | null>(null);
const loadingExamples = ref(false);

const showAddExampleModal = ref(false);
const addKind = ref<'world' | 'org' | 'char' | 'article'>('char');
const selectedItemId = ref('');

const refWorlds = computed(() => Object.values(refDoc.value?.worlds || {}));
const refChars = computed(() => Object.values(refDoc.value?.chars || {}));
const refOrgs = computed(() => Object.values(refDoc.value?.orgs || {}));
const refArticles = computed(() => refDoc.value?.articles || []);

const currentEntityOptions = computed(() => {
  if (addKind.value === 'world') {
    return Object.values(docStore.doc.worlds || {}).map((w) => ({ id: w.id, name: w.name }));
  }
  if (addKind.value === 'org') {
    return Object.values(docStore.doc.orgs || {}).map((o) => ({ id: o.id, name: o.name }));
  }
  if (addKind.value === 'char') {
    return Object.values(docStore.doc.chars || {}).map((c) => ({ id: c.id, name: c.name }));
  }
  return (docStore.doc.articles || []).map((a) => ({ id: a.id, name: a.title }));
});

watch(addKind, () => {
  selectedItemId.value = currentEntityOptions.value[0]?.id || '';
});

async function fetchUsers() {
  const seq = ++userSequence;
  loadingUsers.value = true;
  try {
    const res = await api.getAdminUsers({ q: userSearch.value, page: userPage.value, limit: 20 });
    if (seq !== userSequence) return;
    usersList.value = res.users || [];
    userTotal.value = res.total;
  } catch (err: any) {
    toast(err?.message || '获取用户列表失败', 'err');
  } finally {
    if (seq === userSequence) loadingUsers.value = false;
  }
}

async function fetchReferenceMaterials() {
  loadingExamples.value = true;
  try {
    const res = await api.getReferenceMaterials();
    refDoc.value = res;
  } catch {
    // Ignore error
  } finally {
    loadingExamples.value = false;
  }
}

watch(
  [() => uiStore.modals.adminConsole, currentTab],
  ([open]) => {
    if (open) void (currentTab.value === 'users' ? fetchUsers() : fetchReferenceMaterials());
  }
);

async function toggleUserAdmin(u: AuthUser) {
  const target = !u.isAdmin;
  const actionText = target ? '设为管理员' : '撤销管理员';
  if (!await confirm(`确认${actionText}`, `确定要将创作者 @${u.name} ${actionText}吗？`)) {
    return;
  }
  try {
    await api.setAdminUserRole(u.id, target);
    u.isAdmin = target;
    toast(`已成功${actionText} ✓`, 'ok');
  } catch (err: any) {
    toast(err?.message || '操作失败', 'err');
  }
}

async function toggleUserMute(u: AuthUser) {
  const target = !u.isMuted;
  const actionText = target ? '禁言' : '解除禁言';
  if (!await confirm(`确认${actionText}`, `确定要对创作者 @${u.name} 执行${actionText}操作吗？`)) {
    return;
  }
  try {
    await api.setAdminUserMute(u.id, target, target ? '违反社区守则' : '');
    u.isMuted = target;
    toast(`已成功${actionText} ✓`, 'ok');
  } catch (err: any) {
    toast(err?.message || '操作失败', 'err');
  }
}

async function toggleUserStatus(u: AuthUser) {
  const target = !u.isDisabled;
  const actionText = target ? '限制登录' : '解除登录限制';
  if (!await confirm(`确认${actionText}`, `确定要对创作者 @${u.name} 执行${actionText}操作吗？`)) {
    return;
  }
  try {
    await api.setAdminUserStatus(u.id, target);
    u.isDisabled = target;
    toast(`已成功${actionText} ✓`, 'ok');
  } catch (err: any) {
    toast(err?.message || '操作失败', 'err');
  }
}

async function liftPenalties(u: AuthUser) {
  if (!await confirm('确认解除惩罚', `确定要解除创作者 @${u.name} 的全部惩罚吗？`)) {
    return;
  }
  try {
    await api.liftAdminUserPenalties(u.id);
    u.isMuted = false;
    u.isDisabled = false;
    toast('已解除全部惩罚限制 ✓', 'ok');
  } catch (err: any) {
    toast(err?.message || '操作失败', 'err');
  }
}

function canDeleteExample(item: any): boolean {
  if (authStore.isSuperAdmin) return true;
  return item.refAuthorId === authStore.user?.id;
}

async function confirmAddExample() {
  if (!selectedItemId.value) return;
  let targetItem: any = null;
  if (addKind.value === 'world') {
    targetItem = docStore.doc.worlds[selectedItemId.value];
  } else if (addKind.value === 'org') {
    targetItem = docStore.doc.orgs[selectedItemId.value];
  } else if (addKind.value === 'char') {
    targetItem = docStore.doc.chars[selectedItemId.value];
  } else {
    targetItem = (docStore.doc.articles || []).find((a) => a.id === selectedItemId.value);
  }

  if (!targetItem) {
    toast('未找到对应条目', 'err');
    return;
  }

  try {
    const clone = JSON.parse(JSON.stringify(targetItem));
    await api.addReferenceExample(addKind.value, clone);
    toast('已成功添加到全站官方范例库 ✓', 'ok');
    showAddExampleModal.value = false;
    await fetchReferenceMaterials();
  } catch (err: any) {
    toast(err?.message || '添加范例失败', 'err');
  }
}

async function deleteExample(kind: string, id: string, name: string) {
  if (!await confirm('确认删除官方范例', `确定要删除范例条目《${name}》吗？`)) {
    return;
  }
  try {
    await api.deleteReferenceExample(kind, id);
    toast('范例设定已删除 ✓', 'ok');
    await fetchReferenceMaterials();
  } catch (err: any) {
    toast(err?.message || '删除失败', 'err');
  }
}

function formatDate(ts?: number): string {
  if (!ts) return '—';
  return new Date(ts > 1e11 ? ts : ts * 1000).toLocaleDateString();
}
</script>
