import { buildCode } from '../core/draftCode';
import { fmtOutput, getCharGroups } from '../core/format';
import { CHAR_ORDER, OG, ORG_ORDER, WG, WORLD_ORDER } from '../core/legacy/fields';
import type { ArticleItem, BaseEntity, CharEntity, EntityKind } from '../core/schema/types';
import { api, type WorldShareItem } from '../data/api';
import { useAuthStore } from '../stores/auth';
import { useDocStore } from '../stores/doc';
import { useUIStore } from '../stores/ui';
import { useI18n } from './useI18n';
import { useToast } from './useToast';

export type PublishKind = EntityKind | 'article';

export interface PublishOptions {
  visibility?: 'public' | 'private';
  /** Attach the share to a co-creation project (the server decides canon vs doujin). */
  cocreationId?: string;
  /** Optional overrides when the user edited the share card before posting. */
  title?: string;
  summary?: string;
  content?: string;
  tags?: string;
}

/**
 * Single publish path for everything that can appear in the lobby.
 * Builds one consistent payload (formatted text + draft code for entities, body for articles),
 * keeps `shareId` / `visibility` on the local record in sync and only then marks the doc dirty.
 */
export function usePublish() {
  const docStore = useDocStore();
  const authStore = useAuthStore();
  const uiStore = useUIStore();
  const { lang, tr } = useI18n();
  const { toast } = useToast();

  function requireLogin(): boolean {
    if (authStore.isLoggedIn) return true;
    toast(tr('请先登录后再分享到创作大厅', 'Sign in to share to the lobby'), 'info');
    uiStore.openModal('auth');
    return false;
  }

  function entityOf(kind: EntityKind, id: string): BaseEntity | null {
    const coll = kind === 'world' ? docStore.doc.worlds : kind === 'org' ? docStore.doc.orgs : docStore.doc.chars;
    return coll[id] || null;
  }

  function articleOf(id: string): ArticleItem | null {
    return (docStore.doc.articles || []).find((a) => a.id === id) || null;
  }

  function entityPayload(kind: EntityKind, ent: BaseEntity) {
    const groups =
      kind === 'world' ? WG : kind === 'org' ? OG : getCharGroups(ent as CharEntity, docStore.doc.templates);
    let order: string[] = kind === 'world' ? WORLD_ORDER : kind === 'org' ? ORG_ORDER : CHAR_ORDER;
    const prefix = kind === 'world' ? 'CC3W' : kind === 'org' ? 'CC2O' : 'CC2';
    if (kind === 'char') {
      const tplId = (ent as CharEntity).templateId;
      const tpl = tplId ? docStore.doc.templates[tplId] : undefined;
      if (tpl) order = tpl.fields.map((_, i) => `tpl_${tplId}_${i}`);
    }
    const data = ent.data || {};
    const summarySource = data.w_core || data.w_summary || data.o_creed_line || data.o_motto || data.personality || '';
    return {
      title: (ent.name || '').trim(),
      summary: summarySource.slice(0, 120),
      content: fmtOutput(groups, data, 'text', false, true, lang.value),
      draftCode: buildCode(data, order, prefix) || '',
      tags: '',
      tachiEUrl: ent.tachiE && /^https?:\/\//.test(ent.tachiE) ? ent.tachiE : ''
    };
  }

  /**
   * Publishes (or re-publishes) an entity / article. Returns the share or null on failure.
   * Reference materials are never published as the user's own work.
   */
  async function publishEntity(kind: PublishKind, id: string, opts: PublishOptions = {}): Promise<WorldShareItem | null> {
    if (!requireLogin()) return null;
    const visibility = opts.visibility || 'public';
    const target = kind === 'article' ? articleOf(id) : entityOf(kind, id);
    if (!target) {
      toast(tr('找不到要分享的条目', 'Item not found'), 'err');
      return null;
    }
    if (target.isReference) {
      toast(tr('官方参考素材不能作为个人作品分享，请先复制为衍生副本', 'Reference materials cannot be published as your own; fork first'), 'warn');
      return null;
    }

    let base: { title: string; summary: string; content: string; draftCode: string; tags: string; tachiEUrl: string };
    if (kind === 'article') {
      const art = target as ArticleItem;
      base = {
        title: art.title || tr('未命名文章', 'Untitled'),
        summary: art.summary || (art.content || '').slice(0, 120),
        content: art.content || '',
        draftCode: '',
        tags: art.category || '',
        tachiEUrl: ''
      };
    } else {
      base = entityPayload(kind, target as BaseEntity);
    }
    const title = (opts.title ?? base.title).trim();
    if (!title || title === '未命名' || title === 'Untitled') {
      toast(tr('请先填写名称再分享', 'Please name this entry before sharing'), 'warn');
      return null;
    }
    if (!(opts.content ?? base.content).trim()) {
      toast(tr('内容为空，无法分享', 'Nothing to share yet'), 'warn');
      return null;
    }

    try {
      const res = await api.createShare({
        id: target.shareId,
        entityId: id,
        kind,
        title: title.slice(0, 80),
        summary: (opts.summary ?? base.summary).slice(0, 200),
        content: opts.content ?? base.content,
        draftCode: base.draftCode,
        visibility,
        tags: opts.tags ?? base.tags,
        cocreationId: opts.cocreationId,
        tachiEUrl: base.tachiEUrl
      });
      // Write the link + visibility BEFORE touching so a single save persists both.
      target.shareId = String(res.share.id);
      target.visibility = visibility;
      target.updatedAt = Date.now();
      docStore.touch(true);
      return res.share;
    } catch (err: any) {
      toast((tr('分享失败：', 'Share failed: ')) + (err?.message || ''), 'err');
      return null;
    }
  }

  /** Flips a published item back to private (keeps the share so it can be re-published in place). */
  async function unpublishEntity(kind: PublishKind, id: string): Promise<boolean> {
    const target = kind === 'article' ? articleOf(id) : entityOf(kind, id);
    if (!target) return false;
    if (target.shareId && authStore.isLoggedIn) {
      try {
        await api.updateShareVisibility(target.shareId, 'private');
      } catch (err: any) {
        toast((tr('更新状态失败：', 'Update failed: ')) + (err?.message || ''), 'err');
        return false;
      }
    }
    target.visibility = 'private';
    target.updatedAt = Date.now();
    docStore.touch(true);
    return true;
  }

  /** Convenience toggle used by list views. */
  async function toggleVisibility(kind: PublishKind, id: string): Promise<'public' | 'private' | null> {
    const target = kind === 'article' ? articleOf(id) : entityOf(kind, id);
    if (!target) return null;
    if (target.visibility === 'public') {
      return (await unpublishEntity(kind, id)) ? 'private' : null;
    }
    return (await publishEntity(kind, id, { visibility: 'public' })) ? 'public' : null;
  }

  return { publishEntity, unpublishEntity, toggleVisibility };
}
