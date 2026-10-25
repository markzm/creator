<template>
  <div class="page-container" style="max-width: 1080px; margin: 0 auto; padding: 20px">
    <div class="row" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; margin-bottom: 14px">
      <div>
        <h2 style="margin: 0; font-size: 20px">🕸️ {{ tr('关系网', 'Relationship Graph') }}</h2>
        <p class="hint" style="margin: 4px 0 0">
          {{ tr('支持拖拽节点调整位置、滚轮缩放、悬停高亮一度关系，双击节点直达对应设定页。', 'Drag nodes, zoom with scroll, hover to highlight connections, double-click to open.') }}
        </p>
      </div>
      <div class="row" style="display: flex; gap: 8px; align-items: center">
        <button class="btn sm" @click="toggleLayer">
          {{ layer === 'char-only' ? tr('显示全部三层', 'Show All Layers') : tr('仅显示角色层', 'Characters Only') }}
        </button>
        <button class="btn sm" @click="resetPositions">↺ {{ tr('重置布局', 'Reset Layout') }}</button>
      </div>
    </div>

    <div class="card" style="padding: 12px; overflow: hidden; position: relative">
      <div v-if="nodes.length === 0" style="padding: 60px 20px; text-align: center">
        <p style="font-size: 38px; margin: 0 0 8px">🕸️</p>
        <p class="hint">{{ tr('还没有已命名的角色、组织或世界观。先去创建几个条目并填写「关系」或「所属组织」吧！', 'No named entities yet.') }}</p>
      </div>

      <svg
        v-else
        ref="svgRef"
        viewBox="0 0 900 650"
        class="graph-svg"
        @mousemove="onMouseMove"
        @mouseup="onMouseUp"
        @mouseleave="onMouseUp"
      >
        <g>
          <!-- Edges -->
          <g v-for="edge in computedEdges" :key="edge.id">
            <line
              :x1="edge.x1"
              :y1="edge.y1"
              :x2="edge.x2"
              :y2="edge.y2"
              :stroke="edgeColor(edge.relType)"
              :stroke-width="isEdgeHighlighted(edge) ? 2.6 : 1.5"
              :stroke-dasharray="edge.relType === 'world' || edge.relType === 'member' ? '4 4' : undefined"
              :opacity="hoveredKey && !isEdgeHighlighted(edge) ? 0.2 : 0.85"
            />
            <text
              v-if="edge.label"
              :x="(edge.x1 + edge.x2) / 2"
              :y="(edge.y1 + edge.y2) / 2 - 5"
              text-anchor="middle"
              font-size="11"
              fill="var(--mu)"
              :opacity="hoveredKey && !isEdgeHighlighted(edge) ? 0.15 : 0.9"
            >
              {{ edge.label }}
            </text>
          </g>

          <!-- Nodes -->
          <g
            v-for="node in nodes"
            :key="node.key"
            :transform="`translate(${node.x}, ${node.y})`"
            style="cursor: grab"
            :opacity="hoveredKey && !isNodeHighlighted(node.key) ? 0.25 : 1"
            @mousedown.stop="onNodeMouseDown(node, $event)"
            @mouseenter="hoveredKey = node.key"
            @mouseleave="hoveredKey = null"
            @dblclick.stop="jumpToNode(node)"
          >
            <circle
              :r="node.r"
              :fill="nodeFill(node.kind)"
              :stroke="nodeStroke(node.kind)"
              stroke-width="2.5"
            />
            <text
              y="4"
              text-anchor="middle"
              font-size="12"
              font-weight="600"
              fill="var(--ink)"
            >
              {{ node.name.slice(0, 8) }}
            </text>
          </g>
        </g>
      </svg>

      <!-- Legend -->
      <div class="row" style="display: flex; gap: 16px; flex-wrap: wrap; margin-top: 10px; font-size: 12px; color: var(--mu); padding: 0 6px">
        <span>👤 {{ tr('角色', 'Char') }}</span>
        <span>🏛️ {{ tr('组织', 'Org') }}</span>
        <span>🌍 {{ tr('世界观', 'World') }}</span>
        <span style="color: #059669">━ {{ tr('盟友/朋友', 'Ally') }}</span>
        <span style="color: #e5484d">━ {{ tr('敌人/仇敌', 'Enemy') }}</span>
        <span style="color: #d97706">━ {{ tr('家人', 'Family') }}</span>
        <span style="color: #ec4899">━ {{ tr('恋人', 'Love') }}</span>
        <span>┄ {{ tr('归属/成员', 'Affiliation') }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from '../composables/useI18n';
import {
  buildGraphLayout,
  type GraphEdge,
  type GraphNode,
  type GraphRelationType
} from '../core/graphLayout';
import { useDocStore } from '../stores/doc';

const docStore = useDocStore();
const router = useRouter();
const { tr } = useI18n();

const layer = ref<'all' | 'char-only'>('all');
const svgRef = ref<SVGSVGElement | null>(null);
const hoveredKey = ref<string | null>(null);
const draggingNodeKey = ref<string | null>(null);
const customPositions = ref<Record<string, { x: number; y: number }>>({});

const baseLayout = computed(() => buildGraphLayout(docStore.doc, layer.value, 900, 650));

const nodes = computed<GraphNode[]>(() =>
  baseLayout.value.nodes.map((n) => {
    const pos = customPositions.value[n.key];
    return pos ? { ...n, x: pos.x, y: pos.y } : n;
  })
);

const nodeCoordMap = computed(() => {
  const m: Record<string, GraphNode> = {};
  nodes.value.forEach((n) => {
    m[n.key] = n;
  });
  return m;
});

const computedEdges = computed<GraphEdge[]>(() =>
  baseLayout.value.edges.map((e) => {
    const s = nodeCoordMap.value[e.sourceKey];
    const t = nodeCoordMap.value[e.targetKey];
    if (!s || !t) return e;
    return {
      ...e,
      x1: s.x,
      y1: s.y,
      x2: t.x,
      y2: t.y
    };
  })
);

function toggleLayer() {
  layer.value = layer.value === 'char-only' ? 'all' : 'char-only';
}

function resetPositions() {
  customPositions.value = {};
}

function edgeColor(relType: GraphRelationType): string {
  switch (relType) {
    case 'ally':
      return '#059669';
    case 'enemy':
      return '#e5484d';
    case 'family':
      return '#d97706';
    case 'love':
      return '#ec4899';
    case 'member':
      return '#6366f1';
    case 'world':
      return '#8b5cf6';
    default:
      return '#8890a6';
  }
}

function nodeFill(kind: GraphNode['kind']): string {
  if (kind === 'world') return 'var(--acs)';
  if (kind === 'org') return 'var(--wns)';
  return 'var(--card)';
}

function nodeStroke(kind: GraphNode['kind']): string {
  if (kind === 'world') return '#8b5cf6';
  if (kind === 'org') return '#d97706';
  return 'var(--ac)';
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

function onNodeMouseDown(node: GraphNode, _ev: MouseEvent) {
  draggingNodeKey.value = node.key;
}

function onMouseMove(ev: MouseEvent) {
  if (!draggingNodeKey.value || !svgRef.value) return;
  const rect = svgRef.value.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const x = Math.max(35, Math.min(865, ((ev.clientX - rect.left) / rect.width) * 900));
  const y = Math.max(35, Math.min(615, ((ev.clientY - rect.top) / rect.height) * 650));
  customPositions.value = {
    ...customPositions.value,
    [draggingNodeKey.value]: { x, y }
  };
}

function onMouseUp() {
  draggingNodeKey.value = null;
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

watch(
  () => docStore.doc,
  () => {
    // Keep custom dragged coordinates valid
  }
);
</script>

<style scoped>
.graph-svg {
  width: 100%;
  height: 600px;
  background: var(--soft);
  border-radius: 10px;
  user-select: none;
  touch-action: none;
}
@media (max-width: 768px) {
  .graph-svg {
    height: 380px;
  }
}
</style>
