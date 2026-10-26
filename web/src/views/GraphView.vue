<template>
  <div class="page">
    <PageHeader
      :title="tr('关系网', 'Relationship Graph')"
      :subtitle="tr('拖拽节点调整位置，滚轮缩放，按住空白处平移，悬停高亮一度关系，双击节点直达设定页。', 'Drag nodes, scroll to zoom, drag the canvas to pan, hover to highlight, double-click to open.')"
      :icon="Network"
    >
      <template #actions>
        <SegmentedTabs
          :model-value="layer"
          :items="[
            { value: 'all', label: tr('三层', 'All layers') },
            { value: 'char-only', label: tr('仅角色', 'Characters') }
          ]"
          @update:model-value="(v) => (layer = v as 'all' | 'char-only')"
        />
        <button class="btn sm" :title="tr('复位缩放与平移', 'Reset zoom & pan')" @click="resetView"><Maximize2 /> {{ tr('复位视图', 'Fit') }}</button>
        <button class="btn sm" @click="resetPositions"><RotateCcw /> {{ tr('重置布局', 'Reset layout') }}</button>
      </template>
    </PageHeader>

    <div class="card flat graph-card">
      <EmptyState
        v-if="nodes.length === 0"
        :icon="Network"
        :title="tr('还没有可展示的关系', 'Nothing to map yet')"
        :description="tr('先创建几个已命名的角色、组织或世界观，并填写「关系」或「所属组织」。', 'Create a few named characters, orgs or worlds and fill in relationships or affiliations.')"
      >
        <button class="btn primary sm" @click="router.push('/char')"><Plus /> {{ tr('去创建角色', 'Create a character') }}</button>
      </EmptyState>

      <template v-else>
        <svg
          ref="svgRef"
          :viewBox="`${view.x} ${view.y} ${view.w} ${view.h}`"
          class="graph-svg"
          :class="{ panning: isPanning }"
          @wheel.prevent="onWheel"
          @pointerdown="onCanvasPointerDown"
          @pointermove="onPointerMove"
          @pointerup="onPointerUp"
          @pointercancel="onPointerUp"
          @pointerleave="onPointerUp"
        >
          <defs>
            <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--mu2)" />
            </marker>
            <filter id="halo" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="1" stdDeviation="1.2" flood-color="rgba(0,0,0,0.18)" />
            </filter>
          </defs>

          <g v-for="edge in computedEdges" :key="edge.id">
            <path
              :d="edgePath(edge)"
              fill="none"
              :stroke="edgeColor(edge.relType)"
              :stroke-width="isEdgeHighlighted(edge) ? 2.6 : 1.4"
              :stroke-dasharray="edge.relType === 'world' || edge.relType === 'member' ? '4 4' : undefined"
              :opacity="hoveredKey && !isEdgeHighlighted(edge) ? 0.15 : 0.8"
              stroke-linecap="round"
            />
            <g v-if="edge.label" :opacity="hoveredKey && !isEdgeHighlighted(edge) ? 0.1 : 0.95">
              <rect
                :x="(edge.x1 + edge.x2) / 2 - edge.label.length * 3.4 - 4"
                :y="(edge.y1 + edge.y2) / 2 - 14"
                :width="edge.label.length * 6.8 + 8"
                height="16"
                rx="6"
                fill="var(--card)"
                stroke="var(--li)"
              />
              <text :x="(edge.x1 + edge.x2) / 2" :y="(edge.y1 + edge.y2) / 2 - 2.5" text-anchor="middle" font-size="10" fill="var(--mu)">
                {{ edge.label }}
              </text>
            </g>
          </g>

          <g
            v-for="node in nodes"
            :key="node.key"
            :transform="`translate(${node.x}, ${node.y})`"
            class="g-node"
            :opacity="hoveredKey && !isNodeHighlighted(node.key) ? 0.22 : 1"
            @pointerdown.stop="onNodePointerDown(node, $event)"
            @pointerenter="hoveredKey = node.key"
            @pointerleave="hoveredKey = null"
            @dblclick.stop="jumpToNode(node)"
          >
            <circle :r="nodeRadius(node)" :fill="nodeFill(node.kind)" :stroke="nodeStroke(node.kind)" stroke-width="2.5" filter="url(#halo)" />
            <text y="1" text-anchor="middle" dominant-baseline="middle" :font-size="nodeRadius(node) * 0.9" font-weight="700" :fill="nodeStroke(node.kind)">
              {{ (node.name || '?').slice(0, 1) }}
            </text>
            <g :transform="`translate(0, ${nodeRadius(node) + 14})`">
              <rect
                :x="-labelWidth(node) / 2"
                y="-9"
                :width="labelWidth(node)"
                height="18"
                rx="7"
                fill="var(--card)"
                stroke="var(--li)"
              />
              <text text-anchor="middle" dominant-baseline="middle" font-size="11" font-weight="600" fill="var(--ink)">
                {{ node.name.slice(0, 10) }}
              </text>
            </g>
          </g>
        </svg>

        <div class="graph-legend">
          <span class="pill k-char"><User /> {{ tr('角色', 'Char') }}</span>
          <span class="pill k-org"><Landmark /> {{ tr('组织', 'Org') }}</span>
          <span class="pill k-world"><Globe2 /> {{ tr('世界观', 'World') }}</span>
          <span class="legend-sep" />
          <span class="legend-line" style="--c: var(--rel-ally)">{{ tr('盟友', 'Ally') }}</span>
          <span class="legend-line" style="--c: var(--rel-enemy)">{{ tr('敌对', 'Enemy') }}</span>
          <span class="legend-line" style="--c: var(--rel-family)">{{ tr('家人', 'Family') }}</span>
          <span class="legend-line" style="--c: var(--rel-love)">{{ tr('恋人', 'Love') }}</span>
          <span class="legend-line dashed" style="--c: var(--rel-member)">{{ tr('归属 / 成员', 'Affiliation') }}</span>
          <span class="legend-zoom">{{ Math.round((BASE_W / view.w) * 100) }}%</span>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Globe2, Landmark, Maximize2, Network, Plus, RotateCcw, User } from 'lucide-vue-next';
import { computed, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import EmptyState from '../components/base/EmptyState.vue';
import PageHeader from '../components/base/PageHeader.vue';
import SegmentedTabs from '../components/base/SegmentedTabs.vue';
import { useI18n } from '../composables/useI18n';
import { buildGraphLayout, type GraphEdge, type GraphNode, type GraphRelationType } from '../core/graphLayout';
import { useDocStore } from '../stores/doc';

const BASE_W = 900;
const BASE_H = 650;

const docStore = useDocStore();
const router = useRouter();
const { tr } = useI18n();

const layer = ref<'all' | 'char-only'>('all');
const svgRef = ref<SVGSVGElement | null>(null);
const hoveredKey = ref<string | null>(null);
const draggingNodeKey = ref<string | null>(null);
const isPanning = ref(false);
const customPositions = ref<Record<string, { x: number; y: number }>>({});
const view = reactive({ x: 0, y: 0, w: BASE_W, h: BASE_H });
let panStart: { px: number; py: number; vx: number; vy: number } | null = null;

const baseLayout = computed(() => buildGraphLayout(docStore.doc, layer.value, BASE_W, BASE_H));

const nodes = computed<GraphNode[]>(() =>
  baseLayout.value.nodes.map((n) => {
    const pos = customPositions.value[n.key];
    return pos ? { ...n, x: pos.x, y: pos.y } : n;
  })
);

const nodeCoordMap = computed(() => {
  const m: Record<string, GraphNode> = {};
  nodes.value.forEach((n) => (m[n.key] = n));
  return m;
});

const degree = computed(() => {
  const d: Record<string, number> = {};
  baseLayout.value.edges.forEach((e) => {
    d[e.sourceKey] = (d[e.sourceKey] || 0) + 1;
    d[e.targetKey] = (d[e.targetKey] || 0) + 1;
  });
  return d;
});

const computedEdges = computed<GraphEdge[]>(() =>
  baseLayout.value.edges.map((e) => {
    const s = nodeCoordMap.value[e.sourceKey];
    const t = nodeCoordMap.value[e.targetKey];
    if (!s || !t) return e;
    return { ...e, x1: s.x, y1: s.y, x2: t.x, y2: t.y };
  })
);

function nodeRadius(node: GraphNode): number {
  const base = node.kind === 'world' ? 26 : node.kind === 'org' ? 22 : 18;
  return base + Math.min(10, (degree.value[node.key] || 0) * 1.5);
}

function labelWidth(node: GraphNode): number {
  const text = node.name.slice(0, 10);
  // rough: CJK chars are ~11px, latin ~6.5px at 11px font
  let w = 0;
  for (const ch of text) w += /[　-鿿＀-￯]/.test(ch) ? 11.5 : 6.8;
  return Math.max(28, w + 14);
}

/** Slightly curved edges read better than straight lines when several overlap. */
function edgePath(e: GraphEdge): string {
  const mx = (e.x1 + e.x2) / 2;
  const my = (e.y1 + e.y2) / 2;
  const dx = e.x2 - e.x1;
  const dy = e.y2 - e.y1;
  const len = Math.max(1, Math.hypot(dx, dy));
  const k = Math.min(28, len * 0.12);
  const cx = mx - (dy / len) * k;
  const cy = my + (dx / len) * k;
  return `M ${e.x1} ${e.y1} Q ${cx} ${cy} ${e.x2} ${e.y2}`;
}

function resetPositions() {
  customPositions.value = {};
}

function resetView() {
  view.x = 0;
  view.y = 0;
  view.w = BASE_W;
  view.h = BASE_H;
}

function edgeColor(relType: GraphRelationType): string {
  switch (relType) {
    case 'ally':
      return 'var(--rel-ally)';
    case 'enemy':
      return 'var(--rel-enemy)';
    case 'family':
      return 'var(--rel-family)';
    case 'love':
      return 'var(--rel-love)';
    case 'member':
      return 'var(--rel-member)';
    case 'world':
      return 'var(--rel-world)';
    default:
      return 'var(--rel-other)';
  }
}

function nodeFill(kind: GraphNode['kind']): string {
  if (kind === 'world') return 'var(--k-world-s)';
  if (kind === 'org') return 'var(--k-org-s)';
  return 'var(--k-char-s)';
}

function nodeStroke(kind: GraphNode['kind']): string {
  if (kind === 'world') return 'var(--k-world)';
  if (kind === 'org') return 'var(--k-org)';
  return 'var(--k-char)';
}

function isEdgeHighlighted(edge: GraphEdge): boolean {
  if (!hoveredKey.value) return false;
  return edge.sourceKey === hoveredKey.value || edge.targetKey === hoveredKey.value;
}

function isNodeHighlighted(key: string): boolean {
  if (!hoveredKey.value) return true;
  if (key === hoveredKey.value) return true;
  return computedEdges.value.some(
    (e) =>
      (e.sourceKey === hoveredKey.value && e.targetKey === key) ||
      (e.targetKey === hoveredKey.value && e.sourceKey === key)
  );
}

/** Converts a pointer event to graph coordinates honouring the current viewBox. */
function toGraphCoords(ev: PointerEvent | WheelEvent): { x: number; y: number } | null {
  const svg = svgRef.value;
  if (!svg) return null;
  const rect = svg.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  return {
    x: view.x + ((ev.clientX - rect.left) / rect.width) * view.w,
    y: view.y + ((ev.clientY - rect.top) / rect.height) * view.h
  };
}

function onWheel(ev: WheelEvent) {
  const p = toGraphCoords(ev);
  if (!p) return;
  const factor = ev.deltaY > 0 ? 1.12 : 1 / 1.12;
  const newW = Math.min(BASE_W * 2.5, Math.max(BASE_W / 3, view.w * factor));
  const scale = newW / view.w;
  view.x = p.x - (p.x - view.x) * scale;
  view.y = p.y - (p.y - view.y) * scale;
  view.w = newW;
  view.h = view.h * scale;
}

function onNodePointerDown(node: GraphNode, ev: PointerEvent) {
  draggingNodeKey.value = node.key;
  (ev.currentTarget as Element | null)?.setPointerCapture?.(ev.pointerId);
}

function onCanvasPointerDown(ev: PointerEvent) {
  if (draggingNodeKey.value) return;
  isPanning.value = true;
  panStart = { px: ev.clientX, py: ev.clientY, vx: view.x, vy: view.y };
  (ev.currentTarget as Element | null)?.setPointerCapture?.(ev.pointerId);
}

function onPointerMove(ev: PointerEvent) {
  if (draggingNodeKey.value) {
    const p = toGraphCoords(ev);
    if (!p) return;
    customPositions.value = {
      ...customPositions.value,
      [draggingNodeKey.value]: {
        x: Math.max(30, Math.min(BASE_W - 30, p.x)),
        y: Math.max(30, Math.min(BASE_H - 30, p.y))
      }
    };
    return;
  }
  if (isPanning.value && panStart && svgRef.value) {
    const rect = svgRef.value.getBoundingClientRect();
    view.x = panStart.vx - ((ev.clientX - panStart.px) / rect.width) * view.w;
    view.y = panStart.vy - ((ev.clientY - panStart.py) / rect.height) * view.h;
  }
}

function onPointerUp() {
  draggingNodeKey.value = null;
  isPanning.value = false;
  panStart = null;
}

function jumpToNode(node: GraphNode) {
  if (node.kind === 'world') {
    docStore.selectWorld(node.id);
    router.push('/world');
  } else if (node.kind === 'org') {
    docStore.selectOrg(node.id);
    router.push('/org');
  } else {
    docStore.selectChar(node.id);
    router.push('/char');
  }
}
</script>

<style scoped>
.graph-card { padding: 12px; overflow: hidden; position: relative; }
.graph-svg {
  width: 100%;
  height: 600px;
  background:
    radial-gradient(circle at 1px 1px, color-mix(in srgb, var(--li) 70%, transparent) 1px, transparent 0) 0 0 / 22px 22px,
    var(--soft);
  border-radius: 12px;
  user-select: none;
  touch-action: none;
  cursor: grab;
}
.graph-svg.panning { cursor: grabbing; }
.g-node { cursor: grab; transition: opacity var(--dur-2); }
.graph-legend {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  align-items: center;
  margin-top: 10px;
  padding: 0 4px;
  font-size: var(--fs-12);
  color: var(--mu);
}
.graph-legend .pill svg { width: 11px; height: 11px; }
.legend-sep { width: 1px; height: 14px; background: var(--li); }
.legend-line { display: inline-flex; align-items: center; gap: 6px; }
.legend-line::before { content: ""; width: 18px; height: 2px; border-radius: 2px; background: var(--c); }
.legend-line.dashed::before { background: repeating-linear-gradient(90deg, var(--c) 0 4px, transparent 4px 7px); }
.legend-zoom { margin-left: auto; font-family: var(--font-mono); color: var(--mu2); }
@media (max-width: 900px) {
  .graph-svg { height: 420px; }
}
</style>
