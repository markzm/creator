<template>
  <div class="page" style="max-width: 1180px">
    <PageHeader title="个人提示词库" subtitle="保存你的创作方法与角色设定要求，自由编写，也可以让 AI 协助构思。" :icon="Bot">
      <template #actions><button class="btn primary sm" type="button" @click="create"><Plus /> 新建提示词</button></template>
    </PageHeader>
    <div class="prompt-layout">
      <aside class="card open prompt-list">
        <input type="text" v-model="search" aria-label="搜索提示词" placeholder="搜索标题、分类或内容" />
        <select v-model="category" aria-label="筛选提示词分类"><option value="">全部分类</option><option v-for="name in categories" :key="name">{{ name }}</option></select>
        <button v-for="item in filtered" :key="item.id" type="button" class="prompt-row" :class="{ selected: buffer?.id === item.id }" @click="select(item)">
          <strong>{{ item.title }}</strong><span class="hint">{{ item.category }} · {{ item.task ? TASK_LABELS[item.task] : '通用' }}</span>
        </button>
        <p v-if="!filtered.length" class="hint">还没有匹配的提示词。点击“新建提示词”开始。</p>
      </aside>
      <section v-if="buffer" class="card open prompt-editor">
        <div class="prompt-toolbar"><h3 style="margin: 0">{{ buffer.title || '新提示词' }}</h3><span class="hint">{{ dirty ? '有未保存修改' : '已保存到本地，随创作内容同步' }}</span></div>
        <label>标题<input type="text" v-model="buffer.title" maxlength="80" /></label>
        <div class="prompt-meta"><label>分类<input type="text" v-model="buffer.category" list="prompt-categories" maxlength="40" /><datalist id="prompt-categories"><option v-for="name in categories" :key="name" :value="name" /></datalist></label>
          <label>适用任务<select v-model="buffer.task"><option :value="undefined">通用</option><option v-for="task in AI_TASKS" :key="task" :value="task">{{ TASK_LABELS[task] }}</option></select></label></div>
        <label>提示词正文<textarea v-model="buffer.content" rows="14" maxlength="8000" placeholder="例如：根据关联角色的性格与经历，写一段体现人物矛盾的对话，保持已有设定一致。" /></label>
        <details><summary>关联世界观、组织与角色（{{ buffer.entityRefs.length }}）</summary>
          <input type="text" v-model="entitySearch" aria-label="搜索提示词关联设定" placeholder="搜索关联设定" />
          <div class="prompt-refs"><label v-for="item in availableRefs" :key="refKey(item)"><input type="checkbox" :checked="hasRef(item)" @change="toggleRef(item)" />{{ item.label }}</label></div>
        </details>
        <div class="prompt-toolbar">
          <button class="btn sm" type="button" :disabled="ai.loading" @click="generate(false)"><Sparkles /> AI 生成提示词</button>
          <button class="btn sm" type="button" :disabled="ai.loading || !buffer.content.trim()" @click="generate(true)">AI 润色</button>
          <button class="btn sm" type="button" @click="duplicate"><Copy /> 复制</button>
          <span style="flex: 1" />
          <button class="btn danger sm" type="button" @click="remove"><Trash2 /> 删除</button>
          <button class="btn primary sm" type="button" :disabled="!buffer.title.trim() || !buffer.content.trim()" @click="save"><Save /> 保存</button>
        </div>
      </section>
      <section v-else class="card open" style="padding: 48px 24px; text-align: center"><Bot :size="32" /><p>选择或新建提示词，整理你的专属创作方法。</p><p class="hint">选择模板不是创作的前提，所有 AI 创作入口仍支持直接输入要求。</p></section>
    </div>
  </div>
</template>
<script setup lang="ts">
import { Bot, Copy, Plus, Save, Sparkles, Trash2 } from 'lucide-vue-next';
import { computed, ref } from 'vue';
import { onBeforeRouteLeave } from 'vue-router';
import PageHeader from '../components/base/PageHeader.vue';
import { AI_TASKS, TASK_LABELS, contextOptions, refKey } from '../core/prompts';
import type { PromptEntityRef, PromptTemplate } from '../core/schema/types';
import { uid } from '../core/uid';
import { useDocStore } from '../stores/doc';
import { useAIStore } from '../stores/ai';
import { useConfirm } from '../composables/useConfirm';
import { useToast } from '../composables/useToast';
const doc = useDocStore(); const ai = useAIStore(); const { confirm } = useConfirm(); const { toast } = useToast();
const buffer = ref<PromptTemplate | null>(null), saved = ref(''), search = ref(''), category = ref(''), entitySearch = ref('');
const templates = computed(() => doc.doc.promptTemplates || []);
const categories = computed(() => [...new Set(templates.value.map(p => p.category))].sort());
const dirty = computed(() => Boolean(buffer.value && JSON.stringify(buffer.value) !== saved.value));
const filtered = computed(() => templates.value.filter(p => (!category.value || p.category === category.value) &&
  `${p.title} ${p.category} ${p.content}`.toLowerCase().includes(search.value.toLowerCase())).sort((a, b) => b.updatedAt - a.updatedAt));
const availableRefs = computed(() => contextOptions(doc.doc).filter(r => r.label.includes(entitySearch.value)));
async function canLeave() { return !dirty.value || await confirm('放弃未保存修改', '提示词尚未保存，确定离开当前编辑吗？'); }
async function select(item: PromptTemplate) { if (!await canLeave()) return; buffer.value = JSON.parse(JSON.stringify(item)); saved.value = JSON.stringify(buffer.value); }
async function create() {
  if (!await canLeave()) return;
  const now = Date.now(); buffer.value = { id: uid('prompt_'), title: '新提示词', category: '通用', content: '', entityRefs: [], createdAt: now, updatedAt: now }; saved.value = '';
}
function save() {
  if (!buffer.value?.title.trim() || !buffer.value.content.trim()) return;
  doc.doc.promptTemplates ||= [];
  const item = JSON.parse(JSON.stringify({ ...buffer.value, title: buffer.value.title.trim(), category: buffer.value.category.trim() || '通用', updatedAt: Date.now() }));
  const index = doc.doc.promptTemplates.findIndex(p => p.id === item.id);
  if (index < 0) doc.doc.promptTemplates.push(item); else doc.doc.promptTemplates[index] = item;
  buffer.value = JSON.parse(JSON.stringify(item)); saved.value = JSON.stringify(buffer.value); doc.touch(true); toast('提示词已保存', 'ok');
}
async function duplicate() {
  if (!buffer.value) return;
  const now = Date.now(); buffer.value = { ...JSON.parse(JSON.stringify(buffer.value)), id: uid('prompt_'), title: buffer.value.title + ' 副本', createdAt: now, updatedAt: now }; saved.value = '';
}
async function remove() {
  if (!buffer.value || !await confirm('删除提示词', `确定删除“${buffer.value.title}”吗？`)) return;
  doc.doc.promptTemplates = templates.value.filter(p => p.id !== buffer.value!.id); buffer.value = null; saved.value = ''; doc.touch(true);
}
const hasRef = (ref: PromptEntityRef) => !!buffer.value?.entityRefs.some(r => refKey(r) === refKey(ref));
function toggleRef(ref: PromptEntityRef) {
  if (!buffer.value) return;
  buffer.value.entityRefs = hasRef(ref) ? buffer.value.entityRefs.filter(r => refKey(r) !== refKey(ref)) : [...buffer.value.entityRefs, { kind: ref.kind, id: ref.id }];
}
async function generate(refine: boolean) {
  if (!buffer.value) return;
  const id = buffer.value.id;
  try {
    await ai.requestDraft({ task: refine ? 'prompt_refine' : 'prompt_generate', prompt: buffer.value.content || `为“${buffer.value.title}”编写创作提示词` }, {
      title: refine ? 'AI 润色提示词' : 'AI 生成提示词', entityRefs: buffer.value.entityRefs,
      currentValue: () => buffer.value?.id === id ? buffer.value.content : undefined,
      apply: (content, mode) => { if (buffer.value?.id === id) buffer.value.content = mode === 'append' && buffer.value.content ? buffer.value.content + '\n\n' + content : content; }
    });
  } catch (e: any) { toast(e.message, 'err'); }
}
onBeforeRouteLeave(canLeave);
</script>
<style scoped>
.prompt-layout { display: grid; grid-template-columns: 270px minmax(0, 1fr); gap: 20px; align-items: start; }
.prompt-list, .prompt-editor { display: flex; flex-direction: column; gap: 14px; padding: 20px; }
.prompt-list { max-height: 75vh; overflow: auto; }
.prompt-row { display: flex; flex-direction: column; gap: 6px; padding: 12px; text-align: left; border: 1px solid var(--li); border-radius: 10px; background: var(--soft); color: var(--ink); cursor: pointer; overflow-wrap: anywhere; }
.prompt-row.selected { border-color: var(--ac); background: var(--acs); }
.prompt-editor label { display: flex; flex-direction: column; gap: 6px; font-size: 13px; }
.prompt-meta { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.prompt-toolbar { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
.prompt-refs { display: grid; grid-template-columns: 1fr 1fr; max-height: 200px; overflow: auto; gap: 10px; margin-top: 12px; }
.prompt-refs label { flex-direction: row; align-items: center; }
.prompt-refs input { width: auto; }
summary { cursor: pointer; margin-bottom: 10px; font-size: 13px; }
@media (max-width: 760px) { .prompt-layout { grid-template-columns: 1fr; } .prompt-list { max-height: 260px; } .prompt-meta, .prompt-refs { grid-template-columns: 1fr; } }
</style>
