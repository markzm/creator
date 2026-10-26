<template>
  <div class="page-container" style="max-width: 1100px; margin: 0 auto; padding: 20px">
    <div class="row" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; margin-bottom: 18px">
      <div>
        <h2 style="margin: 0; font-size: 20px">🖋️ {{ tr('文章创作工作台', 'Articles & Writing Studio') }}</h2>
        <p class="hint" style="margin: 4px 0 0">
          {{ tr('将世界观、组织与角色设定作为背景知识库注入 AI，支持正文撰写、智能续作、摘要提取与私有/公开共享。', 'Inject worldbuilding entities into AI for article writing, continuations, summaries, and sharing.') }}
        </p>
      </div>
      <div style="display: flex; gap: 8px">
        <button class="btn sm" @click="uiStore.openModal('aiConfig')">
          🤖 {{ tr('AI 引擎设置', 'AI Settings') }}
        </button>
        <button class="btn sm primary" @click="createNewArticle">
          ＋ {{ tr('新建文章', 'New Article') }}
        </button>
      </div>
    </div>

    <div class="editor-split">
      <!-- Left Pane: Articles List -->
      <div class="card open articles-list-card" style="padding: 14px">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; gap: 8px; flex-wrap: wrap">
          <div style="display: flex; align-items: center; gap: 6px">
            <strong style="font-size: 13.5px">{{ tr('文章列表', 'Articles') }} ({{ articleList.length }})</strong>
          </div>
          <div style="display: flex; gap: 6px; align-items: center">
            <button
              type="button"
              class="btn sm mobile-toggle-btn"
              @click="mobileListCollapsed = !mobileListCollapsed"
            >
              {{ mobileListCollapsed ? tr('展开列表 ▼', 'List ▼') : tr('收起 ▲', 'Collapse ▲') }}
            </button>
            <select v-model="filterCategory" style="font-size: 11.5px; padding: 2px 6px">
              <option value="all">{{ tr('全部分类', 'All') }}</option>
              <option value="小说正文">小说正文</option>
              <option value="设定集专题">设定集专题</option>
              <option value="外传番外">外传番外</option>
              <option value="世界编年">世界编年</option>
              <option value="其他">其他</option>
            </select>
          </div>
        </div>

        <div :class="{ 'mobile-hidden': mobileListCollapsed }">
          <input
            v-model="searchKeyword"
            type="text"
            :placeholder="tr('搜索文章标题…', 'Search title…')"
            style="margin-bottom: 10px; font-size: 12px; padding: 5px 8px; width: 100%"
          />

          <div v-if="!filteredArticles.length" class="hint" style="font-size: 12.5px; text-align: center; padding: 24px 0">
            {{ tr('没有匹配的文章', 'No articles found') }}
          </div>

          <div style="display: flex; flex-direction: column; gap: 6px; max-height: 60vh; overflow-y: auto">
            <div
              v-for="a in filteredArticles"
              :key="a.id"
              class="card"
              style="padding: 10px 12px; cursor: pointer; transition: all 0.15s"
              :style="{
                borderColor: activeArt?.id === a.id ? 'var(--ac)' : 'var(--li)',
                background: activeArt?.id === a.id ? 'var(--acs)' : 'var(--card)'
              }"
              @click="onSelectArticleItem(a.id)"
            >
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px">
                <div style="display: flex; gap: 4px; align-items: center">
                  <span
                    class="pill"
                    style="font-size: 10px; padding: 1px 6px; border-radius: 4px; background: var(--soft)"
                  >
                    {{ a.category }}
                  </span>
                  <span
                    v-if="a.isReference"
                    class="pill"
                    style="font-size: 10px; padding: 1px 6px; border-radius: 4px; background: var(--acs); color: var(--ac); font-weight: 700"
                  >
                    📚 {{ tr('官方', 'Official') }}
                  </span>
                </div>
                <span
                  class="pill"
                  :style="{
                    fontSize: '10px',
                    padding: '1px 6px',
                    borderRadius: '4px',
                    background: a.visibility === 'public' ? 'var(--oks)' : 'var(--soft)',
                    color: a.visibility === 'public' ? 'var(--ok)' : 'var(--mu)'
                  }"
                >
                  {{ a.visibility === 'public' ? tr('🌐 公开', 'Public') : tr('🔒 私有', 'Private') }}
                </span>
              </div>
              <div style="font-weight: 700; font-size: 13.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis">
                {{ a.title || tr('未命名文章', 'Untitled') }}
              </div>
              <div style="display: flex; justify-content: space-between; font-size: 11px; color: var(--mu); margin-top: 4px">
                <span>{{ (a.content || '').length }} {{ tr('字', 'words') }}</span>
                <span>{{ formatDate(a.updatedAt) }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Right Main: Article Editor -->
      <div v-if="activeArt">
        <!-- Reference Material Status Banner -->
        <div
          v-if="activeArt.isReference"
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
                    ? tr('官方管理员编辑模式（已解锁）', 'Admin Mode (Editing Official Article)')
                    : tr('官方公共示范章节（查阅与参考模式）', 'Official Reference Article (Read-only)')
                }}
              </strong>
              <div style="font-size: 12px; color: var(--mu)">
                {{
                  authStore.isAdmin
                    ? tr('您正以网站管理员身份修改全站示范文章，保存后将同步至全站。', 'You are editing official materials as admin.')
                    : tr('此条目为官方示范章节，仅供查阅。如需在此基础上续写或修改，请点击右侧按钮复制为衍生副本~', 'Official reference. Click to fork a personal editable copy.')
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
              @click="handleForkArticle(activeArt.id)"
            >
              📑 {{ tr('复制为衍生副本 (继续创作)', 'Fork Personal Copy') }}
            </button>
          </div>
        </div>

        <!-- Top Toolbar -->
        <div class="row" style="margin: 0 0 12px; flex-wrap: wrap; gap: 8px">
          <button
            v-if="!isReadOnlyReference"
            type="button"
            class="btn sm primary"
            @click="aiWriteModalOpen = true"
          >
            ✨ {{ tr('AI 设定成文', 'AI Write') }}
          </button>
          <button
            v-if="!isReadOnlyReference"
            type="button"
            class="btn sm"
            :disabled="aiStore.loading || !(activeArt.content || '').trim()"
            @click="onAIContinue"
          >
            ✒️ {{ aiStore.loading ? tr('续写中…', 'Continuing…') : tr('AI 智能续写', 'AI Continue') }}
          </button>
          <button
            v-if="!isReadOnlyReference"
            type="button"
            class="btn sm"
            :disabled="aiStore.loading || !(activeArt.content || '').trim()"
            @click="onAISummary"
          >
            📝 {{ tr('AI 提取摘要', 'AI Summary') }}
          </button>
          <span class="spacer" />
          <button
            v-if="!isReadOnlyReference"
            type="button"
            class="btn sm"
            :style="{ color: activeArt.visibility === 'public' ? 'var(--ok)' : 'var(--ink2)' }"
            @click="toggleVisibility"
          >
            {{ activeArt.visibility === 'public' ? '🌐 ' + tr('已公开（点击设为私有）', 'Public (Click for Private)') : '🔒 ' + tr('私有（点击公开共享）', 'Private (Click to Share)') }}
          </button>
          <button
            v-if="!isReadOnlyReference"
            type="button"
            class="btn sm"
            @click="onShareOrSyncToLobby"
          >
            📤 {{ tr('发布/同步大厅', 'Sync Lobby') }}
          </button>
          <button
            v-if="!activeArt.isReference || authStore.isAdmin"
            type="button"
            class="btn sm icon danger"
            @click="deleteCurrent"
          >
            ✕
          </button>
        </div>

        <!-- Metadata & Context Card -->
        <div class="card open" style="padding: 16px; margin-bottom: 12px">
          <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 10px; margin-bottom: 10px">
            <div>
              <label style="display: block; font-weight: 600; font-size: 12.5px; margin-bottom: 4px">
                {{ tr('文章标题', 'Title') }}
              </label>
              <input
                v-model="activeArt.title"
                type="text"
                style="font-size: 15px; font-weight: 700"
                :readonly="isReadOnlyReference"
                @input="!isReadOnlyReference && docStore.touch()"
              />
            </div>
            <div>
              <label style="display: block; font-weight: 600; font-size: 12.5px; margin-bottom: 4px">
                {{ tr('分类', 'Category') }}
              </label>
              <select
                v-model="activeArt.category"
                :disabled="isReadOnlyReference"
                @change="!isReadOnlyReference && docStore.touch()"
              >
                <option value="小说正文">小说正文</option>
                <option value="设定集专题">设定集专题</option>
                <option value="外传番外">外传番外</option>
                <option value="世界编年">世界编年</option>
                <option value="其他">其他</option>
              </select>
            </div>
          </div>

          <!-- Bind Context Entities -->
          <div style="background: var(--soft); padding: 10px 12px; border-radius: 8px; margin-bottom: 10px">
            <div style="font-weight: 600; font-size: 12px; color: var(--mu); margin-bottom: 6px">
              🔗 {{ tr('关联设定背景库（作为 AI 创作知识库）：', 'Linked Context Entities for AI:') }}
            </div>
            <div style="display: flex; gap: 12px; flex-wrap: wrap; font-size: 12.5px">
              <!-- World Select -->
              <div style="display: flex; align-items: center; gap: 6px">
                <span>🌍</span>
                <select
                  v-model="activeArt.worldId"
                  style="font-size: 12px; padding: 2px 6px"
                  :disabled="isReadOnlyReference"
                  @change="!isReadOnlyReference && docStore.touch()"
                >
                  <option :value="undefined">{{ tr('不绑定世界观', 'No World') }}</option>
                  <option v-for="w in Object.values(docStore.doc.worlds)" :key="w.id" :value="w.id">
                    {{ w.data.w_name || w.name }} {{ w.isReference ? ' [📚 官方]' : '' }}
                  </option>
                </select>
              </div>

              <!-- Org Select -->
              <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap">
                <span>🏛️</span>
                <span style="color: var(--mu)">{{ tr('关联组织:', 'Orgs:') }}</span>
                <span
                  v-for="o in Object.values(docStore.doc.orgs)"
                  :key="o.id"
                  class="pill"
                  style="font-size: 11px; padding: 2px 8px; border-radius: 99px"
                  :style="{
                    cursor: isReadOnlyReference ? 'default' : 'pointer',
                    background: isOrgSelected(o.id) ? 'var(--ac)' : 'var(--card)',
                    color: isOrgSelected(o.id) ? '#fff' : 'var(--ink2)'
                  }"
                  @click="!isReadOnlyReference && toggleOrgSelect(o.id)"
                >
                  {{ o.data.o_name || o.name }} <small v-if="o.isReference" style="opacity: 0.8; font-size: 9px">📚</small>
                </span>
              </div>

              <!-- Char Select -->
              <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap">
                <span>👤</span>
                <span style="color: var(--mu)">{{ tr('出场角色:', 'Chars:') }}</span>
                <span
                  v-for="c in Object.values(docStore.doc.chars)"
                  :key="c.id"
                  class="pill"
                  style="font-size: 11px; padding: 2px 8px; border-radius: 99px"
                  :style="{
                    cursor: isReadOnlyReference ? 'default' : 'pointer',
                    background: isCharSelected(c.id) ? 'var(--ac)' : 'var(--card)',
                    color: isCharSelected(c.id) ? '#fff' : 'var(--ink2)'
                  }"
                  @click="!isReadOnlyReference && toggleCharSelect(c.id)"
                >
                  {{ c.data.name || c.name }} <small v-if="c.isReference" style="opacity: 0.8; font-size: 9px">📚</small>
                </span>
              </div>
            </div>
          </div>

          <!-- Summary / Synopsis -->
          <div>
            <label style="display: block; font-weight: 600; font-size: 12.5px; margin-bottom: 4px">
              {{ tr('一句话梗概 / 章节摘要（支持在创作大厅作为简介展示）', 'Summary / Synopsis') }}
            </label>
            <textarea
              v-model="activeArt.summary"
              rows="2"
              :placeholder="tr('概括本章核心矛盾与看点…', 'Brief synopsis…')"
              :readonly="isReadOnlyReference"
              @input="!isReadOnlyReference && docStore.touch()"
            />
          </div>
        </div>

        <!-- Article Content Editor -->
        <div class="card open" style="padding: 16px">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px">
            <strong style="font-size: 13.5px">📝 {{ tr('正文内容', 'Story Content') }}</strong>
            <span style="font-size: 12px; color: var(--mu)">
              {{ (activeArt.content || '').length }} {{ tr('字', 'chars') }} · {{ calcReadingTime(activeArt.content) }}
            </span>
          </div>

          <textarea
            v-model="activeArt.content"
            rows="18"
            style="font: 14.5px/1.85 'Noto Serif SC', 'Songti SC', serif; padding: 14px 16px; border-radius: 8px"
            :placeholder="tr('从这里开始撰写你的故事，或者点上方「✨ AI 设定成文」根据设定自动撰写…', 'Start writing your story here…')"
            :readonly="isReadOnlyReference"
            @input="onContentInput"
          />

          <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 10px">
            <button type="button" class="btn sm" @click="copyContent">
              📋 {{ tr('复制全文', 'Copy All') }}
            </button>
            <button type="button" class="btn sm" @click="downloadMarkdown">
              📄 {{ tr('导出 Markdown', 'Export .md') }}
            </button>
          </div>
        </div>
      </div>

      <!-- Empty State -->
      <div v-else class="card" style="padding: 48px 20px; text-align: center">
        <p style="font-size: 40px; margin: 0 0 8px">🖋️</p>
        <p class="hint">{{ tr('还没有选择文章。点左上角「＋ 新建文章」开始创作。', 'No article selected.') }}</p>
      </div>
    </div>

    <!-- AI Write Modal -->
    <Modal
      v-model="aiWriteModalOpen"
      :title="'✨ ' + tr('AI 设定成文向导', 'AI Story Writing')"
      max-width="560px"
    >
      <div style="display: flex; flex-direction: column; gap: 12px">
        <p class="hint" style="margin: 0; font-size: 12.5px">
          {{ tr('AI 将结合当前关联的世界观与角色设定作为知识库，为您撰写小说正文。', 'AI writes story content using bound entities as context.') }}
        </p>

        <div>
          <label style="display: block; font-weight: 600; font-size: 12.5px; margin-bottom: 4px">
            {{ tr('写作意图 / 本节情节需求', 'Story Prompt / Plot Requirements') }}
          </label>
          <textarea
            v-model="aiWritePrompt"
            rows="4"
            :placeholder="tr('例：林汐与怀特船长在浮空灯塔遭遇以太风暴，两人合力抢修升力气囊并揭开遗迹石碑…', 'e.g. Action scene at the sky lighthouse…')"
          />
        </div>
      </div>

      <template #footer>
        <button type="button" class="btn sm" @click="aiWriteModalOpen = false">
          {{ tr('取消', 'Cancel') }}
        </button>
        <button
          type="button"
          class="btn primary sm"
          :disabled="aiStore.loading"
          @click="executeAIWrite"
        >
          {{ aiStore.loading ? tr('创作中…', 'Writing…') : '✨ ' + tr('开始成文', 'Start Writing') }}
        </button>
      </template>
    </Modal>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useConfirm } from '../composables/useConfirm';
import { useI18n } from '../composables/useI18n';
import { usePublish } from '../composables/usePublish';
import { useToast } from '../composables/useToast';
import { useAIStore } from '../stores/ai';
import { useAuthStore } from '../stores/auth';
import { useDocStore } from '../stores/doc';
import { useUIStore } from '../stores/ui';
import Modal from '../components/base/Modal.vue';

const docStore = useDocStore();
const aiStore = useAIStore();
const authStore = useAuthStore();
const uiStore = useUIStore();
const { t, tr } = useI18n();
const { toast } = useToast();
const { confirm } = useConfirm();
const { publishEntity, toggleVisibility: toggleShareVisibility } = usePublish();

const filterCategory = ref('all');
const searchKeyword = ref('');
const aiWriteModalOpen = ref(false);
const aiWritePrompt = ref('');
const mobileListCollapsed = ref(false);

function onSelectArticleItem(id: string) {
  docStore.selectArticle(id);
  if (typeof window !== 'undefined' && window.innerWidth <= 900) {
    mobileListCollapsed.value = true;
  }
}

const activeArt = computed(() => docStore.activeArticle);
const articleList = computed(() => docStore.doc.articles || []);
const isReadOnlyReference = computed(() => Boolean(activeArt.value?.isReference && !authStore.isAdmin));

function handleForkArticle(id: string) {
  if (!authStore.isLoggedIn) {
    toast(tr('请先登录个人账号，登录后即可一键复制官方文章至您的专属库自由修改~', 'Please sign in to fork official articles.'), 'info');
    uiStore.openModal('auth');
    return;
  }
  docStore.forkReferenceArticle(id);
}

const filteredArticles = computed(() => {
  return articleList.value.filter((a) => {
    if (filterCategory.value !== 'all' && a.category !== filterCategory.value) {
      return false;
    }
    if (searchKeyword.value.trim()) {
      const q = searchKeyword.value.trim().toLowerCase();
      return (
        (a.title || '').toLowerCase().includes(q) ||
        (a.summary || '').toLowerCase().includes(q)
      );
    }
    return true;
  });
});

function isCharSelected(charId: string): boolean {
  return Boolean(activeArt.value?.charIds?.includes(charId));
}

function toggleCharSelect(charId: string) {
  if (!activeArt.value) return;
  if (!activeArt.value.charIds) activeArt.value.charIds = [];
  const idx = activeArt.value.charIds.indexOf(charId);
  if (idx >= 0) {
    activeArt.value.charIds.splice(idx, 1);
  } else {
    activeArt.value.charIds.push(charId);
  }
  docStore.touch();
}

function isOrgSelected(orgId: string): boolean {
  return Boolean(activeArt.value?.orgIds?.includes(orgId));
}

function toggleOrgSelect(orgId: string) {
  if (!activeArt.value) return;
  if (!activeArt.value.orgIds) activeArt.value.orgIds = [];
  const idx = activeArt.value.orgIds.indexOf(orgId);
  if (idx >= 0) {
    activeArt.value.orgIds.splice(idx, 1);
  } else {
    activeArt.value.orgIds.push(orgId);
  }
  docStore.touch();
}

function createNewArticle() {
  if (!authStore.isLoggedIn) {
    toast(tr('请先登录个人账号，登录后即可自由创建与管理您的专属设定与文章~', 'Please sign in to create personal materials.'), 'info');
    uiStore.openModal('auth');
    return;
  }
  docStore.createArticle(tr('新建文章', 'New Article'));
  toast(tr('已创建新文章', 'Article created'), 'ok');
}

function onContentInput() {
  if (activeArt.value && !isReadOnlyReference.value) {
    activeArt.value.wordCount = (activeArt.value.content || '').length;
    docStore.touch();
  }
}

function calcReadingTime(text?: string): string {
  const len = (text || '').length;
  if (!len) return '0 min';
  const mins = Math.max(1, Math.round(len / 400));
  return `~${mins} min`;
}

function formatDate(ts?: number): string {
  if (!ts) return '';
  const d = new Date(ts > 1e11 ? ts : ts * 1000);
  return d.toLocaleDateString();
}

function buildBoundContext(): string {
  if (!activeArt.value) return '';
  const lines: string[] = [];

  // World context
  if (activeArt.value.worldId && docStore.doc.worlds[activeArt.value.worldId]) {
    const w = docStore.doc.worlds[activeArt.value.worldId];
    lines.push(`【世界观】: ${w.data.w_name || w.name}`);
    if (w.data.w_core) lines.push(`核心法则: ${w.data.w_core}`);
    if (w.data.w_power_system) lines.push(`力量体系: ${w.data.w_power_system}`);
    if (w.data.w_era) lines.push(`纪元历史: ${w.data.w_era}`);
  }

  // Organization contexts
  if (activeArt.value.orgIds && activeArt.value.orgIds.length) {
    lines.push('【关联组织/势力】:');
    activeArt.value.orgIds.forEach((oid) => {
      const o = docStore.doc.orgs[oid];
      if (o) {
        lines.push(`- 组织名: ${o.data.o_name || o.name}, 类型: ${o.data.o_type || ''}, 宗旨/格言: ${o.data.o_creed_line || o.data.o_core || ''}`);
      }
    });
  }

  // Character contexts
  if (activeArt.value.charIds && activeArt.value.charIds.length) {
    lines.push('【出场角色】:');
    activeArt.value.charIds.forEach((cid) => {
      const c = docStore.doc.chars[cid];
      if (c) {
        lines.push(`- 姓名: ${c.data.name || c.name}, 种族/职业: ${c.data.race || ''} ${c.data.job || ''}, 性格: ${c.data.personality || ''}, 特殊能力: ${c.data.power || ''}`);
      }
    });
  }

  return lines.join('\n');
}

/** Resolves the article an AI request was made for; it may have been switched or deleted meanwhile. */
function findArticleOrWarn(artId: string) {
  const art = (docStore.doc.articles || []).find((a) => a.id === artId);
  if (!art) {
    toast(tr('目标文章已切换或删除，AI 结果已丢弃', 'Target article changed; AI result discarded'), 'warn');
  }
  return art || null;
}

async function executeAIWrite() {
  if (!activeArt.value || isReadOnlyReference.value || !aiWritePrompt.value.trim()) {
    toast(tr('请填写写作意图', 'Prompt required'), 'warn');
    return;
  }
  const context = buildBoundContext();
  const artId = activeArt.value.id;
  try {
    const res = await aiStore.generate({
      task: 'article_write',
      prompt: aiWritePrompt.value.trim(),
      context
    });
    const art = findArticleOrWarn(artId);
    if (!art) return;
    art.content = res.content;
    art.wordCount = res.content.length;
    art.updatedAt = Date.now();
    docStore.touch(true);
    aiWriteModalOpen.value = false;
    toast(tr('AI 正文创作完成 ✓', 'AI Story Generated ✓'), 'ok');
  } catch (err: any) {
    toast(err?.message || tr('生成失败', 'Failed'), 'err');
  }
}

async function onAIContinue() {
  if (!activeArt.value || isReadOnlyReference.value || !(activeArt.value.content || '').trim()) return;
  const context = buildBoundContext();
  const artId = activeArt.value.id;
  toast(tr('AI 正在续写剧情…', 'AI Continuing story…'), 'ok');
  try {
    const res = await aiStore.generate({
      task: 'article_continue',
      currentText: activeArt.value.content.slice(-2000), // pass recent 2000 chars
      prompt: '顺畅接续前文剧情，生动展现冲突，推进情节发展。',
      context
    });
    const art = findArticleOrWarn(artId);
    if (!art) return;
    art.content = (art.content || '') + '\n\n' + res.content;
    art.wordCount = art.content.length;
    art.updatedAt = Date.now();
    docStore.touch(true);
    toast(tr('续写完成 ✓', 'Continued ✓'), 'ok');
  } catch (err: any) {
    toast(err?.message || tr('续写失败', 'Failed'), 'err');
  }
}

async function onAISummary() {
  if (!activeArt.value || isReadOnlyReference.value || !(activeArt.value.content || '').trim()) return;
  const artId = activeArt.value.id;
  toast(tr('正在提取文章摘要…', 'Generating summary…'), 'ok');
  try {
    const res = await aiStore.generate({
      task: 'article_summary',
      currentText: activeArt.value.content.slice(0, 4000)
    });
    const art = findArticleOrWarn(artId);
    if (!art) return;
    art.summary = res.content;
    art.updatedAt = Date.now();
    docStore.touch(true);
    toast(tr('摘要已生成 ✓', 'Summary ready ✓'), 'ok');
  } catch (err: any) {
    toast(err?.message || tr('提取失败', 'Failed'), 'err');
  }
}

async function toggleVisibility() {
  if (!activeArt.value || isReadOnlyReference.value) return;
  const next = await toggleShareVisibility('article', activeArt.value.id);
  if (!next) return;
  toast(
    next === 'public'
      ? tr('已公开共享到创作大厅 ✓', 'Published to the lobby ✓')
      : tr('已设为私有（仅自己可见）', 'Set to Private'),
    'ok'
  );
}

async function onShareOrSyncToLobby() {
  if (isReadOnlyReference.value || !activeArt.value) return;
  if (!(activeArt.value.content || '').trim()) {
    toast(tr('文章内容为空', 'Content is empty'), 'warn');
    return;
  }
  const share = await publishEntity('article', activeArt.value.id, {
    visibility: activeArt.value.visibility === 'private' ? 'private' : 'public'
  });
  if (share) toast(tr('已成功同步至创作大厅 ✓', 'Synced to Lobby ✓'), 'ok');
}

async function copyContent() {
  if (!activeArt.value?.content) return;
  try {
    await navigator.clipboard.writeText(activeArt.value.content);
    toast(tr('正文已复制 ✓', 'Copied ✓'), 'ok');
  } catch {
    toast(tr('复制失败', 'Copy failed'), 'err');
  }
}

function downloadMarkdown() {
  if (!activeArt.value) return;
  const md = `# ${activeArt.value.title}\n\n> 分类：${activeArt.value.category} | 字数：${activeArt.value.wordCount}\n\n${activeArt.value.content}\n`;
  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${activeArt.value.title || 'article'}.md`;
  a.click();
  URL.revokeObjectURL(a.href);
  toast(tr('已下载 Markdown 文件 ✓', 'Downloaded .md ✓'), 'ok');
}

async function deleteCurrent() {
  if (!activeArt.value) return;
  if (activeArt.value.isReference && !authStore.isAdmin) {
    docStore.deleteArticle(activeArt.value.id);
    return;
  }
  const title = activeArt.value.title || tr('未命名文章', 'Untitled');
  if (!(await confirm(t.value.delConfirm, tr(`确定删除文章「${title}」？`, `Delete "${title}"?`)))) {
    return;
  }
  docStore.deleteArticle(activeArt.value.id);
  toast(tr('已删除', 'Deleted'), 'ok');
}
</script>

<style scoped>
.mobile-toggle-btn {
  display: none;
}
@media (max-width: 900px) {
  .mobile-toggle-btn {
    display: inline-flex;
  }
  .mobile-hidden {
    display: none;
  }
}
</style>
