<template>
  <div class="record-fields">
    <template v-for="key in editableKeys" :key="key">
      <label v-if="typeof record[key] === 'string'" class="record-field">
        <span>{{ labels[key] || key }}</span><textarea v-if="String(record[key]).length > 100 || longFields.has(key) || (depth > 0 && !/^\d+$/.test(key))" v-model="record[key]" :rows="key === 'content' ? 12 : 3" /><input type="text" v-else v-model="record[key]" />
      </label>
      <label v-else-if="typeof record[key] === 'boolean'" class="record-check"><input v-model="record[key]" type="checkbox" />{{ labels[key] || key }}</label>
      <label v-else-if="typeof record[key] === 'number'" class="record-field"><span>{{ labels[key] || key }}</span><input v-model.number="record[key]" type="number" /></label>
      <fieldset v-else-if="record[key] && typeof record[key] === 'object'" class="record-nested"><legend>{{ labels[key] || key }}</legend>
        <ContentRecordEditor :record="record[key]" :labels="labels" :depth="depth + 1" :field-options="fieldOptions" :available-fields="key === 'data' ? fieldOptions : undefined" />
      </fieldset>
    </template>
    <div v-if="missingFields.length" class="record-field">
      <label>新增设定字段<select v-model="newField"><option value="">选择尚未填写的字段</option><option v-for="[key, label] in missingFields" :key="key" :value="key">{{ label }}</option></select></label>
      <button class="btn sm" type="button" :disabled="!newField" @click="addField">添加字段</button>
    </div>
    <p v-if="!editableKeys.length" class="hint">暂无可编辑字段。</p>
  </div>
</template>
<script setup lang="ts">
import { computed, ref } from 'vue';
const props = withDefaults(defineProps<{ record: Record<string, any> | any[]; labels?: Record<string, string>; fieldOptions?: Record<string, string>; availableFields?: Record<string, string>; depth?: number }>(), { labels: () => ({}), fieldOptions: () => ({}), availableFields: () => ({}), depth: 0 });
const hidden = new Set(['id', 'createdAt', 'updatedAt', 'isReference', 'refAuthorId', 'refAuthorName', 'shareId', 'shareRev', 'wordCount', 'rev', 'userId', 'authorId', 'ownerName', 'reviewedAt', 'reviewedBy']);
const longFields = new Set(['content', 'summary', 'desc', 'note', 'data', 'goal', 'twist', 'def']);
const editableKeys = computed(() => props.depth > 8 ? [] : Object.keys(props.record).filter(key => !hidden.has(key)));
const record = computed<any>(() => props.record);
const newField = ref('');
const missingFields = computed(() => Object.entries(props.availableFields).filter(([key]) => !(key in props.record) && !hidden.has(key)));
function addField() { if (!missingFields.value.some(([key]) => key === newField.value)) return; record.value[newField.value] = ''; newField.value = ''; }
</script>
<style scoped>
.record-fields { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.record-field { display: flex; flex-direction: column; gap: 6px; font-size: 13px; }
.record-check { display: flex; align-items: center; gap: 8px; font-size: 13px; }
.record-check input { width: auto; }
.record-nested { border: 1px solid var(--li); border-radius: 10px; padding: 12px; min-width: 0; }
legend { font-size: 12px; color: var(--mu); padding: 0 5px; }
</style>
