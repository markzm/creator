import {
  BarChart3,
  BookMarked,
  BookOpen,
  Clapperboard,
  Globe2,
  Landmark,
  Library,
  Network,
  PenLine,
  Scroll,
  Shapes,
  User,
  Users,
  type LucideIcon
} from 'lucide-vue-next';

/**
 * Single source of truth for "what does a kind look like": icon, colour token, labels, route.
 * Replaces the emoji/colour maps that were duplicated across Dashboard, Lobby, Me, Sidebar, WikiText.
 */
export type MetaKind =
  | 'world'
  | 'org'
  | 'char'
  | 'article'
  | 'glossary'
  | 'timeline'
  | 'graph'
  | 'template'
  | 'plot'
  | 'scene'
  | 'stats'
  | 'lobby'
  | 'me';

export interface KindMeta {
  icon: LucideIcon;
  /** CSS colour token (foreground). */
  color: string;
  /** CSS colour token (soft background). */
  soft: string;
  zh: string;
  en: string;
  route: string;
  /** Pill tone class, when the kind has one. */
  pill: string;
}

export const KIND_META: Record<MetaKind, KindMeta> = {
  world: { icon: Globe2, color: 'var(--k-world)', soft: 'var(--k-world-s)', zh: '世界观', en: 'World', route: '/world', pill: 'k-world' },
  org: { icon: Landmark, color: 'var(--k-org)', soft: 'var(--k-org-s)', zh: '组织', en: 'Org', route: '/org', pill: 'k-org' },
  char: { icon: User, color: 'var(--k-char)', soft: 'var(--k-char-s)', zh: '角色', en: 'Character', route: '/char', pill: 'k-char' },
  article: { icon: PenLine, color: 'var(--k-article)', soft: 'var(--k-article-s)', zh: '文章', en: 'Article', route: '/articles', pill: 'k-article' },
  glossary: { icon: BookMarked, color: 'var(--k-glossary)', soft: 'var(--k-glossary-s)', zh: '术语', en: 'Glossary', route: '/glossary', pill: 'k-glossary' },
  timeline: { icon: Scroll, color: 'var(--ac)', soft: 'var(--acs)', zh: '时间线', en: 'Timeline', route: '/timeline', pill: 'accent' },
  graph: { icon: Network, color: 'var(--ac)', soft: 'var(--acs)', zh: '关系网', en: 'Graph', route: '/graph', pill: 'accent' },
  template: { icon: Shapes, color: 'var(--ac)', soft: 'var(--acs)', zh: '模板', en: 'Template', route: '/templates', pill: 'accent' },
  plot: { icon: BookOpen, color: 'var(--k-article)', soft: 'var(--k-article-s)', zh: '剧情线', en: 'Plot', route: '/plots', pill: 'k-article' },
  scene: { icon: Clapperboard, color: 'var(--k-org)', soft: 'var(--k-org-s)', zh: '场景', en: 'Scene', route: '/scenes', pill: 'k-org' },
  stats: { icon: BarChart3, color: 'var(--ok)', soft: 'var(--oks)', zh: '写作看板', en: 'Stats', route: '/stats', pill: 'ok' },
  lobby: { icon: Users, color: 'var(--ac)', soft: 'var(--acs)', zh: '创作大厅', en: 'Lobby', route: '/lobby', pill: 'accent' },
  me: { icon: Library, color: 'var(--ac)', soft: 'var(--acs)', zh: '个人主页', en: 'Profile', route: '/me', pill: 'accent' }
};

export function kindMeta(kind: string): KindMeta {
  return KIND_META[(kind as MetaKind) in KIND_META ? (kind as MetaKind) : 'world'];
}

export function kindLabel(kind: string, lang: 'zh' | 'en' = 'zh'): string {
  const m = kindMeta(kind);
  return lang === 'zh' ? m.zh : m.en;
}
