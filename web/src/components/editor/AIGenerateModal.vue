<template><span v-if="false" /></template>
<script setup lang="ts">
import { watch } from 'vue';
import type { EntityKind } from '../../core/schema/types';
import { useAIStore } from '../../stores/ai';
import { useDocStore } from '../../stores/doc';
import { useAuthStore } from '../../stores/auth';
import { useToast } from '../../composables/useToast';
const props = defineProps<{ modelValue: boolean; kind: EntityKind | 'article'; entityId?: string; fieldId?: string;
  fieldLabel?: string; currentValue?: string; entityData?: Record<string, string>; context?: string }>();
const emit = defineEmits<{ (e: 'update:modelValue', value: boolean): void; (e: 'apply', content: string): void }>();
const ai = useAIStore(); const doc = useDocStore(); const auth = useAuthStore(); const { toast } = useToast();
watch(() => props.modelValue, async open => {
  if (!open) return;
  const id = props.entityId;
  const kind = props.kind;
  const entity = () => kind === 'article' ? undefined : (kind === 'world' ? doc.doc.worlds : kind === 'org' ? doc.doc.orgs : doc.doc.chars)[id || ''];
  const field = props.fieldId || (kind === 'world' ? 'w_core' : kind === 'org' ? 'o_core' : 'personality');
  try {
    await ai.requestDraft({ task: props.fieldId ? 'field_gen' : 'entity_gen', entityKind: kind, entityId: id,
      entityData: props.entityData, fieldId: field, fieldLabel: props.fieldLabel }, {
      title: 'AI 设定创作',
      currentValue: () => { const live = entity(); return live && (!live.isReference || auth.isAdmin) ? live.data[field] || '' : undefined; },
      apply: (content, mode) => {
        const live = entity();
        if (!live || kind === 'article') throw new Error('目标已不存在');
        live.data[field] = mode === 'append' && live.data[field] ? live.data[field] + '\n\n' + content : content;
        doc.syncEntityName(kind, live); doc.touch(true);
      }
    });
  } catch (e: any) { toast(e.message, 'err'); }
  finally { emit('update:modelValue', false); }
});
</script>
