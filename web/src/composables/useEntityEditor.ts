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
    toast(tr(`正在请求 AI 生成「${label}」…`, `AI generating ${label}…`), 'ok');

    // Build rich context anchor so AI has solid grounding
    let contextStr = '';
    const activeWorld = docStore.activeWorld;
    if (activeWorld && activeWorld.name) {
      contextStr += `所属世界观：${activeWorld.name}`;
      if (activeWorld.data?.w_type) contextStr += `（类型：${activeWorld.data.w_type}）`;
      if (activeWorld.data?.w_era) contextStr += `，纪元：${activeWorld.data.w_era}`;
      contextStr += '\n';
    }
    if (kind === 'char' && docStore.activeOrg?.name) {
      contextStr += `所属组织：${docStore.activeOrg.name}`;
      if (docStore.activeOrg.data?.o_type) contextStr += `（${docStore.activeOrg.data.o_type}）`;
      contextStr += '\n';
    }

    try {
      const res = await aiStore.generate({
        task: 'field_gen',
        fieldId,
        fieldLabel: label,
        entityKind: kind,
        entityData: ent.data,
        currentText: cur,
        context: contextStr.trim()
      });
      const generated = res.content.trim();
      if (!generated) return false;
      // The entity object may have been replaced (tab sync / merge) while we awaited.
      const coll = kind === 'world' ? docStore.doc.worlds : kind === 'org' ? docStore.doc.orgs : docStore.doc.chars;
      const live = coll[ent.id];
      if (!live) {
        toast(tr('目标条目已不存在，AI 结果已丢弃', 'Target entry no longer exists; AI result discarded'), 'warn');
        return false;
      }
      const nowCur = (live.data[fieldId] || '').trim();
      if (append && nowCur) {
        const sep = isTextarea ? '\n' : '、';
        live.data[fieldId] = nowCur.replace(/([、,，\n\s])+$/, '') + sep + generated;
      } else {
        live.data[fieldId] = generated;
      }
      docStore.syncEntityName(kind, live);
      docStore.touch();
      toast(tr(`AI 已生成「${label}」✓`, `Generated ${label} ✓`), 'ok');
      return true;
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
