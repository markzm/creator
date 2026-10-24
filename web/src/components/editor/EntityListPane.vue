<template>
  <aside
    class="card open"
    style="position: sticky; top: 72px; margin-bottom: 0; padding: 14px"
  >
    <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 10px">
      <strong style="flex: 1; font-size: 14px">{{ title }} ({{ filteredList.length }})</strong>
      <button type="button" class="btn sm primary" @click="$emit('create')">
        ＋ {{ tr('新建', 'New') }}
      </button>
    </div>

    <!-- Optional Template Selector for Character Creation -->
    <div
      v-if="kind === 'char' && templates && Object.keys(templates).length"
      style="display: flex; gap: 6px; margin-bottom: 10px"
    >
      <select v-model="selectedTplId" style="font-size: 12px; padding: 6px 8px">
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
        style="padding: 6px 10px; font-size: 12.5px"
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

    <div style="max-height: 56vh; overflow-y: auto; display: flex; flex-direction: column; gap: 5px">
      <div
        v-for="item in filteredList"
        :key="item.id"
        class="sres"
        :class="{ active: item.id === activeId }"
        style="margin-bottom: 0; padding: 8px 10px"
        @click="$emit('select', item.id)"
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

function displayName(item: BaseEntity): string {
  if (props.kind === 'world') return item.data?.w_name || item.name || t.value.unnamed;
  if (props.kind === 'org') return item.data?.o_name || item.name || t.value.unnamed;
  return item.data?.name || item.name || t.value.unnamed;
}

function subtitleText(item: BaseEntity): string {
  if (props.kind === 'world') return item.data?.w_type || item.data?.w_era || '—';
  if (props.kind === 'org') return item.data?.o_type || item.data?.o_world || '—';
  return [item.data?.race, item.data?.job].filter(Boolean).join(' · ') || '—';
}

const filteredList = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  const list = props.items.filter((item) => {
    if (!q) return true;
    return (
      displayName(item).toLowerCase().includes(q) ||
      subtitleText(item).toLowerCase().includes(q)
    );
  });

  return list.sort((a, b) => {
    if (sortBy.value === 'name') {
      return displayName(a).localeCompare(displayName(b));
    }
    return (b.updatedAt || 0) - (a.updatedAt || 0);
  });
});

function onCreateWithTemplate() {
  if (!selectedTplId.value) return;
  emit('create', selectedTplId.value);
  selectedTplId.value = '';
}
</script>
