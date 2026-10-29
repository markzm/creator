<template>
  <Modal :model-value="Boolean(ai.draft)" :title="ai.draft?.title || 'AI 创作草稿'" max-width="760px" @update:model-value="value => !value && ai.closeDraft()">
    <div v-if="ai.draft" class="creative-form">
      <div class="creative-toolbar">
        <span class="hint">{{ ai.activeProvider === 'public' ? `公共 AI · 每分钟 ${ai.limits.publicMinute} 次 / 每日 ${ai.limits.publicDaily} 次` : `个人 AI · 每分钟 ${ai.limits.customMinute} 次` }}</span>
        <button class="btn sm" type="button" @click="ui.openModal('aiConfig')">引擎与偏好</button>
      </div>
      <label>使用个人提示词
        <select v-model="templateId" @change="useTemplate">
          <option value="">自由创作 / 不选模板</option>
          <option v-for="item in templates" :key="item.id" :value="item.id">{{ item.category }} · {{ item.title }}</option>
        </select>
      </label>
      <label>创作要求或提示词 <textarea v-model="prompt" rows="4" maxlength="8000" placeholder="描述你想创作的内容，也可以先让 AI 整理提示词。" /></label>
      <div class="creative-toolbar">
        <button class="btn sm" type="button" :disabled="ai.loading" @click="improvePrompt(false)">AI 生成提示词</button>
        <button class="btn sm" type="button" :disabled="ai.loading || !prompt.trim()" @click="improvePrompt(true)">AI 润色提示词</button>
        <button class="btn sm" type="button" :disabled="!prompt.trim()" @click="savePrompt">存入提示词库</button>
      </div>
      <details>
        <summary>关联设定（已选 {{ selected.length }} 项，可调整）</summary>
        <input type="text" v-model="contextSearch" aria-label="搜索关联设定" placeholder="搜索世界观、组织、角色" />
        <div class="context-options">
          <label v-for="item in filteredOptions" :key="refKey(item)" class="context-choice">
            <input v-model="selected" type="checkbox" :value="refKey(item)" /> {{ item.label }}
          </label>
        </div>
        <details><summary>查看提供给 AI 的设定资料</summary><pre class="context-preview">{{ context || '未选择关联设定' }}</pre></details>
      </details>
      <p v-if="context.length + (ai.draft.request.currentText?.length || 0) > 24000 || truncated" class="hint">资料较长，将优先保留当前目标，其余材料按 24,000 字符上限裁剪。</p>
      <label v-if="result">生成草稿（可继续修改）<textarea v-model="result" rows="10" aria-label="AI 生成草稿" /></label>
      <p v-if="changed" class="hint">目标内容已发生修改。草稿已保留，可复制，或明确追加到最新内容。</p>
      <p v-if="remaining !== null" class="hint">今日公共 AI 剩余 {{ remaining }} 次；生成、润色提示词同样计次。</p>
      <p v-if="error" role="alert" class="creative-error">{{ error }}</p>
    </div>
    <template #footer>
      <button class="btn sm" type="button" @click="ai.closeDraft()">放弃并关闭</button>
      <button class="btn sm" type="button" :disabled="ai.loading" @click="generate">{{ ai.loading ? '生成中…' : result ? '重新生成' : '生成草稿' }}</button>
      <button v-if="result" class="btn sm" type="button" @click="copy">复制草稿</button>
      <button v-if="result" class="btn sm" :class="{ primary: ai.draft?.defaultMode !== 'append' }" type="button" :disabled="changed || !exists" @click="apply('replace')">替换目标内容</button>
      <button v-if="result" class="btn sm" :class="{ primary: ai.draft?.defaultMode === 'append' }" type="button" :disabled="!exists" @click="apply('append')">{{ changed ? '追加到最新内容' : '追加到目标内容' }}</button>
    </template>
  </Modal>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import Modal from '../base/Modal.vue';
import { contextOptions, contextText, defaultContextRefs, refKey } from '../../core/prompts';
import type { EntityKind, PromptEntityRef } from '../../core/schema/types';
import { uid } from '../../core/uid';
import { useAIStore } from '../../stores/ai';
import { useDocStore } from '../../stores/doc';
import { useUIStore } from '../../stores/ui';
import { useToast } from '../../composables/useToast';

const ai = useAIStore();
const doc = useDocStore();
const ui = useUIStore();
const { toast } = useToast();
const prompt = ref(''), result = ref(''), error = ref(''), templateId = ref(''), contextSearch = ref('');
const selected = ref<string[]>([]);
const truncated = ref(false);
const remaining = ref<number | null>(null);
const templates = computed(() => (doc.doc.promptTemplates || []).filter(p => !p.task || p.task === ai.draft?.request.task));
const options = computed(() => contextOptions(doc.doc));
const filteredOptions = computed(() => options.value.filter(o => o.label.toLowerCase().includes(contextSearch.value.toLowerCase())));
const refs = computed<PromptEntityRef[]>(() => options.value.filter(o => selected.value.includes(refKey(o))).map(({ kind, id }) => ({ kind, id })));
const context = computed(() => contextText(doc.doc, refs.value));
const exists = computed(() => ai.draft?.currentValue() !== undefined);
const changed = computed(() => ai.draftChanged);
watch(() => ai.draft?.id, () => {
  const session = ai.draft;
  prompt.value = session?.request.prompt || '';
  result.value = ''; error.value = ''; templateId.value = ''; contextSearch.value = ''; truncated.value = false; remaining.value = null;
  selected.value = session ? (session.entityRefs || defaultContextRefs(doc.doc, session.request.entityKind as EntityKind | 'article', session.request.entityId)).map(refKey) : [];
});
function useTemplate() {
  const template = templates.value.find(p => p.id === templateId.value);
  if (!template) return;
  prompt.value = template.content;
  selected.value = [...new Set([...selected.value, ...template.entityRefs.map(refKey)])];
}
function request() {
  const session = ai.draft!;
  const currentKey = session.request.entityId && `${session.request.entityKind}:${session.request.entityId}`;
  return { ...session.request, prompt: prompt.value, context: context.value,
    entityData: !currentKey || selected.value.includes(currentKey) ? session.request.entityData : undefined };
}
async function improvePrompt(refine: boolean) {
  const id = ai.draft?.id;
  error.value = '';
  try {
    const res = await ai.generate({ ...request(), task: refine ? 'prompt_refine' : 'prompt_generate',
      currentText: refine ? prompt.value : undefined });
    if (ai.draft?.id !== id) return;
    prompt.value = res.content; remaining.value = res.remainingToday ?? null; truncated.value = !!res.contextTruncated;
  } catch (e: any) { if (ai.draft?.id === id) error.value = e.message; }
}
async function generate() {
  if (!ai.draft) return;
  const id = ai.draft.id;
  error.value = '';
  try {
    const res = await ai.generate(request());
    if (ai.draft?.id !== id) return;
    result.value = res.content; truncated.value = !!res.contextTruncated; remaining.value = res.remainingToday ?? null;
  } catch (e: any) { if (ai.draft?.id === id) error.value = e.message; }
}
function savePrompt() {
  const now = Date.now();
  doc.doc.promptTemplates ||= [];
  doc.doc.promptTemplates.push({ id: uid('prompt_'), title: prompt.value.split('\n')[0]!.slice(0, 40) || '新提示词',
    category: '创作', content: prompt.value, task: ai.draft?.request.task, entityRefs: refs.value, createdAt: now, updatedAt: now });
  doc.touch(true); toast('已保存到个人提示词库', 'ok');
}
function apply(mode: 'replace' | 'append') {
  try { ai.applyDraft(result.value, mode, changed.value && mode === 'append'); }
  catch (e: any) { error.value = e.message; }
}
async function copy() { try { await navigator.clipboard.writeText(result.value); toast('草稿已复制', 'ok'); } catch { error.value = '复制失败，请手动选中草稿复制'; } }
</script>

<style scoped>
.creative-form { display: flex; flex-direction: column; gap: 14px; }
.creative-form label { display: flex; flex-direction: column; gap: 6px; font-size: 13px; font-weight: 600; }
.creative-toolbar { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.creative-toolbar .hint { flex: 1; }
.context-options { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; max-height: 180px; overflow: auto; margin: 10px 0; }
.creative-form .context-choice { flex-direction: row; align-items: center; font-weight: 400; }
.context-choice input { width: auto; }
summary { cursor: pointer; font-size: 13px; margin-bottom: 8px; }
.context-preview { white-space: pre-wrap; overflow-wrap: anywhere; max-height: 220px; overflow: auto; font-size: 12px; background: var(--soft); padding: 10px; }
.creative-error { color: var(--dg); font-size: 13px; margin: 0; }
@media (max-width: 600px) { .context-options { grid-template-columns: 1fr; } }
</style>
