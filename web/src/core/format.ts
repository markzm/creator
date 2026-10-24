import { CG, OG, WG, type LegacyFieldGroup } from './legacy/fields';
import { T } from './legacy/i18n';
import type { CharEntity, DocV6, FieldGroupDef, TemplateDef } from './schema/types';

export type AnyFieldGroup = LegacyFieldGroup | FieldGroupDef;

/**
 * Resolves field groups for a character (either template-based or standard CG).
 * Matches legacy `CC.getCharGroups` in legacy/index.html L2265-L2278.
 */
export function getCharGroups(
  c?: CharEntity | null,
  templates?: Record<string, TemplateDef>
): LegacyFieldGroup[] {
  if (c && c.templateId && templates && templates[c.templateId]) {
    const tpl = templates[c.templateId];
    return [
      {
        t: tpl.name + ' 模板',
        tE: (tpl.enName || tpl.name) + ' Template',
        f: tpl.fields.map((fname, i) => ({
          id: 'tpl_' + c.templateId + '_' + i,
          l: fname,
          lE: fname,
          r: 0,
          ph: '',
          h: ''
        }))
      }
    ];
  }
  return CG;
}

/**
 * Formats field groups and data into text, Markdown, or JSON.
 * Matches legacy `CC.fmtOutput` in legacy/index.html L1228-L1247.
 */
export function fmtOutput(
  groups: AnyFieldGroup[],
  data: Record<string, string>,
  fmt: 'text' | 'md' | 'json',
  incEmpty = false,
  incGroupHeader = true,
  lang: 'zh' | 'en' = 'zh'
): string {
  if (fmt === 'json') return JSON.stringify(data, null, 2);
  const lines: string[] = [];
  groups.forEach((g) => {
    const items = (g.f as Array<{ id: string; l: string; lE?: string; el?: string }>).filter(
      (f) => incEmpty || data[f.id]
    );
    if (!items.length) return;
    const gTitle =
      lang === 'zh'
        ? g.t
        : ('tE' in g && g.tE) || ('et' in g && g.et) || g.t;
    if (incGroupHeader) {
      if (fmt === 'md') lines.push(`## ${gTitle}\n`);
      else lines.push(`【${gTitle}】`);
    }
    items.forEach((f) => {
      const v = data[f.id] || '';
      const label = lang === 'zh' ? f.l : f.lE || f.el || f.l;
      if (fmt === 'md') lines.push(`- **${label}**：${v}`);
      else lines.push(`${label}：${v}`);
    });
    if (fmt === 'text' || fmt === 'md') lines.push('');
  });
  return lines.join('\n').trim();
}

/**
 * Exports the entire DocV6 into a single comprehensive Markdown document.
 * Matches legacy `CC.exportAllMd` in legacy/index.html L2886-L2966.
 */
export function exportAllMd(doc: DocV6, lang: 'zh' | 'en' = 'zh'): string {
  const out: string[] = [];
  let any = false;
  const hasContent = (d?: Record<string, string>) =>
    Boolean(d && Object.values(d).some((v) => v && String(v).trim()));

  const worlds = Object.values(doc.worlds || {}).filter((w) => hasContent(w.data));
  if (worlds.length) {
    any = true;
    out.push(`# 🌍 ${lang === 'zh' ? '世界观' : 'Worlds'}\n`);
    worlds.forEach((w) => {
      out.push(`\n## ${w.data.w_name || w.name}\n`);
      out.push(fmtOutput(WG, w.data, 'md', false, true, lang));
    });
  }

  const orgs = Object.values(doc.orgs || {}).filter((o) => hasContent(o.data));
  if (orgs.length) {
    any = true;
    out.push(`\n\n# 🏛️ ${lang === 'zh' ? '组织' : 'Organizations'}\n`);
    orgs.forEach((o) => {
      out.push(`\n## ${o.data.o_name || o.name}\n`);
      out.push(fmtOutput(OG, o.data, 'md', false, true, lang));
    });
  }

  const chars = Object.values(doc.chars || {}).filter((c) => hasContent(c.data));
  if (chars.length) {
    any = true;
    out.push(`\n\n# 👤 ${lang === 'zh' ? '角色' : 'Characters'}\n`);
    chars.forEach((c) => {
      out.push(`\n## ${c.data.name || c.name}\n`);
      out.push(fmtOutput(getCharGroups(c, doc.templates), c.data, 'md', false, true, lang));
    });
  }

  if ((doc.timeline || []).length) {
    any = true;
    out.push(`\n\n# 📜 ${lang === 'zh' ? '时间线' : 'Timeline'}\n`);
    doc.timeline.forEach((e) => {
      const yDisp =
        e.yearStr !== undefined && e.yearStr !== ''
          ? e.yearStr
          : e.year !== undefined && e.year !== null && e.year !== 0
            ? String(e.year)
            : T[lang].unknownTime;
      out.push(`- **${e.name}**（${yDisp}）${e.desc ? '：' + e.desc : ''}`);
    });
  }

  if ((doc.plots || []).length) {
    any = true;
    out.push(`\n\n# 📖 ${lang === 'zh' ? '剧情线' : 'Plot outline'}\n`);
    doc.plots.forEach((p, pi) => {
      out.push(`\n## 卷${pi + 1} · ${p.title}${p.note ? '\n' + p.note : ''}\n`);
      (p.acts || []).forEach((a, ai) => {
        out.push(`\n### 幕${pi + 1}-${ai + 1} · ${a.title}\n`);
        (a.chapters || []).forEach((ch, ci) => {
          out.push(
            `- **第${ci + 1}章 · ${ch.title}**（${ch.status || '未写'}${ch.year ? ' · ' + ch.year : ''}）${ch.summary ? '：' + ch.summary : ''}`
          );
        });
      });
    });
  }

  if ((doc.scenes || []).length) {
    any = true;
    out.push(`\n\n# 🎬 ${lang === 'zh' ? '场景卡' : 'Scenes'}\n`);
    doc.scenes.forEach((s) => {
      out.push(`\n## ${s.title}（${s.status || '未写'}）\n`);
      const loc = s.location || s.place;
      const conf = s.conflict || s.purpose;
      const note = s.note || s.beat;
      if (loc) out.push(`- **${lang === 'zh' ? '地点' : 'Location'}**：${loc}`);
      if (s.chars) out.push(`- **${lang === 'zh' ? '出场' : 'Characters'}**：${s.chars}`);
      if (conf) out.push(`- **${lang === 'zh' ? '冲突' : 'Conflict'}**：${conf}`);
      if (note) out.push(`- **${lang === 'zh' ? '备注' : 'Note'}**：${note}`);
    });
  }

  if ((doc.glossary || []).length) {
    any = true;
    out.push(`\n\n# 📚 ${lang === 'zh' ? '术语表' : 'Glossary'}\n`);
    doc.glossary.forEach((g) => {
      const std = g.std || g.cat;
      const note = g.note || g.def;
      out.push(`- **${g.term}**${std ? ' → ' + std : ''}${note ? '（' + note + '）' : ''}`);
    });
  }

  if (!any) return '';
  return out.join('\n');
}
