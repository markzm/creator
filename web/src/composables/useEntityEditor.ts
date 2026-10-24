import { computed } from 'vue';
import { checkConsistency } from '../core/consistency';
import { findBacklinks } from '../core/backlinks';
import { INSP } from '../core/legacy/insp';
import type { LegacyFieldGroup } from '../core/legacy/fields';
import type { BaseEntity, EntityKind } from '../core/schema/types';
import { useDocStore } from '../stores/doc';
import { useI18n } from './useI18n';
import { useToast } from './useToast';

export function useEntityEditor(
  kind: EntityKind,
  getEntity: () => BaseEntity | null,
  getGroups: () => LegacyFieldGroup[]
) {
  const docStore = useDocStore();
  const { t } = useI18n();
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
    if (!ent) return false;
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

  return {
    totalCharCount,
    requiredProgress,
    consistencyIssues,
    backlinks,
    fillInspiration
  };
}
