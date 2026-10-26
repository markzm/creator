<template>
  <aside class="card open flat entity-list-pane">
    <div class="elp-head">
      <div class="elp-title">
        <strong>{{ title }}</strong>
        <span class="pill sm">{{ filteredList.length }}</span>
        <span v-if="activeEntityName" class="pill sm accent mobile-active-pill">{{ activeEntityName }}</span>
      </div>
      <div class="elp-head-actions">
        <button type="button" class="btn sm mobile-toggle-btn" @click="mobileCollapsed = !mobileCollapsed">
          <ChevronDown v-if="mobileCollapsed" /><ChevronUp v-else />
          {{ mobileCollapsed ? tr('展开', 'List') : tr('收起', 'Hide') }}
        </button>
        <button type="button" class="btn sm primary" @click="handleCreate">
          <Plus /> {{ tr('新建', 'New') }}
        </button>
      </div>
    </div>

    <div :class="{ 'mobile-hidden': mobileCollapsed }">
      <div v-if="kind === 'char' && templates && Object.keys(templates).length" class="elp-row">
        <select v-model="selectedTplId" style="font-size: 12px; padding: 6px 8px; flex: 1">
          <option value="">{{ tr('用模板创建新角色…', 'New from template…') }}</option>
          <option v-for="tpl in Object.values(templates)" :key="tpl.id" :value="tpl.id">
            {{ tpl.name }} ({{ tpl.fields.length }})
          </option>
        </select>
        <button type="button" class="btn sm" :disabled="!selectedTplId" @click="onCreateWithTemplate">
          {{ tr('套用', 'Use') }}
        </button>
      </div>

      <div class="elp-row">
        <div class="elp-search">
          <Search />
          <input v-model="searchQuery" type="search" :placeholder="tr('搜索名称…', 'Search…')" :aria-label="tr('搜索条目', 'Search entries')" />
        </div>
        <button
          type="button"
          class="icon-btn"
          :title="sortBy === 'updated' ? tr('当前：按最近编辑；点击切换为按名称', 'Sorted by recent; click for A→Z') : tr('当前：按名称；点击切换为按最近编辑', 'Sorted A→Z; click for recent')"
          :aria-label="tr('切换排序', 'Toggle sort')"
          @click="sortBy = sortBy === 'updated' ? 'name' : 'updated'"
        >
          <Clock3 v-if="sortBy === 'updated'" />
          <ArrowDownAZ v-else />
        </button>
      </div>

      <div
        ref="listRef"
        class="elp-list"
        role="listbox"
        :aria-label="title"
        tabindex="0"
        @keydown="onListKeydown"
      >
        <template v-if="personalItems.length">
          <div class="elp-group"><User /> {{ tr('我的创作', 'My creations') }} <span class="count">{{ personalItems.length }}</span></div>
          <button
            v-for="item in personalItems"
            :key="item.id"
            type="button"
            role="option"
            class="entity-card"
            :class="{ active: item.id === activeId }"
            :aria-selected="item.id === activeId"
            :data-id="item.id"
            tabindex="-1"
            @click="onSelectItem(item.id)"
          >
            <Avatar :avatar="item.avatar" :name="displayName(item)" :size="30" />
            <div class="ec-main">
              <div class="ec-name">
                <span class="truncate">{{ displayName(item) }}</span>
                <span v-if="item.visibility === 'public'" class="pill sm ok" :title="tr('已公开到大厅', 'Public')"><Globe2 /></span>
              </div>
              <div class="ec-sub">{{ subtitleText(item) }}</div>
            </div>
            <span v-if="(item as any).templateId && templates?.[(item as any).templateId]" class="pill sm outline">
              {{ templates[(item as any).templateId].name }}
            </span>
            <CompletionRing :pct="completionOf(item)" />
          </button>
        </template>

        <template v-if="referenceItems.length">
          <div class="elp-group ref">
            <Library /> {{ tr('官方参考素材', 'Official reference') }} <span class="count">{{ referenceItems.length }}</span>
            <span class="elp-group-note">{{ tr('只读 · 可复制为副本', 'Read-only · fork to edit') }}</span>
          </div>
          <button
            v-for="item in referenceItems"
            :key="item.id"
            type="button"
            role="option"
            class="entity-card reference"
            :class="{ active: item.id === activeId }"
            :aria-selected="item.id === activeId"
            :data-id="item.id"
            tabindex="-1"
            @click="onSelectItem(item.id)"
          >
            <Avatar :avatar="item.avatar" :name="displayName(item)" :size="30" />
            <div class="ec-main">
              <div class="ec-name">
                <span class="truncate">{{ displayName(item) }}</span>
                <span class="pill sm accent"><BookMarked /> {{ tr('官方', 'Official') }}</span>
              </div>
              <div class="ec-sub">{{ subtitleText(item) }}</div>
            </div>
          </button>
        </template>

        <EmptyState
          v-if="!filteredList.length"
          :icon="Search"
          :title="searchQuery ? tr('没有匹配的条目', 'No matches') : tr('还没有条目', 'Nothing here yet')"
          :description="searchQuery ? tr('换个关键词试试。', 'Try another keyword.') : tr('点击「新建」开始。', 'Click “New” to start.')"
        />
      </div>

      <div class="elp-foot">
        <template v-if="isActiveReference && !authStore.isAdmin">
          <button type="button" class="btn sm primary" style="flex: 1" :title="tr('复制为您的衍生副本，自由修改', 'Fork as personal copy')" @click="handleFork(activeId || '')">
            <Copy /> {{ tr('复制为衍生副本', 'Fork a copy') }}
          </button>
        </template>
        <template v-else>
          <button type="button" class="btn sm" style="flex: 1" @click="$emit('duplicate')"><Copy /> {{ tr('复制', 'Duplicate') }}</button>
          <button type="button" class="btn sm danger" style="flex: 1" :disabled="items.length <= 1" @click="$emit('delete')"><Trash2 /> {{ tr('删除', 'Delete') }}</button>
        </template>
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { ArrowDownAZ, BookMarked, ChevronDown, ChevronUp, Clock3, Copy, Globe2, Library, Plus, Search, Trash2, User } from 'lucide-vue-next';
import { computed, defineComponent, h, ref } from 'vue';
import { useI18n } from '../../composables/useI18n';
import { useToast } from '../../composables/useToast';
import { CG, OG, WG } from '../../core/legacy/fields';
import type { BaseEntity, EntityKind, TemplateDef } from '../../core/schema/types';
import { useAuthStore } from '../../stores/auth';
import { useUIStore } from '../../stores/ui';
import Avatar from '../base/Avatar.vue';
import EmptyState from '../base/EmptyState.vue';

/** Tiny SVG ring showing required-field completion. */
const CompletionRing = defineComponent({
  props: { pct: { type: Number, default: 0 } },
  setup(p) {
    const r = 10;
    const c = 2 * Math.PI * r;
    return () =>
      h('span', { class: 'ec-ring', title: `${p.pct}%` }, [
        h('svg', { viewBox: '0 0 26 26' }, [
          h('circle', { class: 'track', cx: 13, cy: 13, r, fill: 'none', 'stroke-width': 3 }),
          h('circle', {
            class: 'bar',
            cx: 13,
            cy: 13,
            r,
            fill: 'none',
            'stroke-width': 3,
            'stroke-linecap': 'round',
            'stroke-dasharray': `${(c * p.pct) / 100} ${c}`
          })
        ])
      ]);
  }
});

const props = defineProps<{
  kind: EntityKind;
  title: string;
  items: BaseEntity[];
  activeId: string | null;
  templates?: Record<string, TemplateDef>;
}>();

const emit = defineEmits<{
  (e: 'select', id: string): void;
  (e: 'create', templateId?: string): void;
  (e: 'duplicate'): void;
  (e: 'fork', id: string): void;
  (e: 'delete'): void;
}>();

const authStore = useAuthStore();
const uiStore = useUIStore();
const { t, tr } = useI18n();
const { toast } = useToast();
const searchQuery = ref('');
const sortBy = ref<'updated' | 'name'>('updated');
const selectedTplId = ref('');
const mobileCollapsed = ref(false);
const listRef = ref<HTMLElement | null>(null);

const activeItem = computed(() => props.items.find((i) => i.id === props.activeId));
const isActiveReference = computed(() => Boolean(activeItem.value?.isReference));
const activeEntityName = computed(() => (activeItem.value ? displayName(activeItem.value) : ''));

const requiredIds = computed(() => {
  const groups = props.kind === 'world' ? WG : props.kind === 'org' ? OG : CG;
  return groups.flatMap((g) => g.f.filter((f) => f.r).map((f) => f.id));
});

function completionOf(item: BaseEntity): number {
  const tplId = (item as any).templateId as string | undefined;
  if (props.kind === 'char' && tplId && props.templates?.[tplId]) {
    const fields = props.templates[tplId].fields;
    if (!fields.length) return 0;
    const done = fields.filter((_, i) => (item.data?.[`tpl_${tplId}_${i}`] || '').trim()).length;
    return Math.round((done / fields.length) * 100);
  }
  const req = requiredIds.value;
  if (!req.length) return 0;
  const done = req.filter((id) => (item.data?.[id] || '').trim()).length;
  return Math.round((done / req.length) * 100);
}

function needLogin(msg: string): boolean {
  if (authStore.isLoggedIn) return false;
  toast(msg, 'info');
  uiStore.openModal('auth');
  return true;
}

function handleCreate() {
  if (needLogin(tr('请先登录，登录后即可创建与管理专属设定', 'Sign in to create your own entries'))) return;
  emit('create');
}

function onCreateWithTemplate() {
  if (needLogin(tr('请先登录，登录后即可创建与管理专属设定', 'Sign in to create your own entries'))) return;
  emit('create', selectedTplId.value);
  selectedTplId.value = '';
}

function handleFork(id: string) {
  if (needLogin(tr('请先登录，登录后即可复制官方素材到个人库', 'Sign in to fork official materials'))) return;
  emit('fork', id);
}

function onSelectItem(id: string) {
  emit('select', id);
  if (typeof window !== 'undefined' && window.innerWidth <= 900) {
    mobileCollapsed.value = true;
  }
}

function onListKeydown(ev: KeyboardEvent) {
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter'].includes(ev.key)) return;
  const ordered = [...personalItems.value, ...referenceItems.value];
  if (!ordered.length) return;
  const idx = ordered.findIndex((i) => i.id === props.activeId);
  let next = idx;
  if (ev.key === 'ArrowDown') next = Math.min(ordered.length - 1, idx + 1);
  if (ev.key === 'ArrowUp') next = Math.max(0, idx - 1);
  if (ev.key === 'Home') next = 0;
  if (ev.key === 'End') next = ordered.length - 1;
  if (ev.key === 'Enter' && idx >= 0) {
    ev.preventDefault();
    return;
  }
  if (next !== idx && next >= 0) {
    ev.preventDefault();
    emit('select', ordered[next].id);
    listRef.value?.querySelector<HTMLElement>(`[data-id="${ordered[next].id}"]`)?.scrollIntoView({ block: 'nearest' });
  }
}

function displayName(item: BaseEntity): string {
  if (props.kind === 'world') return item.data?.w_name || item.name || t.value.unnamed;
  if (props.kind === 'org') return item.data?.o_name || item.name || t.value.unnamed;
  return item.data?.name || item.name || t.value.unnamed;
}

function subtitleText(item: BaseEntity): string {
  const d = item.data || {};
  if (props.kind === 'world') return d.w_type || d.w_era || tr('世界观设定', 'World');
  if (props.kind === 'org') return d.o_type || d.o_motto || tr('组织势力', 'Org');
  return d.role || d.gender || tr('角色档案', 'Character');
}

const filteredList = computed(() => {
  let list = [...props.items];
  const q = searchQuery.value.trim().toLowerCase();
  if (q) {
    list = list.filter((i) => displayName(i).toLowerCase().includes(q) || subtitleText(i).toLowerCase().includes(q));
  }
  if (sortBy.value === 'updated') {
    list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  } else {
    list.sort((a, b) => displayName(a).localeCompare(displayName(b), 'zh-CN'));
  }
  return list;
});

const referenceItems = computed(() => filteredList.value.filter((i) => i.isReference));
const personalItems = computed(() => filteredList.value.filter((i) => !i.isReference));
</script>

<style scoped>
.entity-list-pane {
  position: sticky;
  top: 48px;
  padding: 14px;
}
.elp-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 10px;
  flex-wrap: wrap;
}
.elp-title {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  flex: 1;
  font-size: var(--fs-14);
}
.elp-head-actions { display: flex; gap: 6px; align-items: center; }
.elp-row { display: flex; gap: 6px; margin-bottom: 10px; align-items: center; }
.elp-search {
  flex: 1;
  position: relative;
  display: flex;
  align-items: center;
}
.elp-search svg {
  position: absolute;
  left: 10px;
  width: 14px;
  height: 14px;
  color: var(--mu2);
  pointer-events: none;
}
.elp-search input { padding: 6px 10px 6px 30px; font-size: 12.5px; }
.elp-list {
  max-height: 52vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 5px;
  outline: none;
  border-radius: 10px;
  padding: 2px;
}
.elp-list:focus-visible { box-shadow: 0 0 0 2px var(--glow); }
.elp-group {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  font-weight: 700;
  color: var(--mu);
  padding: 6px 6px 2px;
  flex-wrap: wrap;
}
.elp-group svg { width: 13px; height: 13px; }
.elp-group .count { font-weight: 600; color: var(--mu2); }
.elp-group.ref { border-top: 1px dashed var(--li2); margin-top: 6px; padding-top: 10px; }
.elp-group-note { margin-left: auto; font-size: 10.5px; font-weight: 500; color: var(--mu2); }
.truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ec-name .pill svg { width: 11px; height: 11px; }
.elp-foot {
  display: flex;
  gap: 6px;
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid var(--li2);
}
.mobile-active-pill { max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: none; }
.mobile-toggle-btn { display: none; }
@media (max-width: 900px) {
  .entity-list-pane { position: static; margin-bottom: 14px; padding: 10px 12px; }
  .mobile-toggle-btn { display: inline-flex; }
  .mobile-active-pill { display: inline-flex; }
  .mobile-hidden { display: none; }
}
</style>
