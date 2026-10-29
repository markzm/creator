<template>
  <section class="card open creators-panel">
    <div class="creators-heading"><h3>活跃创作者</h3><span class="pill sm">{{ onlineCount }} 人在线</span><button class="btn sm mobile-toggle" type="button" :aria-expanded="expanded" @click="expanded = !expanded">{{ expanded ? '收起' : '展开' }}</button></div>
    <div class="creator-cards" :class="{ collapsed: !expanded }">
      <p v-if="loading && !users.length" class="hint">正在载入创作者…</p>
      <p v-else-if="!users.length" class="hint">还没有创作者留下足迹。</p>
      <button v-for="user in users" :key="user.id" type="button" class="creator-row" @click="ui.openCreatorProfile(user.id)">
        <span class="creator-avatar"><Avatar :avatar="user.avatar" :name="user.name" :size="34" /><i :class="{ online: user.isOnline }" /></span>
        <span class="creator-info"><strong>{{ user.name || '创作者' }}</strong><small>{{ user.focus || user.bio || (user.isOnline ? '正在构筑世界' : '最近来过') }}</small></span>
      </button>
    </div>
    <button class="btn sm directory-link" type="button" @click="openDirectory">全部创作者（{{ total }}）</button>
    <p v-if="error" class="hint" role="alert">{{ error }}</p>
  </section>
  <Modal v-model="directoryOpen" title="全部创作者" max-width="700px">
    <div class="directory-filters"><input type="text" v-model="query" aria-label="搜索创作者" placeholder="搜索创作者昵称" /><label><input v-model="onlineOnly" type="checkbox" />仅看在线</label></div>
    <p class="hint">共 {{ filteredTotal }} 位匹配的创作者 · 全站 {{ onlineCount }} 人在线</p>
    <div class="directory-grid">
      <button v-for="user in directoryUsers" :key="user.id" type="button" class="creator-row" @click="ui.openCreatorProfile(user.id)">
        <span class="creator-avatar"><Avatar :avatar="user.avatar" :name="user.name" :size="36" /><i :class="{ online: user.isOnline }" /></span><span class="creator-info"><strong>{{ user.name }}</strong><small>{{ user.focus || user.bio || '专注于创作' }}</small></span>
      </button>
    </div>
    <p v-if="directoryLoading" class="hint">正在加载…</p><p v-else-if="!directoryUsers.length" class="hint">没有匹配的创作者。</p>
    <template #footer><button class="btn sm" type="button" :disabled="page <= 1 || directoryLoading" @click="page--">上一页</button><span class="hint">{{ page }} / {{ Math.max(1, Math.ceil(filteredTotal / 20)) }}</span><button class="btn sm" type="button" :disabled="page * 20 >= filteredTotal || directoryLoading" @click="page++">下一页</button><button class="btn sm" type="button" @click="directoryOpen = false">关闭</button></template>
  </Modal>
</template>
<script setup lang="ts">
import { onUnmounted, ref, watch } from 'vue';
import Avatar from '../base/Avatar.vue';
import Modal from '../base/Modal.vue';
import { api, type LobbyUser } from '../../data/api';
import { useUIStore } from '../../stores/ui';
const ui = useUIStore();
const users = ref<LobbyUser[]>([]), total = ref(0), onlineCount = ref(0), loading = ref(false), expanded = ref(false), error = ref('');
const directoryOpen = ref(false), directoryUsers = ref<LobbyUser[]>([]), filteredTotal = ref(0), query = ref(''), onlineOnly = ref(false), page = ref(1), directoryLoading = ref(false);
let sequence = 0, refreshSequence = 0, timer: ReturnType<typeof setTimeout> | undefined;
async function refresh(fresh = false) {
  const current = ++refreshSequence; loading.value = true; error.value = '';
  try { const res = await api.getLobbyUsers({ limit: 8, fresh }); if (current !== refreshSequence) return; users.value = res.users; total.value = res.totalCreators; onlineCount.value = res.onlineCount; }
  catch (e: any) { if (current === refreshSequence) error.value = e.message; }
  finally { if (current === refreshSequence) loading.value = false; }
}
async function loadDirectory() {
  if (!directoryOpen.value) return;
  const current = ++sequence; directoryLoading.value = true; error.value = '';
  try {
    const res = await api.getLobbyUsers({ limit: 20, page: page.value, q: query.value, online: onlineOnly.value });
    if (current !== sequence) return;
    directoryUsers.value = res.users; filteredTotal.value = res.total; onlineCount.value = res.onlineCount;
  } catch (e: any) { if (current === sequence) error.value = e.message; }
  finally { if (current === sequence) directoryLoading.value = false; }
}
function openDirectory() { directoryOpen.value = true; if (page.value !== 1) page.value = 1; else void loadDirectory(); }
watch([query, onlineOnly], () => { ++sequence; clearTimeout(timer); timer = setTimeout(() => { if (page.value !== 1) page.value = 1; else void loadDirectory(); }, 300); });
watch(page, loadDirectory);
watch(directoryOpen, open => { if (!open) { ++sequence; directoryLoading.value = false; } });
onUnmounted(() => { ++sequence; ++refreshSequence; clearTimeout(timer); });
defineExpose({ refresh, loading });
</script>
<style scoped>
.creators-panel { padding: 18px; display: flex; flex-direction: column; gap: 14px; }
.creators-heading { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.creators-heading h3 { flex: 1; font-size: 15px; margin: 0; }
.creator-cards { display: flex; flex-direction: column; gap: 8px; }
.creator-row { width: 100%; display: flex; align-items: center; gap: 10px; padding: 10px; border: 1px solid transparent; border-radius: 10px; text-align: left; color: var(--ink); background: var(--soft); cursor: pointer; min-width: 0; }
.creator-row:hover { border-color: var(--ac); }
.creator-avatar { position: relative; flex-shrink: 0; }
.creator-avatar i { position: absolute; right: 0; bottom: 0; width: 8px; height: 8px; background: var(--li); border: 2px solid var(--card); border-radius: 50%; }
.creator-avatar i.online { background: var(--ok); }
.creator-info { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.creator-info strong, .creator-info small { white-space: nowrap; text-overflow: ellipsis; overflow: hidden; }
.creator-info strong { font-size: 13px; }.creator-info small { color: var(--mu); font-size: 11px; }
.directory-link { width: 100%; }.mobile-toggle { display: none; }
.directory-filters { display: flex; align-items: center; gap: 14px; }.directory-filters > input { flex: 1; min-width: 0; }
.directory-filters label { display: flex; align-items: center; gap: 6px; flex-shrink: 0; font-size: 13px; }.directory-filters label input { width: auto; }
.directory-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
@media (max-width: 900px) { .mobile-toggle { display: inline-flex; }.creator-cards.collapsed { display: none; }.creator-cards { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 500px) { .directory-grid, .creator-cards { grid-template-columns: 1fr; } }
</style>
