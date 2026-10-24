import type { DocV6, EntityKind } from './schema/types';

export type GraphRelationType = 'family' | 'ally' | 'enemy' | 'love' | 'other' | 'member' | 'world';

export interface GraphNode {
  key: string;
  id: string;
  name: string;
  kind: EntityKind;
  x: number;
  y: number;
  r: number;
}

export interface GraphEdge {
  id: string;
  sourceKey: string;
  targetKey: string;
  sourceId: string;
  targetId: string;
  relType: GraphRelationType;
  label: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface GraphLayoutResult {
  width: number;
  height: number;
  nodes: GraphNode[];
  edges: GraphEdge[];
  nodeMap: Record<string, GraphNode>;
}

/**
 * Extracts nodes and relationship edges from `DocV6` and computes circular coordinates
 * on a 900x650 canvas.
 * Matches legacy `CC.renderGraph` in legacy/index.html L1508-L1641.
 */
export function buildGraphLayout(
  doc: DocV6,
  layer: 'all' | 'char-only' = 'all',
  width = 900,
  height = 650
): GraphLayoutResult {
  const chars = Object.values(doc.chars || {}).filter((c) => c.data && c.data.name);
  const orgs = Object.values(doc.orgs || {}).filter((o) => o.data && o.data.o_name);
  const worlds = Object.values(doc.worlds || {}).filter((w) => w.data && w.data.w_name);

  const cx = width / 2;
  const cy = height / 2;
  const R = Math.min(width, height) / 2 - 200;

  const nodeMap: Record<string, GraphNode> = {};
  const charIndex: Record<string, string> = {};
  const orgIndex: Record<string, string> = {};
  const worldIndex: Record<string, string> = {};

  chars.forEach((c, i) => {
    const a = (i / Math.max(chars.length, 1)) * Math.PI * 2 - Math.PI / 2;
    let key = 'c:' + c.data.name;
    if (nodeMap[key]) {
      key = 'c:' + c.data.name + '#' + c.id;
    } else {
      charIndex[c.data.name] = key;
    }
    nodeMap[key] = {
      key,
      id: c.id,
      name: c.data.name,
      kind: 'char',
      x: cx + R * Math.cos(a),
      y: cy + R * Math.sin(a),
      r: 24
    };
  });

  if (layer !== 'char-only') {
    orgs.forEach((o, i) => {
      const a = (i / Math.max(orgs.length, 1)) * Math.PI * 2 - Math.PI / 2 + 0.3;
      let key = 'o:' + o.data.o_name;
      if (nodeMap[key]) {
        key = 'o:' + o.data.o_name + '#' + o.id;
      } else {
        orgIndex[o.data.o_name] = key;
      }
      nodeMap[key] = {
        key,
        id: o.id,
        name: o.data.o_name,
        kind: 'org',
        x: cx + (R + 70) * Math.cos(a),
        y: cy + (R + 70) * Math.sin(a),
        r: 28
      };
    });

    worlds.forEach((w, i) => {
      const a = (i / Math.max(worlds.length, 1)) * Math.PI * 2 - Math.PI / 2 + 0.6;
      let key = 'w:' + w.data.w_name;
      if (nodeMap[key]) {
        key = 'w:' + w.data.w_name + '#' + w.id;
      } else {
        worldIndex[w.data.w_name] = key;
      }
      nodeMap[key] = {
        key,
        id: w.id,
        name: w.data.w_name,
        kind: 'world',
        x: cx + (R + 150) * Math.cos(a),
        y: cy + (R + 150) * Math.sin(a),
        r: 30
      };
    });
  }

  const edges: GraphEdge[] = [];

  // 1. Character <-> Character relations
  chars.forEach((c) => {
    const rel = (c.data.relations || '')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    rel.forEach((line, idx) => {
      const p = line.split('|').map((s) => s.trim());
      if (p.length < 2) return;
      const targetKey = charIndex[p[0]];
      const srcKey = charIndex[c.data.name];
      if (!targetKey || !srcKey) return;
      const src = nodeMap[srcKey];
      const target = nodeMap[targetKey];
      let relType: GraphRelationType = 'other';
      if (/家人|父|母|兄|弟|姐|妹/.test(p[1])) relType = 'family';
      else if (/盟友|朋友|同伴|搭档/.test(p[1])) relType = 'ally';
      else if (/敌人|仇敌|宿敌|对手/.test(p[1])) relType = 'enemy';
      else if (/恋人|爱|情侣/.test(p[1])) relType = 'love';

      edges.push({
        id: `rel_${c.id}_${idx}`,
        sourceKey: srcKey,
        targetKey,
        sourceId: src.id,
        targetId: target.id,
        relType,
        label: `${c.data.name} — ${p[1]}${p[2] ? ' · ' + p[2] : ''}`,
        x1: src.x,
        y1: src.y,
        x2: target.x,
        y2: target.y
      });
    });
  });

  if (layer !== 'char-only') {
    // 2. Character -> Organization membership
    chars.forEach((c) => {
      if (!c.data || !c.data.orgs) return;
      c.data.orgs.split('\n').forEach((line, idx) => {
        const p = line.split('|').map((s) => s.trim());
        if (!p[0]) return;
        const orgKey = orgIndex[p[0]];
        const srcKey = charIndex[c.data.name];
        if (!orgKey || !srcKey) return;
        const src = nodeMap[srcKey];
        const target = nodeMap[orgKey];
        edges.push({
          id: `c_org_${c.id}_${idx}`,
          sourceKey: srcKey,
          targetKey: orgKey,
          sourceId: src.id,
          targetId: target.id,
          relType: 'member',
          label: `${c.data.name} → ${p[0]}${p[1] ? ' (' + p[1] + ')' : ''}`,
          x1: src.x,
          y1: src.y,
          x2: target.x,
          y2: target.y
        });
      });
    });

    // 3. Organization -> World affiliation
    orgs.forEach((o) => {
      if (!o.data || !o.data.o_world) return;
      const targetKey = worldIndex[o.data.o_world.trim()];
      const srcKey = orgIndex[o.data.o_name];
      if (!targetKey || !srcKey) return;
      const src = nodeMap[srcKey];
      const target = nodeMap[targetKey];
      edges.push({
        id: `o_world_${o.id}`,
        sourceKey: srcKey,
        targetKey,
        sourceId: src.id,
        targetId: target.id,
        relType: 'world',
        label: `${o.data.o_name} ∈ ${o.data.o_world.trim()}`,
        x1: src.x,
        y1: src.y,
        x2: target.x,
        y2: target.y
      });
    });

    // 4. Organization <-> Organization allies & foes
    orgs.forEach((o) => {
      const srcKey = orgIndex[o.data.o_name];
      if (!srcKey) return;
      const src = nodeMap[srcKey];
      const addOrgRels = (rawStr: string | undefined, relType: 'ally' | 'enemy', tag: string) => {
        if (!rawStr) return;
        rawStr
          .split(/[、,，\n|]/)
          .map((s) => s.trim())
          .filter(Boolean)
          .forEach((targetName, idx) => {
            const targetKey = orgIndex[targetName];
            if (!targetKey || targetKey === srcKey) return;
            const target = nodeMap[targetKey];
            edges.push({
              id: `o_${relType}_${o.id}_${idx}`,
              sourceKey: srcKey,
              targetKey,
              sourceId: src.id,
              targetId: target.id,
              relType,
              label: `${o.data.o_name} — ${tag} · ${targetName}`,
              x1: src.x,
              y1: src.y,
              x2: target.x,
              y2: target.y
            });
          });
      };
      addOrgRels(o.data.o_allies, 'ally', '盟友');
      addOrgRels(o.data.o_foes, 'enemy', '敌对');
    });

    // 5. Character -> World affiliation
    chars.forEach((c) => {
      if (!c.data || !c.data.world) return;
      const targetKey = worldIndex[c.data.world.trim()];
      const srcKey = charIndex[c.data.name];
      if (!targetKey || !srcKey) return;
      const src = nodeMap[srcKey];
      const target = nodeMap[targetKey];
      edges.push({
        id: `c_world_${c.id}`,
        sourceKey: srcKey,
        targetKey,
        sourceId: src.id,
        targetId: target.id,
        relType: 'world',
        label: `${c.data.name} ∈ ${c.data.world.trim()}`,
        x1: src.x,
        y1: src.y,
        x2: target.x,
        y2: target.y
      });
    });
  }

  return {
    width,
    height,
    nodes: Object.values(nodeMap),
    edges,
    nodeMap
  };
}
