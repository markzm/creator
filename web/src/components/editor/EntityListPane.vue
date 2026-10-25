<template>
  <aside class="card open entity-list-pane">
    <div style="display: flex; align-items: center; justify-content: space-between; gap: 6px; margin-bottom: 10px; flex-wrap: wrap">
      <div style="display: flex; align-items: center; gap: 6px; min-width: 0; flex: 1">
        <strong style="font-size: 14px; white-space: nowrap">{{ title }} ({{ filteredList.length }})</strong>
        <span v-if="activeEntityName" class="pill mobile-active-pill">
          {{ activeEntityName }}
        </span>
      </div>
      <div style="display: flex; gap: 6px; align-items: center">
        <button
          type="button"
          class="btn sm mobile-toggle-btn"
          @click="mobileCollapsed = !mobileCollapsed"
        >
          {{ mobileCollapsed ? tr('展开列表 ▼', 'List ▼') : tr('收起 ▲', 'Collapse ▲') }}
        </button>
        <button type="button" class="btn sm primary" @click="$emit('create')">
          ＋ {{ tr('新建', 'New') }}
        </button>
      </div>
    </div>

    <!-- Body: collapsible on mobile -->
    <div :class="{ 'mobile-hidden': mobileCollapsed }">
      <!-- Optional Template Selector for Character Creation -->
      <div
        v-if="kind === 'char' && templates && Object.keys(templates).length"
        style="display: flex; gap: 6px; margin-bottom: 10px"
      >
        <select v-model="selectedTplId" style="font-size: 12px; padding: 6px 8px; flex: 1">
          <option value="">{{ tr('用模板创建新角色…', 'New from template…') }}</option>
          <option v-for="tpl in Object.values(templates)" :key="tpl.id" :value="tpl.id">
            🎨 {{ tpl.name }} ({{ tpl.fields.length }})
          </option>
        </select>
        <button
          type="button"
          class="btn sm"
          :disabled="!selectedTplId"
          @click="onCreateWithTemplate"
        >
          {{ tr('套用', 'Use') }}
        </button>
      </div>

      <div style="display: flex; gap: 6px; margin-bottom: 10px">
        <input
          v-model="searchQuery"
          type="text"
          :placeholder="tr('搜索名称…', 'Search…')"
          style="padding: 6px 10px; font-size: 12.5px; flex: 1"
        />
        <button
          type="button"
          class="btn sm ghost"
          :title="tr('切换排序', 'Sort')"
          @click="sortBy = sortBy === 'updated' ? 'name' : 'updated'"
        >
          {{ sortBy === 'updated' ? '🕒' : '🔤' }}
        </button>
      </div>

      <div style="max-height: 52vh; overflow-y: auto; display: flex; flex-direction: column; gap: 5px">
        <div
          v-for="item in filteredList"
          :key="item.id"
          class="sres"
          :class="{ active: item.id === activeId }"
          style="margin-bottom: 0; padding: 8px 10px"
          @click="onSelectItem(item.id)"
        >
          <div style="flex: 1; min-width: 0">
            <div
              style="
                font-weight: 600;
                font-size: 13px;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
              "
            >
              {{ displayName(item) }}
            </div>
            <div style="font-size: 11px; color: var(--mu)">
              {{ subtitleText(item) }}
            </div>
          </div>
          <span
            v-if="(item as any).templateId && templates?.[(item as any).templateId]"
            class="k"
          >
            {{ templates[(item as any).templateId].name }}
          </span>
        </div>
      </div>

      <div
        style="
          display: flex;
          gap: 6px;
          margin-top: 12px;
          padding-top: 10px;
          border-top: 1px solid var(--li2);
        "
      >
        <button type="button" class="btn sm" style="flex: 1" @click="$emit('duplicate')">
          {{ tr('复制', 'Duplicate') }}
        </button>
        <button
          type="button"
          class="btn sm danger"
          style="flex: 1"
          :disabled="items.length <= 1"
          @click="$emit('delete')"
        >
          {{ tr('删除', 'Delete') }}
        </button>
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from '../../composables/useI18n';
import type { BaseEntity, EntityKind, TemplateDef } from '../../core/schema/types';

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
  (e: 'delete'): void;
}>();

const { t, tr } = useI18n();
const searchQuery = ref('');
const sortBy = ref<'updated' | 'name'>('updated');
const selectedTplId = ref('');
const mobileCollapsed = ref(false);

const activeEntityName = computed(() => {
  const cur = props.items.find((i) => i.id === props.activeId);
  return cur ? displayName(cur) : '';
});

function onSelectItem(id: string) {
  emit('select', id);
  // On mobile screens, collapse list after selecting an entity for better view
  if (typeof window !== 'undefined' && window.innerWidth <= 900) {
    mobileCollapsed.value = true;
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
    list = list.filter((i) => {
      const name = displayName(i).toLowerCase();
      const sub = subtitleText(i).toLowerCase();
      return name.includes(q) || sub.includes(q);
    });
  }
  if (sortBy.value === 'updated') {
    list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  } else {
    list.sort((a, b) => displayName(a).localeCompare(displayName(b), 'zh-CN'));
  }
  return list;
});

function onCreateWithTemplate() {
  emit('create', selectedTplId.value || undefined);
  selectedTplId.value = '';
}
</script>

<style scoped>
.entity-list-pane {
  position: sticky;
  top: 48px;
  margin-bottom: 0;
  padding: 14px;
}
.mobile-active-pill {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 99px;
  background: var(--acs);
  color: var(--ac);
  font-weight: 600;
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mobile-toggle-btn {
  display: none;
}
@media (max-width: 900px) {
  .entity-list-pane {
    position: static;
    margin-bottom: 14px;
    padding: 10px 12px;
  }
  .mobile-toggle-btn {
    display: inline-flex;
  }
  .mobile-hidden {
    display: none;
  }
}
</style>
