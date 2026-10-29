<template>
  <div class="page" style="max-width: 1280px">
    <PageHeader title="全站创作管理" subtitle="超级管理员可管理作者已同步的设定集及作品库，包括私有与未发布内容。" :icon="Shield" />
    <div class="admin-content-layout">
      <aside class="card open author-panel">
        <label>查找作者<input type="text" v-model="query" placeholder="昵称或邮箱" /></label>
        <p v-if="loadingUsers" class="hint">正在查找…</p>
        <button v-for="user in users" :key="user.id" class="author-row" :class="{ selected: owner?.id === user.id }" type="button" @click="selectOwner(user)">
          <Avatar :avatar="user.avatar" :name="user.name" :size="32" /><span><strong>{{ user.name }}</strong><small>{{ user.email }}</small><small>{{ user.docRev ? '已同步创作' : '暂无同步文档' }}</small></span>
        </button>
        <div class="admin-pager"><button class="btn sm" type="button" :disabled="page <= 1 || loadingUsers" @click="page--">上一页</button><span class="hint">{{ page }} / {{ Math.max(1, Math.ceil(total / 20)) }}</span><button class="btn sm" type="button" :disabled="page * 20 >= total || loadingUsers" @click="page++">下一页</button></div>
      </aside>
      <section class="card open content-panel">
        <p v-if="!owner" class="hint">先从左侧选择一位作者。</p>
        <template v-else>
          <div class="admin-toolbar"><h3 style="margin: 0">{{ owner.name }} 的创作</h3><button class="btn sm" type="button" :disabled="loadingContent || saving" @click="reload">重新载入云端</button></div>
          <div class="admin-toolbar"><button class="btn sm" :class="{ primary: tab === 'document' }" type="button" @click="tab = 'document'">云端设定集</button><button class="btn sm" :class="{ primary: tab === 'shares' }" type="button" @click="tab = 'shares'">作品库（公开与私有）</button></div>
          <p class="hint">两处内容分别保存。修改设定集不会自动更新已发布分享；如需保持一致，请另行更新对应作品。</p>
          <p v-if="error" role="alert" class="admin-error">{{ error }}</p>
          <p v-if="loadingContent" class="hint">正在读取作者内容…</p>
          <template v-else-if="tab === 'document'">
            <p v-if="!document" class="hint">该作者尚未同步设定集；仅存在设备上的内容无法读取。</p>
            <template v-else>
              <div class="admin-toolbar"><select v-model="section" aria-label="创作内容类型"><option v-for="item in sections" :key="item.key" :value="item.key">{{ item.label }}（{{ collection(item.key).length }}）</option></select><button class="btn primary sm" type="button" :disabled="!dirty || saving" @click="saveDocument">{{ saving ? '保存中…' : '保存设定集修改' }}</button></div>
              <div class="content-editor-layout">
                <div class="content-record-list"><button v-for="item in collection(section)" :key="item.id" type="button" :class="{ selected: selectedId === item.id }" @click="selectedId = item.id">{{ recordName(item) }}</button><p v-if="!collection(section).length" class="hint">此分类暂无内容。</p></div>
                <div v-if="selectedRecord" class="content-record-form">
                  <div class="admin-toolbar"><strong>{{ recordName(selectedRecord) }}</strong><button class="btn danger sm" type="button" @click="removeRecord">删除此条目</button></div>
                  <ContentRecordEditor :record="selectedRecord" :labels="fieldLabels" :field-options="fieldOptions" />
                </div>
              </div>
            </template>
          </template>
          <template v-else>
            <div class="content-editor-layout">
              <div class="content-record-list"><button v-for="share in shares" :key="share.id" type="button" :class="{ selected: editingShare?.id === share.id }" @click="selectShare(share)">{{ share.title }}<small>{{ share.visibility === 'private' ? '私有' : '公开' }} · {{ share.kind }}</small></button><p v-if="!shares.length" class="hint">暂无作品。</p></div>
              <div v-if="editingShare" class="content-record-form">
                <label>标题<input type="text" v-model="editingShare.title" maxlength="150" /></label><label>简介<textarea v-model="editingShare.summary" rows="3" maxlength="500" /></label><label>正文<textarea v-model="editingShare.content" rows="16" /></label>
                <label v-if="editingShare.kind !== 'article'">草稿码<textarea v-model="editingShare.draftCode" rows="3" /></label><label>标签<input type="text" v-model="editingShare.tags" /></label>
                <p v-if="editingShare.kind !== 'article'" class="hint">正文和草稿码分别编辑；修改正文不会自动重建草稿码。</p>
                <label>可见性<select v-model="editingShare.visibility"><option value="public">公开</option><option value="private">私有</option></select></label>
                <div class="admin-toolbar"><button class="btn primary sm" type="button" :disabled="saving || !shareDirty" @click="saveShare">保存作品修改</button><button class="btn danger sm" type="button" :disabled="saving" @click="deleteShare">删除作品</button></div>
              </div>
            </div>
            <div class="admin-pager"><button class="btn sm" type="button" :disabled="sharePage <= 1" @click="changeSharePage(-1)">上一页</button><span class="hint">{{ sharePage }} / {{ Math.max(1, Math.ceil(shareTotal / 20)) }}</span><button class="btn sm" type="button" :disabled="sharePage * 20 >= shareTotal" @click="changeSharePage(1)">下一页</button></div>
          </template>
        </template>
      </section>
    </div>
  </div>
</template>
<script setup lang="ts">
import { Shield } from 'lucide-vue-next';
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { onBeforeRouteLeave } from 'vue-router';
import Avatar from '../components/base/Avatar.vue';
import PageHeader from '../components/base/PageHeader.vue';
import ContentRecordEditor from '../components/editor/ContentRecordEditor.vue';
import { WG, OG } from '../core/legacy/fields';
import { getCharGroups } from '../core/format';
import type { DocV6 } from '../core/schema/types';
import { api, type AuthUser, type WorldShareItem } from '../data/api';
import { useConfirm } from '../composables/useConfirm';
import { useToast } from '../composables/useToast';
const { confirm } = useConfirm(), { toast } = useToast();
const users = ref<AuthUser[]>([]), owner = ref<AuthUser | null>(null), query = ref(''), page = ref(1), total = ref(0);
const loadingUsers = ref(false), loadingContent = ref(false), saving = ref(false), error = ref('');
const document = ref<DocV6 | null>(null), baseRev = ref(0), baseline = ref(''), tab = ref<'document' | 'shares'>('document');
const sections = [{ key: 'worlds', label: '世界观' }, { key: 'orgs', label: '组织' }, { key: 'chars', label: '角色' },
  { key: 'articles', label: '文章' }, { key: 'templates', label: '角色模板' }, { key: 'timeline', label: '时间线' },
  { key: 'plots', label: '剧情线' }, { key: 'scenes', label: '场景' }, { key: 'glossary', label: '术语' }, { key: 'promptTemplates', label: '提示词' }];
const section = ref('worlds'), selectedId = ref('');
const shares = ref<WorldShareItem[]>([]), editingShare = ref<WorldShareItem | null>(null), sharePage = ref(1), shareTotal = ref(0), shareBaseline = ref('');
const dirty = computed(() => document.value !== null && JSON.stringify(document.value) !== baseline.value);
const shareDirty = computed(() => Boolean(editingShare.value && JSON.stringify(editingShare.value) !== shareBaseline.value));
const collection = (key: string): any[] => Object.values((document.value as any)?.[key] || {});
const selectedRecord = computed<any>(() => collection(section.value).find(item => item.id === selectedId.value));
const recordName = (item: any) => item.title || item.name || item.term || item.id;
const fieldOptions = computed(() => Object.fromEntries((section.value === 'worlds' ? WG : section.value === 'orgs' ? OG : section.value === 'chars' ? getCharGroups(selectedRecord.value || {}, document.value?.templates || {}) : []).flatMap(g => g.f.map(f => [f.id, f.l]))));
const fieldLabels = computed(() => {
  const groups = [...WG, ...OG, ...getCharGroups(selectedRecord.value || {}, document.value?.templates || {})];
  return { ...Object.fromEntries(groups.flatMap(g => g.f.map(f => [f.id, f.l]))), name: '名称', title: '标题', summary: '简介', content: '正文',
    data: '设定字段', customInsp: '自定义灵感', category: '分类', desc: '描述', note: '备注', year: '年份', yearStr: '年份',
    worldId: '关联世界观', orgIds: '关联组织', charIds: '关联角色', entityRefs: '关联设定', chapters: '章节', acts: '幕', goal: '目标', twist: '转折', status: '状态', def: '定义', term: '术语' };
});
let usersSeq = 0, contentSeq = 0, shareSeq = 0, searchTimer: ReturnType<typeof setTimeout> | undefined;
async function loadUsers() {
  const sequence = ++usersSeq; loadingUsers.value = true;
  try { const res = await api.getAdminUsers({ q: query.value, page: page.value }); if (sequence !== usersSeq) return; users.value = res.users; total.value = res.total; }
  catch (e: any) { if (sequence === usersSeq) error.value = e.message; }
  finally { if (sequence === usersSeq) loadingUsers.value = false; }
}
async function canLeave() { return !(dirty.value || shareDirty.value) || await confirm('保留当前修改', '当前有未保存修改，确定放弃并切换吗？'); }
async function selectOwner(user: AuthUser) { if (saving.value || !await canLeave()) return; owner.value = user; sharePage.value = 1; await loadContent(); }
async function loadContent() {
  if (!owner.value) return;
  const sequence = ++contentSeq; ++shareSeq; const id = owner.value.id;
  loadingContent.value = true; error.value = ''; document.value = null; editingShare.value = null; shares.value = [];
  try {
    const [cloud, items] = await Promise.all([api.getAdminDocument(id), api.getAdminShares(id, sharePage.value)]);
    if (sequence !== contentSeq) return;
    document.value = cloud?.data || null; baseRev.value = cloud?.rev || 0; baseline.value = JSON.stringify(document.value);
    shares.value = items.shares; shareTotal.value = items.total; shareBaseline.value = ''; section.value = 'worlds'; selectedId.value = collection('worlds')[0]?.id || '';
  } catch (e: any) { if (sequence === contentSeq) error.value = e.message; }
  finally { if (sequence === contentSeq) loadingContent.value = false; }
}
async function reload() { if (await canLeave()) await loadContent(); }
watch(section, key => { selectedId.value = collection(key)[0]?.id || ''; });
watch(query, () => { usersSeq++; clearTimeout(searchTimer); searchTimer = setTimeout(() => { if (page.value !== 1) page.value = 1; else void loadUsers(); }, 300); });
watch(page, loadUsers);
async function saveDocument() {
  if (!owner.value || !document.value || saving.value) return;
  saving.value = true; error.value = '';
  try {
    const submitted = JSON.stringify(document.value);
    const snapshot = JSON.parse(submitted);
    const original = JSON.parse(baseline.value);
    for (const { key } of sections) {
      for (const record of Object.values(snapshot[key] || {}) as any[]) {
        const old = Object.values(original[key] || {}).find((item: any) => item.id === record.id) as any;
        if (JSON.stringify(record) === JSON.stringify(old)) continue;
        record.updatedAt = Date.now();
        const nameField = key === 'worlds' ? 'w_name' : key === 'orgs' ? 'o_name' : key === 'chars' ? 'name' : '';
        if (nameField && record.data) {
          if (record.data[nameField] !== old?.data?.[nameField]) record.name = record.data[nameField];
          else if (record.name !== old?.name) record.data[nameField] = record.name;
        }
        if (key === 'articles') record.wordCount = Array.from(record.content || '').length;
      }
    }
    const res = await api.saveAdminDocument(owner.value.id, snapshot, baseRev.value);
    if (JSON.stringify(document.value) === submitted) document.value = snapshot;
    baseRev.value = res.rev; baseline.value = JSON.stringify(snapshot); toast('已保存云端设定集；关联分享需分别更新', 'ok');
  } catch (e: any) { error.value = e.status === 409 ? '作者已修改云端内容。你的修改已保留，请复制需要的内容，再重新载入云端合并。' : e.message; }
  finally { saving.value = false; }
}
async function removeRecord() {
  if (!document.value || !selectedRecord.value || !await confirm('删除云端条目', `删除“${recordName(selectedRecord.value)}”后，点击保存设定集才会提交。对应分享保持独立，请另行处理。`)) return;
  const items = (document.value as any)[section.value];
  if (Array.isArray(items)) (document.value as any)[section.value] = items.filter((x: any) => x.id !== selectedId.value); else delete items[selectedId.value];
  selectedId.value = collection(section.value)[0]?.id || '';
}
async function selectShare(share: WorldShareItem) {
  if (saving.value || shareDirty.value && !await confirm('放弃作品修改', '确定放弃当前作品未保存的修改吗？')) return;
  const sequence = ++shareSeq;
  try { const result = await api.getShareDetail(share.id); if (sequence !== shareSeq) return; editingShare.value = result.share; shareBaseline.value = JSON.stringify(result.share); }
  catch (e: any) { if (sequence === shareSeq) error.value = e.message; }
}
async function saveShare() {
  if (!editingShare.value || saving.value) return;
  saving.value = true; error.value = '';
  const snapshot = JSON.parse(JSON.stringify(editingShare.value));
  try {
    const res = await api.updateShare(snapshot.id, { baseRev: snapshot.rev, title: snapshot.title, summary: snapshot.summary, content: snapshot.content, draftCode: snapshot.draftCode, tags: snapshot.tags, visibility: snapshot.visibility });
    if (editingShare.value?.id === snapshot.id) {
      editingShare.value.rev = res.rev; snapshot.rev = res.rev; shareBaseline.value = JSON.stringify(snapshot);
      const item = shares.value.find(s => s.id === snapshot.id); if (item) Object.assign(item, { title: snapshot.title, visibility: snapshot.visibility, rev: res.rev });
    }
    toast('已保存作品；云端设定集保持独立', 'ok');
  } catch (e: any) { error.value = e.status === 409 ? '作品已有新版本。你的草稿已保留，请复制后重新载入并合并。' : e.message; }
  finally { saving.value = false; }
}
async function deleteShare() {
  if (!owner.value || !editingShare.value || !await confirm('删除作品', `确定删除“${editingShare.value.title}”及其讨论吗？修改前内容将记入管理日志。`)) return;
  saving.value = true;
  try {
    await api.deleteShare(editingShare.value.id, editingShare.value.rev); editingShare.value = null; shareBaseline.value = '';
    const res = await api.getAdminShares(owner.value.id, sharePage.value); shares.value = res.shares; shareTotal.value = res.total;
  } catch (e: any) { error.value = e.message; } finally { saving.value = false; }
}
async function changeSharePage(direction: number) {
  if (!owner.value || saving.value || (shareDirty.value && !await confirm('放弃作品修改', '确定放弃当前作品未保存的修改并翻页吗？'))) return;
  const sequence = ++shareSeq;
  const ownerId = owner.value.id;
  sharePage.value += direction; editingShare.value = null; shareBaseline.value = '';
  try { const res = await api.getAdminShares(ownerId, sharePage.value); if (sequence !== shareSeq) return; shares.value = res.shares; shareTotal.value = res.total; }
  catch (e: any) { error.value = e.message; }
}
onMounted(loadUsers);
onUnmounted(() => { clearTimeout(searchTimer); usersSeq++; contentSeq++; shareSeq++; });
onBeforeRouteLeave(() => !saving.value && canLeave());
</script>
<style scoped>
.admin-content-layout { display: grid; grid-template-columns: 280px minmax(0, 1fr); gap: 20px; align-items: start; }
.author-panel, .content-panel { display: flex; flex-direction: column; gap: 14px; padding: 20px; min-width: 0; }
.author-panel { max-height: 80vh; overflow: auto; }
.author-panel label, .content-record-form label { display: flex; flex-direction: column; gap: 6px; font-size: 13px; }
.author-row { display: flex; align-items: center; gap: 10px; border: 1px solid var(--li); background: var(--soft); padding: 10px; border-radius: 10px; text-align: left; color: var(--ink); cursor: pointer; min-width: 0; }
.author-row span { display: flex; flex-direction: column; gap: 4px; min-width: 0; } small { font-size: 11px; color: var(--mu); overflow-wrap: anywhere; }
.selected { border-color: var(--ac) !important; background: var(--acs) !important; }
.admin-pager, .admin-toolbar { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; }
.admin-toolbar select { width: auto; max-width: 100%; }
.content-editor-layout { display: grid; grid-template-columns: 180px minmax(0, 1fr); gap: 16px; align-items: start; }
.content-record-list { display: flex; flex-direction: column; gap: 8px; max-height: 60vh; overflow: auto; }
.content-record-list button { display: flex; flex-direction: column; gap: 4px; padding: 10px; border: 1px solid var(--li); border-radius: 8px; background: var(--soft); color: var(--ink); text-align: left; cursor: pointer; overflow-wrap: anywhere; }
.content-record-form { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
.admin-error { color: var(--dg); font-size: 13px; }
@media (max-width: 1000px) { .admin-content-layout { grid-template-columns: 230px minmax(0, 1fr); } .content-editor-layout { grid-template-columns: 1fr; } .content-record-list { max-height: 160px; } }
@media (max-width: 700px) { .admin-content-layout { grid-template-columns: 1fr; } .author-panel { max-height: 300px; } }
</style>
