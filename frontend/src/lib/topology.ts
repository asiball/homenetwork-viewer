// Topology layout calculators — radial + spine (spec §5.2).
// Ported from the prototype variant-noc.jsx (computeRadial / computeSpine).
// Returns plain geometry; TopologyMap.tsx renders it.

import { GROUP_ORDER, type Device, type Group } from "../types";

export const MAP_W = 800;
export const MAP_H = 560;

export type LayoutKind = "radial" | "spine";

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
}

export interface SpineTap {
  cat: string;
  x: number;
  y: number;
  labelBelow: boolean;
}

export type Deco =
  | { kind: "radial"; cx: number; cy: number; r1: number; r2: number }
  | { kind: "spine"; busY: number; startX: number; endX: number; taps: SpineTap[] };

export interface Layout {
  positions: Record<string, Pos>;
  edges: Edge[];
  deco: Deco;
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
  const leaves = visible.filter((d) => d.ring === 2);
  const total = Math.max(1, leaves.length);
  const positions: Record<string, Pos> = {};

  visible.forEach((d) => {
    if (d.ring === 0) {
      positions[d.id] = { x: cx, y: cy };
    } else if (d.ring === 1) {
      const a = d.idx === 0 ? 45 : 315;
      positions[d.id] = polar(a, r1, cx, cy);
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
    const y = busY + (i === 0 ? -55 : 55);
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

export function computeLayout(
  layout: LayoutKind,
  visible: Device[],
  compact: boolean,
): Layout {
  return layout === "spine"
    ? computeSpine(visible, compact)
    : computeRadial(visible, compact);
}
