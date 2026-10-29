import { computed } from 'vue';
import { checkConsistency } from '../core/consistency';
import { findBacklinks } from '../core/backlinks';
import { INSP } from '../core/legacy/insp';
import type { LegacyFieldGroup } from '../core/legacy/fields';
import type { BaseEntity, EntityKind } from '../core/schema/types';
import { useDocStore } from '../stores/doc';
import { useAuthStore } from '../stores/auth';
import { useAIStore } from '../stores/ai';
import { useI18n } from './useI18n';
import { useToast } from './useToast';

export function useEntityEditor(
  kind: EntityKind,
  getEntity: () => BaseEntity | null,
  getGroups: () => LegacyFieldGroup[]
) {
  const docStore = useDocStore();
  const authStore = useAuthStore();
  const aiStore = useAIStore();
  const { t, tr } = useI18n();
  const { toast } = useToast();

  const totalCharCount = computed(() => {
    const ent = getEntity();
    if (!ent || !ent.data) return 0;
    return Object.values(ent.data).reduce((sum, v) => sum + (v ? String(v).length : 0), 0);
  });

  const requiredProgress = computed(() => {
    const ent = getEntity();
    const groups = getGroups();
    const reqs = groups.flatMap((g) => g.f.filter((f) => f.r));
    const total = reqs.length;
    if (!ent || !ent.data || !total) {
      return { done: 0, total, pct: 0 };
    }
    const done = reqs.filter((f) => (ent.data[f.id] || '').trim()).length;
    return {
      done,
      total,
      pct: Math.round((done / total) * 100)
    };
  });

  const consistencyIssues = computed(() => {
    const ent = getEntity();
    if (!ent || !ent.data) return [];
    return checkConsistency(ent.data, kind, docStore.doc);
  });

  const backlinks = computed(() => {
    const ent = getEntity();
    if (!ent) return [];
    const nameKey = kind === 'world' ? 'w_name' : kind === 'org' ? 'o_name' : 'name';
    const name = (ent.data && ent.data[nameKey]) || ent.name;
    return findBacklinks(docStore.doc, ent.id, name);
  });

  function fillInspiration(fieldId: string, isTextarea: boolean, append = false): boolean {
    const ent = getEntity();
    if (!ent || (ent.isReference && !authStore.isAdmin)) return false;
    let pool = INSP[fieldId] ? [...INSP[fieldId]] : [];
    if (kind === 'world') {
      const w = docStore.activeWorld;
      if (w && w.customInsp && w.customInsp.length) {
        pool = [...w.customInsp, ...pool];
      }
    }
    if (!pool.length) {
      toast(t.value.noInsp, 'warn');
      return false;
    }
    const pick = pool[Math.floor(Math.random() * pool.length)];
    const cur = (ent.data[fieldId] || '').trim();
    if (append && cur) {
      const sep = isTextarea ? '\n' : '、';
      ent.data[fieldId] = cur.replace(/([、,，\n\s])+$/, '') + sep + pick;
    } else {
      ent.data[fieldId] = pick;
    }
    docStore.syncEntityName(kind, ent);
    docStore.touch();
    toast(t.value.sampleFill, 'ok');
    return true;
  }

  async function fillWithAI(fieldId: string, isTextarea: boolean, append = false): Promise<boolean> {
    const ent = getEntity();
    if (!ent || (ent.isReference && !authStore.isAdmin)) return false;
    const groups = getGroups();
    const fieldDef = groups.flatMap((g) => g.f).find((f) => f.id === fieldId);
    const label = fieldDef?.l || fieldId;
    const cur = (ent.data[fieldId] || '').trim();

    const id = ent.id;
    const liveEntity = () => (kind === 'world' ? docStore.doc.worlds : kind === 'org' ? docStore.doc.orgs : docStore.doc.chars)[id];
    try {
      return await aiStore.requestDraft({ task: 'field_gen', fieldId, fieldLabel: label, entityKind: kind,
        entityId: id, entityData: ent.data, currentText: cur }, {
        title: `AI 创作 · ${label}`,
        defaultMode: append ? 'append' : 'replace',
        currentValue: () => {
          const live = liveEntity();
          return live && (!live.isReference || authStore.isAdmin) ? live.data[fieldId] || '' : undefined;
        },
        apply: (content, mode) => {
          const live = liveEntity();
          if (!live) throw new Error('目标已删除');
          const previous = live.data[fieldId] || '';
          live.data[fieldId] = mode === 'append' && previous ? previous + (isTextarea ? '\n' : '、') + content : content;
          docStore.syncEntityName(kind, live);
          docStore.touch();
        }
      });
    } catch (err: any) {
      toast(err?.message || tr('AI 生成失败', 'AI generation failed'), 'err');
      return false;
    }
  }

  return {
    totalCharCount,
    requiredProgress,
    consistencyIssues,
    backlinks,
    fillInspiration,
    fillWithAI
  };
}
