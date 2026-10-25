<template>
  <div>
    <div class="foot">
      <button type="button" class="btn primary lg" @click="onGenerate">
        {{ generateLabel }}
      </button>
      <button type="button" class="btn lg" @click="$emit('openGuide')">
        🧭 {{ t.guide }}
      </button>
      <button v-if="showAutoPersona && !readonly" type="button" class="btn lg" @click="$emit('autoPersona')">
        ✨ {{ tr('一键人设', 'Auto Persona') }}
      </button>
      <button type="button" class="btn lg" @click="onShareToLobby">
        📤 {{ tr('分享到大厅', 'Share to Lobby') }}
      </button>
      <button v-if="!readonly" type="button" class="btn danger lg" @click="$emit('clearAll')">
        {{ t.clear }}
      </button>
    </div>

    <section v-if="visible" class="out-sec show">
      <div class="out-head">
        <h2>{{ tr('设定卡预览', 'Formatted Sheet') }}</h2>
        <select v-model="fmt">
          <option value="text">{{ tr('纯文本', 'Plain Text') }}</option>
          <option value="md">Markdown</option>
          <option value="json">JSON</option>
        </select>
        <button type="button" class="btn sm primary" @click="onCopy">
          📋 {{ tr('复制结果', 'Copy') }}
        </button>
        <button type="button" class="btn sm" @click="onExportPng">
          🖼️ {{ tr('导出图片卡', 'Export PNG') }}
        </button>
      </div>
      <div class="out-box">{{ formattedText }}</div>
    </section>

    <Modal v-model="shareModalOpen" :title="tr('分享到大厅', 'Share to Lobby')" max-width="520px">
      <div style="display: flex; flex-direction: column; gap: 12px">
        <div>
          <label style="display: block; font-weight: 600; font-size: 13px; margin-bottom: 4px">
            {{ tr('标题', 'Title') }}
          </label>
          <input v-model="shareTitle" type="text" maxlength="60" />
        </div>
        <div>
          <label style="display: block; font-weight: 600; font-size: 13px; margin-bottom: 4px">
            {{ tr('一句话简介', 'Summary') }}
          </label>
          <input v-model="shareSummary" type="text" maxlength="120" />
        </div>
        <div>
          <label style="display: block; font-weight: 600; font-size: 13px; margin-bottom: 4px">
            {{ tr('正文内容（可修改）', 'Content') }}
          </label>
          <textarea v-model="shareContent" rows="6" style="max-height: 260px" />
        </div>
      </div>
      <template #footer>
        <button type="button" class="btn sm" @click="shareModalOpen = false">
          {{ tr('取消', 'Cancel') }}
        </button>
        <button
          type="button"
          class="btn primary sm"
          :disabled="sharing"
          @click="submitShare"
        >
          {{ sharing ? tr('发布中…', 'Sharing…') : tr('确认发布', 'Publish') }}
        </button>
      </template>
    </Modal>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from '../../composables/useI18n';
import { useToast } from '../../composables/useToast';
import { buildCode } from '../../core/draftCode';
import { fmtOutput } from '../../core/format';
import { exportPngCard } from '../../core/imageCard';
import type { LegacyFieldGroup } from '../../core/legacy/fields';
import type { EntityKind } from '../../core/schema/types';
import { api } from '../../data/api';
import { useAuthStore } from '../../stores/auth';
import { useUIStore } from '../../stores/ui';
import Modal from '../base/Modal.vue';

const props = defineProps<{
  kind: EntityKind;
  groups: LegacyFieldGroup[];
  data: Record<string, string>;
  entityName: string;
  draftOrder: string[];
  draftPrefix: string;
  showAutoPersona?: boolean;
  readonly?: boolean;
}>();

const emit = defineEmits<{
  (e: 'validateRequired'): boolean;
  (e: 'clearAll'): void;
  (e: 'openGuide'): void;
  (e: 'autoPersona'): void;
}>();

const { lang, t, tr } = useI18n();
const { toast } = useToast();
const authStore = useAuthStore();
const uiStore = useUIStore();

const visible = ref(false);
const fmt = ref<'text' | 'md' | 'json'>('text');

const shareModalOpen = ref(false);
const shareTitle = ref('');
const shareSummary = ref('');
const shareContent = ref('');
const sharing = ref(false);

const generateLabel = computed(() => {
  if (props.kind === 'world') return t.value.genW;
  if (props.kind === 'org') return t.value.genO;
  return t.value.genC;
});

const formattedText = computed(() =>
  fmtOutput(props.groups, props.data || {}, fmt.value, false, true, lang.value)
);

function onGenerate() {
  const reqs = props.groups.flatMap((g) => g.f.filter((f) => f.r));
  const missing = reqs.filter((f) => !(props.data[f.id] || '').trim());
  if (missing.length > 0) {
    emit('validateRequired');
    toast(t.value.needFill(missing.length), 'warn');
    return;
  }
  visible.value = true;
  toast(t.value.genOk, 'ok');
}

async function onCopy() {
  if (!formattedText.value) {
    toast(t.value.empty, 'warn');
    return;
  }
  try {
    await navigator.clipboard.writeText(formattedText.value);
    toast(t.value.codeCopied, 'ok');
  } catch {
    toast(tr('复制失败', 'Copy failed'), 'err');
  }
}

function onExportPng() {
  const txt = fmtOutput(props.groups, props.data || {}, 'text', false, true, lang.value);
  if (!txt) {
    toast(t.value.empty, 'warn');
    return;
  }
  const subtitle =
    props.kind === 'world'
      ? 'WORLD SHEET'
      : props.kind === 'org'
        ? 'ORGANIZATION SHEET'
        : 'CHARACTER SHEET';
  const { pages } = exportPngCard(txt, props.entityName, subtitle);
  if (pages > 1) {
    toast(
      tr(
        `内容较长，已分页导出 ${pages} 张图片卡`,
        `Exported ${pages} card pages`
      ),
      'ok'
    );
  } else if (pages === 1) {
    toast(tr('图片卡已下载 ✓', 'Card downloaded ✓'), 'ok');
  }
}

function onShareToLobby() {
  if (!authStore.isLoggedIn) {
    uiStore.openModal('auth');
    return;
  }
  const nm = (props.entityName || '').trim();
  if (!nm || nm === '未命名' || nm === 'Untitled') {
    toast(tr('请先填写名称再分享', 'Please name this entry before sharing'), 'warn');
    return;
  }
  shareTitle.value = nm;
  shareSummary.value = (
    props.data.w_core ||
    props.data.o_creed_line ||
    props.data.personality ||
    ''
  ).slice(0, 80);
  shareContent.value = fmtOutput(props.groups, props.data || {}, 'text', false, true, lang.value);
  shareModalOpen.value = true;
}

async function submitShare() {
  if (!shareTitle.value.trim()) {
    toast(tr('标题不能为空', 'Title required'), 'warn');
    return;
  }
  sharing.value = true;
  try {
    const draftCode = buildCode(props.data, props.draftOrder, props.draftPrefix) || '';
    await api.createShare({
      kind: props.kind,
      title: shareTitle.value.trim().slice(0, 60),
      summary: shareSummary.value.trim().slice(0, 120),
      content: shareContent.value,
      draftCode
    });
    shareModalOpen.value = false;
    toast(tr('已分享到大厅 ✓', 'Shared to lobby ✓'), 'ok');
  } catch (err: any) {
    toast((tr('分享失败：', 'Share failed: ')) + (err?.message || ''), 'err');
  } finally {
    sharing.value = false;
  }
}
</script>
