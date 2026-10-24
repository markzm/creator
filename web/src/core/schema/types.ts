export type EntityId = string;

export interface BaseEntity {
  id: EntityId;
  name: string;
  data: Record<string, string>;
  createdAt: number;
  updatedAt: number;
}

export interface WorldEntity extends BaseEntity {
  customInsp: string[];
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
  updatedAt?: number;
}

export interface GlossaryItem {
  id: string;
  term: string;
  cat?: string;
  std?: string;
  def?: string;
  note?: string;
  updatedAt?: number;
}

export interface DailyStat {
  date: string; // YYYY-MM-DD
  chars: number;
  done?: number;
}

export interface UIState {
  activeW: EntityId | null;
  activeO: EntityId | null;
  activeC: EntityId | null;
  activeTpl: EntityId;
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
  stats: DailyStat[];
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

export interface FieldConflict {
  kind: EntityKind;
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
}
