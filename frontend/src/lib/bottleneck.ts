// Link-speed / bottleneck analysis over the existing catalog.
//
// Motivation (see the design discussion): when planning a LAN speed upgrade you
// need to know *where* the path is capped — a Cat5e patch on an otherwise 2.5G
// run, a 1G switch in front of a 2.5G NIC, etc. We derive each wired link's
// rated speed from data the catalog already holds — the cable category (`cat`),
// the device NIC (`conn`) and the switch `speed` — so there is no new persisted
// field and no migration: the analysis is a pure function of the catalog, run
// on demand from the UI button (like topology.ts computes the map).

import type { Cable, Conn, Device, Switch } from "../types";

// ─── Speed derivation ────────────────────────────────────────────────────────

// Cable category → rated Mbps. Cat6 only carries 10G on short (≤55 m) runs, but
// at typical home-run lengths we treat it as 10G-capable: the dominant real cap
// is then the NIC / switch port, which is exactly what we want to surface rather
// than hide behind a pessimistic cable rating.
const CAT_MBPS: Record<string, number> = {
  cat3: 10,
  cat5: 100,
  cat5e: 1000,
  cat6: 10000,
  cat6a: 10000,
  cat7: 10000,
  cat7a: 10000,
  cat8: 40000,
};

export function catToMbps(cat?: string | null): number | null {
  if (!cat) return null;
  // "Cat 6a", "CAT-5e", "cat6A" → "cat6a"
  const key = cat.toLowerCase().replace(/[\s._-]/g, "");
  return CAT_MBPS[key] ?? null;
}

// Wired NIC speeds only. Wi-Fi / "—" / unset are "unknown" for a wired path: we
// don't constrain the link by them (e.g. the gateway's conn is often "—").
const CONN_MBPS: Partial<Record<Conn, number>> = {
  "Wired 100M": 100,
  "Wired 1G": 1000,
  "Wired 2.5G": 2500,
};

export function connToMbps(conn?: Conn | null): number | null {
  if (!conn) return null;
  return CONN_MBPS[conn] ?? null;
}

// Parse a free-text switch speed: "1 Gbps", "100 Mbps", "2.5 Gbps", "10G", "—".
export function switchSpeedToMbps(speed?: string | null): number | null {
  if (!speed) return null;
  const m = speed.match(/([\d.]+)\s*(g|m)/i);
  if (!m) return null;
  const n = parseFloat(m[1]);
  if (!isFinite(n)) return null;
  return m[2].toLowerCase() === "g" ? Math.round(n * 1000) : Math.round(n);
}

// Human-readable speed: 2500 → "2.5G", 1000 → "1G", 100 → "100M", null → "?".
export function fmtMbps(mbps: number | null): string {
  if (mbps == null) return "?";
  if (mbps >= 1000) {
    const g = mbps / 1000;
    return (Number.isInteger(g) ? g.toString() : g.toFixed(1)) + "G";
  }
  return mbps + "M";
}

// ─── Node capability ─────────────────────────────────────────────────────────

interface NodeCap {
  mbps: number | null;
  label: string;
  kind: "device" | "switch" | "unknown";
}

function nodeCap(
  id: string,
  deviceMap: Map<string, Device>,
  switchMap: Map<string, Switch>
): NodeCap {
  // A switch/hub end is capped by the switch's port speed; a device end by its
  // NIC (`conn`). Switch takes priority for ids that are both (a Hue bridge).
  const sw = switchMap.get(id);
  if (sw) return { mbps: switchSpeedToMbps(sw.speed), label: sw.name, kind: "switch" };
  const d = deviceMap.get(id);
  if (d) return { mbps: connToMbps(d.conn), label: d.name, kind: "device" };
  return { mbps: null, label: id, kind: "unknown" };
}

// ─── Per-link analysis ───────────────────────────────────────────────────────

export type LimitedBy = "cable" | "from" | "to" | "balanced" | "unknown";

export interface LinkAnalysis {
  cableId: string;
  cat: string | null;
  fromId: string;
  fromLabel: string;
  toId: string;
  toLabel: string;
  cableMbps: number | null;
  fromMbps: number | null;
  toMbps: number | null;
  /** Effective link speed = the slowest known component. */
  linkMbps: number | null;
  limitedBy: LimitedBy;
  /** True when the cable is the sole cap below both endpoints — i.e. swapping
   *  the cable for a higher category would actually raise the link speed. */
  actionable: boolean;
  /** Labels of components whose speed couldn't be derived (so the verdict is
   *  "best effort" rather than wrong). */
  unknown: string[];
}

function analyzeLink(
  cable: Cable,
  deviceMap: Map<string, Device>,
  switchMap: Map<string, Switch>
): LinkAnalysis {
  const from = nodeCap(cable.fromDev, deviceMap, switchMap);
  const to = nodeCap(cable.toDev, deviceMap, switchMap);
  const cableMbps = catToMbps(cable.cat);

  const parts: { tag: "cable" | "from" | "to"; mbps: number | null; label: string }[] = [
    { tag: "cable", mbps: cableMbps, label: cable.cat ? `${cable.cat} cable` : "cable" },
    { tag: "from", mbps: from.mbps, label: from.label },
    { tag: "to", mbps: to.mbps, label: to.label },
  ];
  const known = parts.filter((p) => p.mbps != null) as {
    tag: "cable" | "from" | "to";
    mbps: number;
    label: string;
  }[];
  const unknown = parts.filter((p) => p.mbps == null).map((p) => p.label);

  const endpoints = [from.mbps, to.mbps].filter((x): x is number => x != null);
  const minEndpoint = endpoints.length ? Math.min(...endpoints) : null;
  // The cable is the actionable bottleneck only when it is strictly slower than
  // both endpoints could carry — then a better cable lifts the link.
  const actionable = cableMbps != null && minEndpoint != null && cableMbps < minEndpoint;

  let linkMbps: number | null = null;
  let limitedBy: LimitedBy = "unknown";
  if (known.length) {
    linkMbps = Math.min(...known.map((p) => p.mbps));
    if (actionable) {
      limitedBy = "cable";
    } else {
      const atMin = known.filter((p) => p.mbps === linkMbps).map((p) => p.tag);
      limitedBy = atMin.length === 1 ? atMin[0] : "balanced";
    }
  }

  return {
    cableId: cable.id,
    cat: cable.cat ?? null,
    fromId: cable.fromDev,
    fromLabel: from.label,
    toId: cable.toDev,
    toLabel: to.label,
    cableMbps,
    fromMbps: from.mbps,
    toMbps: to.mbps,
    linkMbps,
    limitedBy,
    actionable,
    unknown,
  };
}

// ─── Per-device path analysis ────────────────────────────────────────────────

export interface PathHop {
  cableId: string;
  linkMbps: number | null;
  fromLabel: string;
  toLabel: string;
}

export interface DevicePath {
  deviceId: string;
  deviceLabel: string;
  /** Slowest known hop on the wired path to the root (the effective ceiling). */
  effectiveMbps: number | null;
  hops: PathHop[];
  bottleneckCableId: string | null;
  /** A hop on the path had an underivable speed, so the ceiling is best-effort. */
  hasUnknown: boolean;
}

function pickRoot(devices: Device[]): Device | undefined {
  return (
    devices.find((d) => d.ring === 0) ?? devices.find((d) => d.type === "router") ?? devices[0]
  );
}

// ─── Report ──────────────────────────────────────────────────────────────────

export interface BottleneckReport {
  links: LinkAnalysis[];
  paths: DevicePath[];
  /** Number of links where a cable swap would raise the speed. */
  actionableCount: number;
  /** The single slowest known link speed across the LAN. */
  worstLinkMbps: number | null;
}

// ─── Map overlay helpers ─────────────────────────────────────────────────────

// Order-independent key for a link between two node ids, so a topology edge
// (parent→child) can find its cable regardless of which end the cable lists
// as `fromDev`.
export function pairKey(a: string, b: string): string {
  return a < b ? `${a} ${b}` : `${b} ${a}`;
}

// Index links by their endpoint pair, for the wiring-tree edge overlay.
export function linkIndexByPair(links: LinkAnalysis[]): Map<string, LinkAnalysis> {
  const map = new Map<string, LinkAnalysis>();
  for (const l of links) map.set(pairKey(l.fromId, l.toId), l);
  return map;
}

export type SpeedTier = "fast" | "med" | "slow" | "unknown";

// Coarse speed bucket for colouring an edge: 2.5G+ = fast, 1G = med,
// sub-1G = slow, underivable = unknown.
export function speedTier(mbps: number | null): SpeedTier {
  if (mbps == null) return "unknown";
  if (mbps >= 2500) return "fast";
  if (mbps >= 1000) return "med";
  return "slow";
}

// Sort key that pushes "unknown" (null) speeds to the end of a slowest-first list.
function bySpeedAsc(a: number | null, b: number | null): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return a - b;
}

export function analyzeBottlenecks(
  devices: Device[],
  switches: Switch[],
  cables: Cable[]
): BottleneckReport {
  const deviceMap = new Map(devices.map((d) => [d.id, d]));
  const switchMap = new Map(switches.map((s) => [s.id, s]));

  const links = cables.map((c) => analyzeLink(c, deviceMap, switchMap));
  const linkByCable = new Map(links.map((l) => [l.cableId, l]));

  // Build an undirected graph over the cable links, then BFS from the root so
  // each node gets a unique parent edge (the wired path is a tree in practice).
  const adj = new Map<string, { cableId: string; other: string }[]>();
  const addEdge = (node: string, cableId: string, other: string) => {
    const list = adj.get(node) ?? [];
    if (!adj.has(node)) adj.set(node, list);
    list.push({ cableId, other });
  };
  for (const c of cables) {
    if (c.fromDev === c.toDev) continue; // ignore self-loops
    addEdge(c.fromDev, c.id, c.toDev);
    addEdge(c.toDev, c.id, c.fromDev);
  }

  const root = pickRoot(devices);
  const parent = new Map<string, { cableId: string; parentId: string }>();
  if (root) {
    const seen = new Set<string>([root.id]);
    const queue: string[] = [root.id];
    for (let u = queue.shift(); u !== undefined; u = queue.shift()) {
      for (const e of adj.get(u) ?? []) {
        if (seen.has(e.other)) continue;
        seen.add(e.other);
        parent.set(e.other, { cableId: e.cableId, parentId: u });
        queue.push(e.other);
      }
    }
  }

  const paths: DevicePath[] = [];
  for (const d of devices) {
    if (root && d.id === root.id) continue; // the root has no path to itself
    if (!parent.has(d.id)) continue; // no wired path (e.g. a Wi-Fi-only client)

    const hops: PathHop[] = [];
    let cur = d.id;
    // Guard against a pathological cycle: the tree is acyclic, but cap the walk.
    const maxHops = devices.length + switches.length;
    for (
      let edge = parent.get(cur);
      edge !== undefined && hops.length <= maxHops;
      edge = parent.get(cur)
    ) {
      const { cableId, parentId } = edge;
      const link = linkByCable.get(cableId);
      if (link) {
        hops.push({
          cableId,
          linkMbps: link.linkMbps,
          fromLabel: link.fromLabel,
          toLabel: link.toLabel,
        });
      }
      cur = parentId;
    }

    const knownHops = hops.filter((h) => h.linkMbps != null) as (PathHop & {
      linkMbps: number;
    })[];
    const effectiveMbps = knownHops.length ? Math.min(...knownHops.map((h) => h.linkMbps)) : null;
    const bottleneck = knownHops.reduce<(PathHop & { linkMbps: number }) | null>(
      (worst, h) => (worst == null || h.linkMbps < worst.linkMbps ? h : worst),
      null
    );
    paths.push({
      deviceId: d.id,
      deviceLabel: d.name,
      effectiveMbps,
      hops,
      bottleneckCableId: bottleneck?.cableId ?? null,
      hasUnknown: hops.some((h) => h.linkMbps == null),
    });
  }

  links.sort((a, b) => bySpeedAsc(a.linkMbps, b.linkMbps));
  paths.sort((a, b) => bySpeedAsc(a.effectiveMbps, b.effectiveMbps));

  const knownLinkSpeeds = links.map((l) => l.linkMbps).filter((x): x is number => x != null);

  return {
    links,
    paths,
    actionableCount: links.filter((l) => l.actionable).length,
    worstLinkMbps: knownLinkSpeeds.length ? Math.min(...knownLinkSpeeds) : null,
  };
}
