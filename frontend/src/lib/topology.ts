// Topology layout calculators — radial + spine (spec §5.2) + wiring tree.
// Ported from the prototype variant-noc.jsx (computeRadial / computeSpine).
// Returns plain geometry; TopologyMap.tsx renders it.

import { GROUP_ORDER, type Device, type Group, type Switch } from "../types";

export const MAP_W = 800;
export const MAP_H = 560;

export type LayoutKind = "radial" | "spine" | "tree";

export interface LabelOffset {
  x: number;
  y: number;
  anchor: "start" | "middle" | "end";
  below?: boolean;
}

export interface Pos {
  x: number;
  y: number;
  labelOffset?: LabelOffset;
}

export interface Edge {
  from: string;
  to: string;
  off: boolean;
  /** When set, route orthogonally: H to bendX → V to the child row → H. */
  bendX?: number;
}

export interface SpineTap {
  cat: string;
  x: number;
  y: number;
  labelBelow: boolean;
}

/** Non-device infrastructure (switches/hubs) drawn on the wiring tree. */
export interface PseudoNode {
  id: string;
  x: number;
  y: number;
  label: string;
}

export type Deco =
  | { kind: "radial"; cx: number; cy: number; r1: number; r2: number }
  | { kind: "spine"; busY: number; startX: number; endX: number; taps: SpineTap[] }
  | { kind: "tree"; rowH: number; width: number; height: number };

export interface Layout {
  positions: Record<string, Pos>;
  edges: Edge[];
  deco: Deco;
  pseudo?: PseudoNode[];
}

// Polar → Cartesian. angle: 0=top, 90=right (clockwise).
function polar(angle: number, r: number, cx: number, cy: number) {
  const rad = (angle * Math.PI) / 180;
  return { x: cx + r * Math.sin(rad), y: cy - r * Math.cos(rad) };
}

function computeRadial(visible: Device[], compact: boolean): Layout {
  const cx = MAP_W / 2;
  const cy = MAP_H / 2 + 4;
  const r1 = compact ? 90 : 105;
  const r2 = compact ? 215 : 240;
  // Outer ring = everything that isn't the gateway (ring 0) or infra (ring 1),
  // including devices added with no ring set — so this matches the leaf branch
  // below and findIndex() always resolves (otherwise unset-ring nodes get -1
  // and land at a bogus angle).
  const leaves = visible.filter((d) => d.ring !== 0 && d.ring !== 1);
  const total = Math.max(1, leaves.length);
  const infra = visible.filter((d) => d.ring === 1);
  const positions: Record<string, Pos> = {};

  visible.forEach((d) => {
    if (d.ring === 0) {
      positions[d.id] = { x: cx, y: cy };
    } else if (d.ring === 1) {
      // 2 infra keep the classic top-right / top-left look; 3+ spread evenly,
      // and we key off list position (not d.idx) so unset idx never collides.
      const i = infra.findIndex((x) => x.id === d.id);
      const a =
        infra.length <= 2 ? (i === 0 ? 45 : 315) : (45 + i * (360 / infra.length)) % 360;
      const p = polar(a, r1, cx, cy);
      const out = polar(a, r1 + 16, cx, cy);
      let anchor: "start" | "middle" | "end" = "middle";
      if (out.x > cx + 4) anchor = "start";
      else if (out.x < cx - 4) anchor = "end";
      positions[d.id] = { ...p, labelOffset: { x: out.x, y: out.y, anchor } };
    } else {
      const idx = leaves.findIndex((x) => x.id === d.id);
      const a = (9 + idx * (360 / total)) % 360;
      const p = polar(a, r2, cx, cy);
      const out = polar(a, r2 + 14, cx, cy);
      let anchor: LabelOffset["anchor"] = "middle";
      if (out.x > cx + 4) anchor = "start";
      else if (out.x < cx - 4) anchor = "end";
      positions[d.id] = { ...p, labelOffset: { x: out.x, y: out.y, anchor } };
    }
  });

  const edges: Edge[] = visible
    .filter((d) => d.ring !== 0)
    .map((d) => ({ from: "gw", to: d.id, off: !d.online }));

  return { positions, edges, deco: { kind: "radial", cx, cy, r1, r2 } };
}

function computeSpine(visible: Device[], compact: boolean): Layout {
  const positions: Record<string, Pos> = {};
  const busY = MAP_H / 2;
  const startX = 100;
  const endX = MAP_W - 40;

  positions["gw"] = { x: startX, y: busY };

  const infra = visible.filter((d) => d.ring === 1);
  infra.forEach((d, i) => {
    // alternate above/below the bus with a growing offset so 3+ infra never overlap
    const above = i % 2 === 0;
    const y = busY + (above ? -1 : 1) * (55 + Math.floor(i / 2) * 40);
    const x = startX + 60;
    positions[d.id] = { x, y, labelOffset: { x: x + 14, y, anchor: "start" } };
  });

  const cats = GROUP_ORDER.filter(
    (g) => g !== "Infra" && visible.some((d) => d.group === g),
  );
  const catStart = startX + 150;
  const catSpacing = (endX - catStart) / Math.max(1, cats.length);
  const cellH = compact ? 24 : 28;
  const taps: SpineTap[] = [];

  cats.forEach((cat: Group, ci) => {
    const cx = catStart + (ci + 0.5) * catSpacing;
    const above = ci % 2 === 0;
    positions["__cat_" + cat] = { x: cx, y: busY };
    taps.push({ cat, x: cx, y: busY, labelBelow: above });
    const items = visible.filter((d) => d.group === cat);
    items.forEach((d, i) => {
      const offset = 40 + i * cellH;
      const y = above ? busY - offset : busY + offset;
      positions[d.id] = {
        x: cx,
        y,
        labelOffset: { x: cx + 12, y, anchor: "start" },
      };
    });
  });

  const edges: Edge[] = [];
  infra.forEach((d) => edges.push({ from: "gw", to: d.id, off: !d.online }));
  cats.forEach((cat) => {
    visible
      .filter((d) => d.group === cat)
      .forEach((d) => edges.push({ from: "__cat_" + cat, to: d.id, off: !d.online }));
  });

  return { positions, edges, deco: { kind: "spine", busY, startX, endX, taps } };
}

// ─── Wiring tree ────────────────────────────────────────────────────────────
// Physical topology from the switch/cable ledger: gateway → switches → ports,
// with Wi-Fi clients hanging off the access point. Falls back gracefully when
// the ledger is empty (everything attaches straight to the gateway).

function computeTree(visible: Device[], switches: Switch[], compact: boolean): Layout {
  const deviceIds = new Set(visible.map((d) => d.id));
  const root = visible.find((d) => d.ring === 0) ?? visible[0];
  if (!root) {
    return {
      positions: {},
      edges: [],
      deco: { kind: "tree", rowH: 24, width: MAP_W, height: MAP_H },
      pseudo: [],
    };
  }

  // Switch/hub entities that are not themselves catalog devices (e.g. dumb
  // switches) become pseudo nodes; ledger entries that double as devices
  // (a Hue bridge) are drawn as their device node.
  const pseudoSwitches = switches.filter((s) => !deviceIds.has(s.id));
  const pseudoIds = new Set(pseudoSwitches.map((s) => s.id));
  const known = (id: string) => deviceIds.has(id) || pseudoIds.has(id);

  // parent → children, child → placed (single parent, no cycles).
  const children = new Map<string, string[]>();
  const placed = new Set<string>([root.id]);
  const addChild = (parent: string, child: string) => {
    if (parent === child || placed.has(child) || !known(parent)) return;
    const list = children.get(parent) ?? [];
    if (!children.has(parent)) children.set(parent, list);
    list.push(child);
    placed.add(child);
  };

  // 1) Each switch hangs off whatever its uplink port names.
  for (const sw of switches) {
    if (!known(sw.id)) continue;
    for (const slot of Object.values(sw.portMap ?? {})) {
      if (slot && slot.role === "uplink" && known(slot.device)) {
        addChild(slot.device, sw.id);
        break;
      }
    }
  }
  // 2) Devices hang off the switch ports they are patched into.
  for (const sw of switches) {
    if (!known(sw.id)) continue;
    for (const slot of Object.values(sw.portMap ?? {})) {
      if (!slot || slot.role === "uplink") continue;
      if (known(slot.device)) addChild(sw.id, slot.device);
    }
  }
  // 2.5) A pseudo switch with children but no uplink joins the root directly,
  //      so its subtree is never orphaned off-canvas.
  for (const sw of pseudoSwitches) {
    if (!placed.has(sw.id) && (children.get(sw.id) ?? []).length > 0) {
      addChild(root.id, sw.id);
    }
  }
  // 3) Everything still unplaced: Wi-Fi devices hang off the access point,
  //    the rest straight off the gateway.
  const ap = visible.find((d) => d.type === "ap" && placed.has(d.id));
  for (const d of visible) {
    if (placed.has(d.id)) continue;
    const wifi = d.conn != null && d.conn.startsWith("Wi-Fi");
    addChild(wifi && ap ? ap.id : root.id, d.id);
  }

  // tree-command style: every node on its own row, root on the top row,
  // pre-order DFS so children sit directly under their parent.
  const order: string[] = [];
  const depthOf = new Map<string, number>();
  let maxDepth = 0;
  const walk = (id: string, depth: number) => {
    order.push(id);
    depthOf.set(id, depth);
    if (depth > maxDepth) maxDepth = depth;
    for (const k of children.get(id) ?? []) walk(k, depth + 1);
  };
  walk(root.id, 0);

  // Fixed scale: the tree renders at its natural size and the map pane
  // scrolls/pans instead of squeezing everything into the viewport.
  const top = 44;
  const bottom = 28;
  const left = 64;
  const rowH = compact ? 22 : 26;
  const indent = 95;
  const height = Math.max(MAP_H, top + order.length * rowH + bottom);
  const width = left + maxDepth * indent + 260; // room for labels on the right

  const positions: Record<string, Pos> = {};
  order.forEach((id, row) => {
    const x = left + (depthOf.get(id) ?? 0) * indent;
    const y = top + row * rowH + rowH / 2;
    // below:true doubles as "skip the .octet meta line" in TopologyMap —
    // the per-node octet row is what made the tree feel cluttered.
    positions[id] = {
      x,
      y,
      labelOffset: { x: x + 14, y, anchor: "start", below: true },
    };
  });

  const offline = new Map(visible.map((d) => [d.id, !d.online] as const));
  const edges: Edge[] = [];
  for (const [parent, kids] of children) {
    const px = positions[parent]?.x ?? left;
    for (const k of kids) {
      // Drop straight down the parent's column, then turn right into the
      // child — the same elbow the tree command draws with │ └─.
      edges.push({ from: parent, to: k, off: offline.get(k) ?? false, bendX: px });
    }
  }

  const pseudo: PseudoNode[] = pseudoSwitches
    .filter((s) => positions[s.id])
    .map((s) => ({ id: s.id, x: positions[s.id].x, y: positions[s.id].y, label: s.name }));

  return { positions, edges, deco: { kind: "tree", rowH, width, height }, pseudo };
}

export function computeLayout(
  layout: LayoutKind,
  visible: Device[],
  compact: boolean,
  switches: Switch[] = [],
): Layout {
  if (layout === "tree") return computeTree(visible, switches, compact);
  return layout === "spine"
    ? computeSpine(visible, compact)
    : computeRadial(visible, compact);
}
