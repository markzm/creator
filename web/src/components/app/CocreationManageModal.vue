<template>
  <Modal
    :model-value="uiStore.modals.cocreationManage"
    :title="tr('共创企划', 'Co-creation projects')"
    max-width="720px"
    @update:model-value="(v) => !v && uiStore.closeModal('cocreationManage')"
  >
    <div v-if="!authStore.isLoggedIn" class="hint">
      {{ tr('登录后即可发起或管理共创企划。', 'Sign in to start or manage a project.') }}
    </div>
    <template v-else>
      <!-- Create from the current world -->
      <section v-if="candidateWorld && !existingForWorld" class="card flat" style="padding: 14px; margin-bottom: 14px">
        <h3 class="section-title"><Handshake /> {{ tr('为「', 'Open “') }}{{ candidateWorld.name }}{{ tr('」发起共创企划', '” for co-creation') }}</h3>
        <p class="hint" style="margin: 0 0 10px">
          {{ tr('其他创作者可以为这个世界创作同人设定；你和企划管理员审核后可将其转为官方正典。', 'Others can write doujin lore for this world; you and project admins can canonise it after review.') }}
        </p>
        <label class="f-label">{{ tr('企划简介', 'Summary') }}</label>
        <textarea v-model="createSummary" rows="2" :placeholder="tr('希望大家围绕什么创作？有哪些设定边界？', 'What should people write about? Any hard boundaries?')" style="margin-bottom: 8px" />
        <label class="f-label">{{ tr('企划管理员邮箱（可选，逗号分隔）', 'Admin emails (optional, comma separated)') }}</label>
        <input v-model="createAdmins" type="text" placeholder="a@example.com, b@example.com" style="margin-bottom: 10px" />
        <div style="display: flex; justify-content: flex-end">
          <button type="button" class="btn primary sm" :disabled="creating" @click="createProject">
            <Plus /> {{ creating ? tr('创建中…', 'Creating…') : tr('发起企划', 'Start project') }}
          </button>
        </div>
      </section>

      <Skeleton v-if="loading && !projects.length" variant="card" :count="2" />
      <EmptyState
        v-else-if="!projects.length"
        :icon="Handshake"
        :title="tr('还没有企划', 'No projects yet')"
        :description="tr('在世界观页面点击「共创企划」即可为某个世界发起企划。', 'Open a world and click “Co-creation” to start one.')"
      />

      <div v-else style="display: flex; flex-direction: column; gap: 12px">
        <section v-for="p in projects" :key="p.id" class="card flat" style="padding: 14px">
          <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap">
            <Globe2 style="width: 16px; height: 16px; color: var(--k-world)" />
            <strong style="font-size: var(--fs-14)">{{ p.worldTitle }}</strong>
            <span class="pill sm" :class="p.ownerId === authStore.user?.id ? 'accent' : ''">
              {{ p.ownerId === authStore.user?.id ? tr('负责人', 'Owner') : tr('管理员', 'Admin') }}
            </span>
            <span v-if="p.pendingCount" class="pill sm warn"><Inbox /> {{ p.pendingCount }} {{ tr('待审', 'pending') }}</span>
            <span class="spacer" />
            <label v-if="p.ownerId === authStore.user?.id" style="display: inline-flex; align-items: center; gap: 6px; font-size: var(--fs-12); color: var(--ink2); cursor: pointer">
              <input type="checkbox" :checked="p.isOpenDoujin" @change="toggleOpen(p, ($event.target as HTMLInputElement).checked)" />
              {{ tr('开放同人投稿', 'Accept doujin') }}
            </label>
          </div>
          <p class="hint" style="margin: 6px 0 10px">{{ p.summary || tr('暂无企划介绍', 'No summary yet') }}</p>

          <!-- Members -->
          <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-bottom: 8px">
            <Users style="width: 14px; height: 14px; color: var(--mu)" />
            <span v-for="m in p.members" :key="m.userId" class="pill sm" :class="m.role === 'owner' ? 'accent' : 'outline'" style="gap: 6px">
              <Avatar :avatar="m.avatar" :name="m.name" :size="16" /> {{ m.name }}
            </span>
            <template v-if="p.ownerId === authStore.user?.id">
              <input
                v-model="adminDraft[p.id]"
                type="text"
                :placeholder="tr('添加管理员邮箱…', 'Add admin email…')"
                style="width: 220px; padding: 4px 8px; font-size: 12px"
                @keyup.enter="addAdmin(p)"
              />
              <button type="button" class="btn sm" @click="addAdmin(p)"><UserPlus /> {{ tr('添加', 'Add') }}</button>
              <button v-if="p.members.length > 1" type="button" class="btn sm ghost" @click="removeAdmins(p)">{{ tr('清空管理员', 'Clear admins') }}</button>
            </template>
          </div>

          <!-- Review queue -->
          <div style="border-top: 1px dashed var(--li2); padding-top: 10px">
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px">
              <strong style="font-size: var(--fs-13)">{{ tr('转正审核队列', 'Canon review queue') }}</strong>
              <button type="button" class="btn sm ghost" @click="loadQueue(p.id)"><RefreshCw /> {{ tr('刷新', 'Refresh') }}</button>
            </div>
            <Skeleton v-if="queueLoading[p.id]" variant="row" :count="1" />
            <p v-else-if="!(queues[p.id] || []).length" class="hint" style="margin: 0">{{ tr('暂无待审核的同人作品。', 'Nothing waiting for review.') }}</p>
            <div v-else style="display: flex; flex-direction: column; gap: 6px">
              <div v-for="sh in queues[p.id]" :key="sh.id" class="queue-row">
                <span class="pill sm" :class="kindMeta(sh.kind).pill">{{ kindLabel(sh.kind, uiStore.lang) }}</span>
                <strong style="font-size: var(--fs-13)">{{ sh.title }}</strong>
                <span class="hint">@{{ sh.ownerName }}</span>
                <span class="hint" style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap">{{ sh.summary }}</span>
                <button type="button" class="btn sm" @click="review(p.id, sh, false)"><X /> {{ tr('退回', 'Reject') }}</button>
                <button type="button" class="btn sm primary" @click="review(p.id, sh, true)"><Check /> {{ tr('转正', 'Approve') }}</button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </template>
    <template #footer>
      <button type="button" class="btn sm" @click="uiStore.closeModal('cocreationManage')">{{ tr('关闭', 'Close') }}</button>
    </template>
  </Modal>
</template>

<script setup lang="ts">
import { Check, Globe2, Handshake, Inbox, Plus, RefreshCw, UserPlus, Users, X } from 'lucide-vue-next';
import { computed, reactive, ref, watch } from 'vue';
import { useI18n } from '../../composables/useI18n';
import { useToast } from '../../composables/useToast';
import { kindLabel, kindMeta } from '../../core/entityMeta';
import type { CocreationProject } from '../../core/schema/types';
import { api, type WorldShareItem } from '../../data/api';
import { useAuthStore } from '../../stores/auth';
import { useDocStore } from '../../stores/doc';
import { useUIStore } from '../../stores/ui';
import Avatar from '../base/Avatar.vue';
import EmptyState from '../base/EmptyState.vue';
import Modal from '../base/Modal.vue';
import Skeleton from '../base/Skeleton.vue';

const uiStore = useUIStore();
const authStore = useAuthStore();
const docStore = useDocStore();
const { tr } = useI18n();
const { toast } = useToast();

const projects = ref<CocreationProject[]>([]);
const loading = ref(false);
const creating = ref(false);
const createSummary = ref('');
const createAdmins = ref('');
const adminDraft = reactive<Record<string, string>>({});
const queues = reactive<Record<string, WorldShareItem[]>>({});
const queueLoading = reactive<Record<string, boolean>>({});

const candidateWorld = computed(() => {
  const id = uiStore.activeCocreationWorldId;
  if (!id) return null;
  const w = docStore.doc.worlds[id];
  return w && !w.isReference ? w : null;
});
const existingForWorld = computed(() =>
  candidateWorld.value ? projects.value.find((p) => p.worldId === candidateWorld.value!.id || p.id === candidateWorld.value!.cocreationId) : null
);

async function load() {
  if (!authStore.isLoggedIn) return;
  loading.value = true;
  try {
    const res = await api.getCocreationProjects({ mine: true });
    projects.value = res.projects || [];
    for (const p of projects.value) {
      if (p.pendingCount) void loadQueue(p.id);
    }
  } catch (err: any) {
    toast(err?.message || tr('加载企划失败', 'Could not load projects'), 'err');
  } finally {
    loading.value = false;
  }
}

async function loadQueue(projectId: string) {
  queueLoading[projectId] = true;
  try {
    const res = await api.getCanonQueue(projectId, 'pending');
    queues[projectId] = res.shares || [];
  } catch {
    queues[projectId] = [];
  } finally {
    queueLoading[projectId] = false;
  }
}

async function createProject() {
  const w = candidateWorld.value;
  if (!w) return;
  creating.value = true;
  try {
    const admins = createAdmins.value.split(/[,，\s]+/).map((x) => x.trim()).filter(Boolean);
    const res = await api.createCocreationProject({
      worldId: w.id,
      worldTitle: w.data?.w_name || w.name,
      summary: createSummary.value.trim(),
      admins
    });
    w.isCocreation = true;
    w.cocreationId = res.project.id;
    w.cocreationSummary = res.project.summary;
    w.updatedAt = Date.now();
    docStore.touch(true);
    createSummary.value = '';
    createAdmins.value = '';
    if (res.unresolved?.length) {
      toast(tr(`企划已创建；以下邮箱未注册：${res.unresolved.join(', ')}`, `Project created; unknown emails: ${res.unresolved.join(', ')}`), 'warn');
    } else {
      toast(tr('共创企划已创建 ✓', 'Project created ✓'), 'ok');
    }
    await load();
  } catch (err: any) {
    toast(err?.message || tr('创建失败', 'Create failed'), 'err');
  } finally {
    creating.value = false;
  }
}

async function toggleOpen(p: CocreationProject, open: boolean) {
  try {
    const res = await api.updateCocreationProject(p.id, { isOpenDoujin: open });
    Object.assign(p, res.project);
  } catch (err: any) {
    toast(err?.message || tr('更新失败', 'Update failed'), 'err');
  }
}

async function addAdmin(p: CocreationProject) {
  const email = (adminDraft[p.id] || '').trim();
  if (!email) return;
  const existing = p.admins || [];
  try {
    const res = await api.updateCocreationAdmins(p.id, { emails: [...existing, email] });
    Object.assign(p, res.project);
    adminDraft[p.id] = '';
    if (res.unresolved?.length) {
      toast(tr(`未找到注册用户：${res.unresolved.join(', ')}`, `No account for: ${res.unresolved.join(', ')}`), 'warn');
    } else {
      toast(tr('管理员已更新 ✓', 'Admins updated ✓'), 'ok');
    }
  } catch (err: any) {
    toast(err?.message || tr('更新失败', 'Update failed'), 'err');
  }
}

async function removeAdmins(p: CocreationProject) {
  try {
    const res = await api.updateCocreationAdmins(p.id, { userIds: [] });
    Object.assign(p, res.project);
    toast(tr('已清空管理员', 'Admins cleared'), 'ok');
  } catch (err: any) {
    toast(err?.message || tr('更新失败', 'Update failed'), 'err');
  }
}

async function review(projectId: string, sh: WorldShareItem, approve: boolean) {
  try {
    if (approve) await api.approveCanon(String(sh.id));
    else await api.rejectCanon(String(sh.id));
    queues[projectId] = (queues[projectId] || []).filter((x) => x.id !== sh.id);
    const p = projects.value.find((x) => x.id === projectId);
    if (p && p.pendingCount) p.pendingCount = Math.max(0, p.pendingCount - 1);
    toast(approve ? tr('已转为官方正典 ✓', 'Canonised ✓') : tr('已退回', 'Rejected'), 'ok');
  } catch (err: any) {
    toast(err?.message || tr('操作失败', 'Failed'), 'err');
  }
}

watch(
  () => uiStore.modals.cocreationManage,
  (open) => {
    if (open) void load();
  }
);
</script>

<style scoped>
.spacer { flex: 1; }
.queue-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 10px;
  background: var(--soft);
  border: 1px solid var(--li2);
  min-width: 0;
}
</style>
