export type EntityId = string;

export interface BaseEntity {
  id: EntityId;
  name: string;
  data: Record<string, string>;
  visibility?: 'private' | 'public';
  shareId?: string;
  isReference?: boolean;
  refAuthorId?: number;
  refAuthorName?: string;
  avatar?: string;
  tachiE?: string; // 立绘 URL or base64
  canonStatus?: 'canon' | 'doujin';
  cocreationId?: string;
  canonRequested?: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface WorldEntity extends BaseEntity {
  customInsp: string[];
  isCocreation?: boolean;
  cocreationAdmins?: string[];
  cocreationSummary?: string;
}

export interface OrgEntity extends BaseEntity {}

export interface CharEntity extends BaseEntity {
  templateId?: EntityId;
}

export interface TemplateDef {
  id: EntityId;
  name: string;
  desc?: string;
  enName?: string;
  enDesc?: string;
  fields: string[];
  builtin?: boolean;
  isReference?: boolean;
  refAuthorId?: number;
  refAuthorName?: string;
  updatedAt?: number;
}

export interface TimelineEvent {
  id: string;
  year: number;
  yearStr?: string;
  yearNum?: number | null;
  name: string;
  world?: string;
  chars?: string;
  desc?: string;
  link?: string;
  src?: 'manual' | 'world' | 'org' | 'char';
  isReference?: boolean;
  refAuthorId?: number;
  refAuthorName?: string;
  updatedAt?: number;
}

export type ChapterStatus = '未写' | '写作中' | '已完成';

export interface PlotChapter {
  id: string;
  title: string;
  status: ChapterStatus;
  year?: string;
  pov?: string;
  chars?: string;
  goal?: string;
  twist?: string;
  summary?: string;
  updatedAt?: number;
}

export interface PlotAct {
  id: string;
  title: string;
  chapters: PlotChapter[];
}

export interface PlotVolume {
  id: string;
  title: string;
  note?: string;
  acts: PlotAct[];
  isReference?: boolean;
  refAuthorId?: number;
  refAuthorName?: string;
  updatedAt?: number;
}

export interface SceneCard {
  id: string;
  title: string;
  time?: string;
  place?: string;
  location?: string;
  chars?: string;
  mood?: string;
  purpose?: string;
  conflict?: string;
  beat?: string;
  note?: string;
  status?: ChapterStatus;
  isReference?: boolean;
  refAuthorId?: number;
  refAuthorName?: string;
  updatedAt?: number;
}

export interface GlossaryItem {
  id: string;
  term: string;
  cat?: string;
  std?: string;
  def?: string;
  note?: string;
  isReference?: boolean;
  refAuthorId?: number;
  refAuthorName?: string;
  updatedAt?: number;
}

export interface DailyStat {
  date: string; // YYYY-MM-DD
  chars: number;
  done?: number;
}

export type ArticleCategory = '小说正文' | '设定集专题' | '外传番外' | '世界编年' | '其他';

export interface ArticleItem {
  id: string;
  title: string;
  category: ArticleCategory;
  summary: string;
  content: string;
  worldId?: string;
  orgIds?: string[];
  charIds?: string[];
  visibility: 'private' | 'public';
  shareId?: string;
  isReference?: boolean;
  refAuthorId?: number;
  refAuthorName?: string;
  wordCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface StudioPreferences {
  preferredGenre: string;      // e.g. "奇幻", "科幻", "赛博朋克", "仙侠"
  writingTone: string;         // e.g. "细腻生动", "冷峻考据", "史诗厚重", "轻快幽默"
  defaultPerspective: string;  // e.g. "第三人称有限", "第一人称", "全知视角"
  aiCustomInstruction: string; // e.g. "行文多白描，少用成语"
}

export interface UIState {
  activeW: EntityId | null;
  activeO: EntityId | null;
  activeC: EntityId | null;
  activeTpl: EntityId;
  activeArticle?: string | null;
  nowYear: number;
}

export interface DocV6 {
  _version: 6;
  worlds: Record<EntityId, WorldEntity>;
  orgs: Record<EntityId, OrgEntity>;
  chars: Record<EntityId, CharEntity>;
  templates: Record<EntityId, TemplateDef>;
  timeline: TimelineEvent[];
  plots: PlotVolume[];
  scenes: SceneCard[];
  glossary: GlossaryItem[];
  articles: ArticleItem[];
  stats: DailyStat[];
  preferences?: StudioPreferences;
  ui: UIState;
}

export interface FieldDef {
  id: string;
  l: string;
  el: string;
  t?: 'textarea' | 'text';
  p?: string;
  ep?: string;
  i?: string;
  r?: number;
}

export interface FieldGroupDef {
  id: string;
  t: string;
  et: string;
  f: FieldDef[];
}

export type EntityKind = 'world' | 'org' | 'char';

/** Collections that can surface a merge conflict. */
export type ConflictKind =
  | EntityKind
  | 'template'
  | 'timeline'
  | 'plot'
  | 'scene'
  | 'glossary'
  | 'article'
  | 'preferences';

/**
 * A single merge conflict.
 * - `fieldId` is a data key for entity fields,
 * - `$<meta>` (e.g. `$visibility`) for entity metadata,
 * - `*` for a whole record (array items / templates) whose local & remote JSON differ.
 */
export interface FieldConflict {
  kind: ConflictKind;
  entityId: string;
  entityName: string;
  fieldId: string;
  localVal: string;
  remoteVal: string;
  baseVal: string;
}

export interface DiffSummary {
  worldsAdded: number;
  worldsModified: number;
  orgsAdded: number;
  orgsModified: number;
  charsAdded: number;
  charsModified: number;
  timelineDelta: number;
  plotsDelta: number;
  scenesDelta: number;
  glossaryDelta: number;
  articlesDelta: number;
  templatesDelta: number;
}

export interface SettingComment {
  id: number;
  shareId: string;
  userId: number;
  userName: string;
  userAvatar: string;
  content: string;
  parentId: number;
  likeCount: number;
  hasLiked?: boolean;
  createdAt: number;
  replies: SettingComment[];
}

export interface NotificationItem {
  id: number;
  userId: number;
  senderId: number;
  senderName: string;
  type: string;
  title: string;
  content: string;
  targetId: string;
  targetKind: string;
  isRead: boolean;
  createdAt: number;
}

export interface ProjectMember {
  userId: number;
  name: string;
  avatar: string;
  role: 'owner' | 'admin';
}

export interface CocreationProject {
  id: string;
  worldId: string;
  worldTitle: string;
  ownerId: number;
  ownerName: string;
  /** Legacy display list (emails). Authority lives in `members`. */
  admins: string[];
  members: ProjectMember[];
  summary: string;
  isOpenDoujin: boolean;
  pendingCount?: number;
  createdAt: number;
  updatedAt: number;
}

export interface CreatorProfile {
  user: {
    id: number;
    name: string;
    avatar: string;
    bio: string;
    focus: string;
    lastSeen: number;
    isOnline: boolean;
  };
  isAdmin: boolean;
  isSuperAdmin: boolean;
  isMuted: boolean;
  createdAt: number;
  publishedShares: any[];
  cocreations: CocreationProject[];
}
