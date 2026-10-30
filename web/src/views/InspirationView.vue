<template>
  <div class="page inspiration-page">
    <header class="inspiration-header"><div><span class="collection-kicker"><Sparkles :size="14" /> LORELAB / INSPIRATION</span>
      <h1>给想象，一个出发的地方<span>。</span></h1><p>沿着一束光、一座城、一个人的目光，找到属于你的故事。</p></div>
      <span class="collection-stamp">VOL. 01 <small>十二个故事的起点</small></span></header>
    <div class="inspiration-controls">
      <div class="inspiration-tabs" aria-label="灵感分类"><button v-for="tab in kinds" :key="tab.value" type="button" :class="{ active: kind === tab.value }" :aria-pressed="kind === tab.value" @click="kind = tab.value">{{ tab.label }}</button></div>
      <div class="inspiration-search"><Search :size="16" /><input v-model="query" aria-label="搜索灵感" placeholder="寻找场景、角色或一种情绪…" /></div>
    </div>
    <div class="genre-toolbar"><div class="genre-filters"><button type="button" :class="{ selected: !genre }" :aria-pressed="!genre" @click="genre = ''">全部题材</button><button v-for="(label, key) in genreLabels" :key="key" type="button" :class="{ selected: genre === key }" :aria-pressed="genre === key" @click="genre = key">{{ label }}</button></div><button class="btn sm ghost" type="button" :disabled="filtered.length < 2" @click="rotate"><Shuffle :size="14" /> 换一组</button></div>
    <div class="collection-status" role="status">{{ filtered.length }} 个创作起点 <span>选择一张卡片，展开想象</span></div>
    <div v-if="filtered.length" class="inspiration-grid"><InspirationCard v-for="(item, index) in filtered" :key="item.id" :item="item" :index="index" /></div>
    <div v-else class="collection-empty"><Compass :size="32" /><h2>换一种线索试试</h2><p>这里还没有匹配的灵感，试试“远行”“记忆”或“治愈”。</p><button type="button" class="btn" @click="query = ''; genre = ''; kind = ''">清除筛选</button></div>
    <p class="collection-note">图片用于启发想象，故事由你自由续写。摄影与原创插画的来源可在详情中查看。</p>

    <Modal :model-value="Boolean(selected)" :title="selected?.title || '灵感详情'" max-width="900px" @update:model-value="value => !value && closeDetail()">
      <div v-if="selected" class="inspiration-detail">
        <div class="detail-art"><VisualImage :src="detailImage?.src" :width="detailImage?.width" :height="detailImage?.height" :alt="selected.description" :fallback="'让文字先带你进入这个故事'" />
          <div class="source-line"><span>{{ inspirationSourceLabel(selected) }} · {{ selected.source.author }}</span><a v-if="selected.source.page" :href="selected.source.page" target="_blank" rel="noopener noreferrer">作品来源 <ExternalLink :size="11" /></a><a v-if="selected.source.license" :href="selected.source.license" target="_blank" rel="noopener noreferrer">使用许可</a></div>
        </div>
        <div class="detail-story"><div class="inspiration-tags"><span>{{ genreLabels[selected.genre] }}</span><span v-for="tag in selected.tags" :key="tag">{{ tag }}</span></div>
          <h3>你会怎样续写这一幕？</h3><p class="detail-description">{{ selected.description }}</p>
          <ol class="story-questions"><li v-for="question in selected.questions" :key="question">{{ question }}</li></ol>
          <template v-if="!building"><div class="seed-excerpt"><span>一个可能的开头</span><p>{{ selected.seed }}</p></div><div class="detail-actions"><button class="btn primary" type="button" @click="begin"><PenLine :size="16" /> 以此开始创作</button><button class="btn" type="button" @click="copySeed"><Copy :size="15" /> 复制灵感</button></div><p class="detail-hint">{{ auth.isLoggedIn ? '先修改创作种子，再决定保存到哪里。' : '浏览与复制无需登录；登录后可创建个人作品。' }}</p></template>
          <form v-else class="seed-editor" @submit.prevent="create">
            <label v-if="selected.kind === 'scene'">创建类型<select v-model="draft.target" :disabled="submitting"><option value="scene">场景卡</option><option value="world">世界观</option></select></label>
            <label>创作名称<input v-model="draft.name" maxlength="80" required :disabled="submitting" /></label>
            <label>创作种子<textarea v-model="draft.seed" rows="6" maxlength="24000" required :disabled="submitting" /></label>
            <label v-if="selected.kind === 'character' && detailImage" class="artwork-choice"><input type="checkbox" v-model="draft.useArtwork" /> 将原创插画作为角色参考立绘</label>
            <div class="detail-actions"><button class="btn sm" type="button" :disabled="submitting || ai.loading" @click="expand"><Sparkles :size="14" /> AI 扩写种子</button><button class="btn sm ghost" type="button" :disabled="submitting" @click="building = false">取消创建</button><button class="btn primary sm" type="submit" :disabled="submitting || sync.status === 'syncing' || !draft.name.trim() || !draft.seed.trim()">{{ submitting ? '正在创建…' : sync.status === 'syncing' ? '工作区同步中…' : '确认创建' }}</button></div>
            <p class="detail-hint">点击“确认创建”才会保存。AI 根据文字资料扩写，生成前可预览要求。</p>
          </form>
          <p v-if="error" role="alert" class="inspiration-error">{{ error }}</p>
        </div>
      </div>
    </Modal>
  </div>
</template>
<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { useRoute, useRouter, onBeforeRouteLeave } from 'vue-router';
import { Compass, Copy, ExternalLink, PenLine, Search, Shuffle, Sparkles } from 'lucide-vue-next';
import Modal from '../components/base/Modal.vue';
import VisualImage from '../components/base/VisualImage.vue';
import InspirationCard from '../components/inspiration/InspirationCard.vue';
import { filterInspirations, genreLabels, getInspiration, inspirationAsset, inspirationSourceLabel } from '../data/inspiration';
import { createFromInspiration, type InspirationDraft } from '../core/inspiration';
import { useDocStore } from '../stores/doc';
import { useAuthStore } from '../stores/auth';
import { useUIStore } from '../stores/ui';
import { useAIStore } from '../stores/ai';
import { useSyncStore } from '../stores/sync';
import { useToast } from '../composables/useToast';
import { useConfirm } from '../composables/useConfirm';
const route = useRoute(), router = useRouter(), doc = useDocStore(), auth = useAuthStore(), ui = useUIStore(), ai = useAIStore();
const sync = useSyncStore();
const { toast } = useToast(), { confirm } = useConfirm();
const kinds = [{ value: '', label: '全部灵感' }, { value: 'scene', label: '场景与世界' }, { value: 'character', label: '角色档案' }];
const query = ref(''), genre = ref(''), kind = ref(''), rotation = ref(0), error = ref('');
const selected = computed(() => getInspiration(typeof route.query.item === 'string' ? route.query.item : undefined));
const detailImage = computed(() => selected.value && inspirationAsset(selected.value.id, 'detail'));
const filtered = computed(() => { const items = filterInspirations(query.value, genre.value, kind.value); const offset = rotation.value % (items.length || 1); return [...items.slice(offset), ...items.slice(0, offset)]; });
const building = ref(false), submitting = ref(false), pendingCreate = ref('');
const draft = reactive<InspirationDraft>({ inspirationId: '', target: 'scene', name: '', seed: '', useArtwork: true });
const dirty = computed(() => building.value && selected.value && (draft.name !== selected.value.title || draft.seed !== selected.value.seed));
watch(() => selected.value?.id, () => { building.value = false; submitting.value = false; pendingCreate.value = ''; error.value = ''; });
watch(() => auth.isLoggedIn, loggedIn => {
  if (loggedIn && pendingCreate.value === selected.value?.id) begin();
  else if (!loggedIn) { building.value = false; pendingCreate.value = ''; draft.name = ''; draft.seed = ''; }
});
watch([query, genre, kind], () => { rotation.value = 0; });
function rotate() { rotation.value += Math.min(3, Math.max(1, filtered.value.length - 1)); }
async function closeDetail() { if (submitting.value || dirty.value && !await confirm('保留创作种子', '创作种子还未保存，确定放弃这次修改吗？')) return; const { item: _item, ...rest } = route.query; await router.replace({ query: rest }); }
function begin() {
  const item = selected.value; if (!item) return;
  if (!auth.isLoggedIn) { pendingCreate.value = item.id; ui.openModal('auth'); return; }
  pendingCreate.value = ''; error.value = '';
  Object.assign(draft, { inspirationId: item.id, target: item.kind === 'character' ? 'char' : 'scene', name: item.title, seed: item.seed, useArtwork: true });
  building.value = true;
}
async function copySeed() { if (!selected.value) return; try { await navigator.clipboard.writeText([selected.value.title, selected.value.seed, ...selected.value.questions].join('\n\n')); toast('灵感已复制', 'ok'); } catch { error.value = '复制失败，请选中文字手动复制'; } }
async function expand() {
  const item = selected.value; if (!item || !building.value) return;
  error.value = '';
  try {
    await ai.requestDraft({ task: 'field_gen', fieldLabel: '创作种子', prompt: `根据以下文字参考扩写创作种子，保留作者意图，增加可继续发展的冲突与线索。\n画面描述：${item.description}\n故事问题：${item.questions.join('\n')}`, currentText: draft.seed }, {
      title: '扩写创作种子', entityRefs: [], currentValue: () => building.value && selected.value?.id === item.id ? draft.seed : undefined,
      apply: (text, mode) => { draft.seed = mode === 'append' ? `${draft.seed}\n\n${text}` : text; }
    });
  } catch (e: any) { error.value = e.message; }
}
async function create() {
  if (submitting.value || !building.value || !selected.value) return;
  if (!auth.isLoggedIn) { pendingCreate.value = selected.value.id; ui.openModal('auth'); return; }
  if (!doc.ready) { error.value = '个人工作区正在载入，请稍后重试'; return; }
  if (sync.status === 'syncing' || sync.status === 'conflict') { error.value = '请先完成工作区同步或处理同步冲突，当前创作种子会保留。'; return; }
  submitting.value = true; error.value = '';
  try { const path = createFromInspiration(doc.doc, draft, window.location.origin); doc.touch(true); building.value = false; toast('创作起点已保存到个人工作区', 'ok'); await router.push(path); }
  catch (e: any) { error.value = e.message; submitting.value = false; }
}
onBeforeRouteLeave(async () => !dirty.value || await confirm('保留创作种子', '创作种子还未保存，确定离开并放弃修改吗？'));
</script>
<style scoped>
.inspiration-page { max-width: 1200px; }
.inspiration-header { display: flex; align-items: center; justify-content: space-between; gap: 30px; padding: 24px 0 30px; border-bottom: 1px solid var(--li); }
.collection-kicker { color: var(--ac); display: inline-flex; gap: 8px; align-items: center; font-size: 10px; letter-spacing: .15em; font-weight: 700; }
h1 { font-size: clamp(24px, 3.2vw, 38px); font-weight: 800; line-height: 1.4; letter-spacing: -.04em; margin: 16px 0 12px; } h1 > span { color: var(--coral, #e78a7c); }
.inspiration-header p { margin: 0; color: var(--mu); font-size: 13px; line-height: 1.8; }
.collection-stamp { flex-shrink: 0; border: 1px solid var(--li); padding: 16px 20px; border-radius: 50%; font-size: 12px; color: var(--ac); text-align: center; transform: rotate(8deg); }
.collection-stamp small { display: block; margin-top: 6px; font-size: 10px; color: var(--mu); }
.inspiration-controls { display: flex; gap: 20px; justify-content: space-between; align-items: center; margin-top: 24px; }
.inspiration-tabs { display: flex; gap: 6px; }
.inspiration-tabs button, .genre-filters button { border: 0; border-radius: 8px; padding: 10px 14px; color: var(--mu); background: transparent; font-size: 12px; cursor: pointer; }
.inspiration-tabs .active { background: var(--ink); color: var(--card); font-weight: 700; }
.inspiration-search { display: flex; align-items: center; gap: 9px; width: 300px; border: 1px solid var(--li); border-radius: 10px; padding: 0 12px; color: var(--mu); background: var(--card); }
.inspiration-search input { border: 0; background: transparent; padding: 10px 0; min-width: 0; box-shadow: none; font-size: 12px; }
.genre-toolbar { display: flex; align-items: center; justify-content: space-between; margin: 16px 0 20px; }
.genre-filters { display: flex; flex-wrap: wrap; gap: 4px; }
.genre-filters button { padding: 6px 11px; font-size: 11px; }
.genre-filters .selected { color: var(--ac); background: var(--acs); }
.collection-status { display: flex; justify-content: space-between; font-size: 11px; color: var(--mu); margin-bottom: 14px; }
.collection-status span { color: var(--mu2); }
.inspiration-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 22px; }
.collection-note { text-align: center; font-size: 11px; color: var(--mu); margin: 36px 0 12px; line-height: 1.8; }
.collection-empty { text-align: center; padding: 70px 20px; color: var(--mu); } .collection-empty h2 { color: var(--ink); font-size: 19px; } .collection-empty p { font-size: 13px; }
.inspiration-detail { display: grid; grid-template-columns: minmax(0, .95fr) minmax(0, 1fr); gap: 26px; align-items: start; }
.detail-art .visual-image { border-radius: 12px; aspect-ratio: 4 / 5; } .detail-art :deep(img) { object-fit: contain; }
.source-line { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; margin-top: 12px; font-size: 10px; line-height: 1.7; color: var(--mu); }
.source-line a { color: var(--ac); display: inline-flex; align-items: center; gap: 3px; }
.inspiration-tags { display: flex; gap: 6px; flex-wrap: wrap; } .inspiration-tags span { font-size: 10px; padding: 4px 7px; border-radius: 5px; color: var(--ac); background: var(--acs); }
.detail-story h3 { font-size: 19px; margin: 20px 0 12px; } .detail-description { color: var(--mu); font-size: 13px; line-height: 1.9; }
.story-questions { font-size: 12px; line-height: 1.9; padding-left: 20px; } .story-questions li { margin: 10px 0; padding-left: 3px; } .story-questions li::marker { color: var(--coral, #e78a7c); font-weight: 700; }
.seed-excerpt { padding: 15px; border-left: 2px solid var(--ac); background: var(--soft); margin: 18px 0; border-radius: 0 8px 8px 0; }
.seed-excerpt span { font-size: 10px; color: var(--ac); } .seed-excerpt p { font-size: 13px; line-height: 1.9; margin: 8px 0 0; }
.detail-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 16px; }
.detail-hint { font-size: 11px; color: var(--mu); line-height: 1.8; margin-top: 12px; }
.seed-editor { border-top: 1px solid var(--li); padding-top: 16px; } .seed-editor label { display: flex; flex-direction: column; gap: 6px; margin-bottom: 12px; font-size: 12px; }
.seed-editor .artwork-choice { flex-direction: row; align-items: center; } .artwork-choice input { width: auto; }
.inspiration-error { font-size: 12px; color: var(--dg); }
@media (max-width: 1050px) { .inspiration-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 650px) { .inspiration-grid { grid-template-columns: 1fr; } .collection-stamp { display: none; } .inspiration-controls { flex-direction: column; align-items: stretch; gap: 14px; } .inspiration-search { width: auto; } .inspiration-tabs button { flex: 1; padding: 10px 8px; } .inspiration-detail { grid-template-columns: 1fr; gap: 18px; } .detail-art .visual-image { aspect-ratio: 4 / 3; } .collection-status span { display: none; } .inspiration-header { padding-top: 12px; } }
</style>
