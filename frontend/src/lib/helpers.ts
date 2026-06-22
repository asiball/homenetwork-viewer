// Lookup + formatting helpers, ported from the prototype's data.jsx.

import {
  GROUP_ORDER,
  type Cable,
  type Device,
  type Group,
  type Part,
  type PortSlot,
  type Switch,
} from "../types";

export function countOnline(devs: Device[]): number {
  return devs.filter((d) => d.online).length;
}

export interface DeviceGroup {
  group: Group;
  items: Device[];
}

// Bucket devices by category in GROUP_ORDER, dropping empty groups. Single
// source of truth for both the sidebar order and the keyboard-nav order, so
// the list you see and the ↑/↓ traversal can never drift apart.
export function groupByOrder(devices: Device[]): DeviceGroup[] {
  return GROUP_ORDER.map((group) => ({
    group,
    items: devices.filter((d) => d.group === group),
  })).filter((g) => g.items.length > 0);
}

// The same devices flattened into display order (for ↑/↓ keyboard navigation).
export function orderedByGroup(devices: Device[]): Device[] {
  return groupByOrder(devices).flatMap((g) => g.items);
}

// Find a cable whose end terminates at this device (to-end preferred).
export function cableForDevice(cables: Cable[], devId: string): Cable | null {
  return (
    cables.find((c) => c.toDev === devId) ??
    cables.find((c) => c.fromDev === devId) ??
    null
  );
}

// Find a switch/hub carrying this device on a downstream (non-uplink) port.
export function switchForDevice(
  switches: Switch[],
  devId: string,
): { sw: Switch; port: string } | null {
  for (const sw of switches) {
    for (const [port, slot] of Object.entries(sw.portMap || {})) {
      if (slot && slot.device === devId && slot.role !== "uplink") {
        // Keep the raw port key: portMap keys are arbitrary strings (e.g. an
        // SFP label like "sfp1"), so Number() would render "port NaN".
        return { sw, port };
      }
    }
  }
  return null;
}

// Compare two switch/hub port-map keys for display order. Numbered ports sort
// numerically (1, 2, …, 10 — not "1, 10, 2"); non-numeric labels (e.g. an SFP
// port "sfp1") sort after the numbers, lexically. Plain Number() would turn
// "sfp1" into NaN and scatter labelled ports unpredictably (#151).
export function comparePortKeys(a: string, b: string): number {
  const aNum = /^\d+$/.test(a);
  const bNum = /^\d+$/.test(b);
  if (aNum && bNum) return Number(a) - Number(b);
  if (aNum) return -1;
  if (bNum) return 1;
  return a.localeCompare(b);
}

export interface PortRow {
  port: string;
  slot: PortSlot | null;
}

// Build the ordered rows for a switch's port table:
//   • the numbered ports 1..total (so empty numbered ports still render as
//     "free"), where total = max(declared portCount, highest mapped number);
//   • unioned with any non-numeric labelled ports present in the map (e.g.
//     "sfp1"), which the old length-based loop dropped entirely (#151).
// Returns the rows plus used / free counts derived from the same set, so the
// header summary and the table can never disagree.
export function switchPortRows(sw: Switch): { rows: PortRow[]; used: number; free: number } {
  const portMap = sw.portMap ?? {};
  const entries = Object.entries(portMap);
  const maxNumeric = entries.reduce(
    (m, [k]) => (/^\d+$/.test(k) ? Math.max(m, Number(k)) : m),
    0,
  );
  const total = Math.max(sw.portCount ?? 0, maxNumeric);
  const numbered: PortRow[] = Array.from({ length: total }, (_, i) => {
    const port = String(i + 1);
    return { port, slot: portMap[port] ?? null };
  });
  // Anything not already covered by a numbered row (labelled ports, or oddly
  // formatted keys like "01") is appended so it is never silently dropped.
  const covered = new Set(numbered.map((r) => r.port));
  const extra: PortRow[] = entries
    .filter(([port]) => !covered.has(port))
    .map(([port, slot]) => ({ port, slot }))
    .sort((a, b) => comparePortKeys(a.port, b.port));
  const rows = [...numbered, ...extra];
  const used = rows.filter((r) => r.slot != null).length;
  return { rows, used, free: rows.length - used };
}

// Cable jacket colour → swatch (prototype palette, view-detail.jsx).
const CABLE_SWATCH: Record<string, string> = {
  gray: "#888c95",
  black: "#202225",
  white: "#e8e6df",
  blue: "#4f8ad6",
  red: "#cf5a4d",
  yellow: "#d8b34e",
  green: "#5fa56e",
  orange: "#d28148",
};
export function cableSwatch(color?: string | null): string {
  return (color && CABLE_SWATCH[color]) || "#5a606b";
}

// Single source of truth for device search. Matches the user's own words —
// identity fields plus the free text they typed in (notes, tags, ownership) —
// so a device can be found by the tag/note/maker the user actually wrote.
// Used by both the sidebar list and the map filter so they never drift.
export function matchesQuery(d: Device, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  const own = d.detail?.own;
  const haystack: (string | null | undefined)[] = [
    d.name, d.host, d.ip, d.mac, d.type, d.group, d.id, d.notes,
    own?.manufacturer, own?.model, own?.location,
    ...(own?.tags ?? []),
  ];
  return haystack.some((v) => v != null && v.toLowerCase().includes(needle));
}

// Format a reachability timestamp into a short relative string ("5m ago").
// The collector writes `last` as an ISO8601 instant (issue #84); older data or
// a hand-edited value like "just now" is not a date, so we show it verbatim
// rather than rendering "Invalid Date".
export function formatLast(last?: string | null): string {
  if (!last) return "—";
  const t = Date.parse(last);
  if (Number.isNaN(t)) return last; // legacy / hand-edited human string
  const secs = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(t).toLocaleDateString();
}

// Clamp a percentage to 0–100 so a corrupt or hand-edited value (pct: 150,
// pct: -5) can never blow out a CSS bar width (issue #88). Non-finite → 0.
export function clampPct(n: number | null | undefined): number {
  if (n == null || Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

// Stable colour per device group, for at-a-glance differentiation in the list
// (and, later, the map) — spec §3.1 wants type/group to be visually legible
// rather than every node looking identical (#120). Unknown groups fall back to
// a neutral grey.
const GROUP_COLORS: Record<string, string> = {
  Infra: "#4f8ad6",
  IoT: "#d8b34e",
  Media: "#b07cd0",
  Mobile: "#5fa56e",
  Computer: "#cf7a4d",
  Misc: "#8a8f99",
};
export function groupColor(group: string): string {
  return GROUP_COLORS[group] ?? "#8a8f99";
}

// Last octet of an IPv4 (".10"), used in the list + map labels.
export function lastOctet(ip: string): string {
  return ip.split(".").pop() ?? "";
}

// Compare two IPv4 strings for sorting. Each octet is parsed to a number with a
// 0 fallback for a missing / non-numeric part, so a malformed or non-IPv4 value
// sorts deterministically instead of scattering on NaN (#166).
export function compareIp(a: string, b: string): number {
  const octets = (ip: string) => {
    const parts = ip.split(".");
    return [0, 1, 2, 3].map((i) => {
      const n = Number(parts[i]);
      return Number.isFinite(n) ? n : 0;
    });
  };
  const ao = octets(a);
  const bo = octets(b);
  for (let i = 0; i < 4; i++) {
    if (ao[i] !== bo[i]) return ao[i] - bo[i];
  }
  return 0;
}

// "nas.home.arpa" → "nas"
export function shortHost(host: string): string {
  return host.split(".")[0];
}

// "192.168.1.1/24" or "192.168.1.10" → "192.168.1.0/24". Strips any CIDR suffix
// and zeroes the host octet so a gateway address renders as its /24 network.
// Falls back to the home-lab default for anything that isn't a dotted quad —
// previously a bare IP (no CIDR) slipped through the old regex and showed the
// host address as the "subnet" (#124).
const DEFAULT_SUBNET = "192.168.1.0/24";
function toSubnet24(ip: string): string {
  const octets = ip.split("/")[0].split(".");
  return octets.length === 4 ? `${octets[0]}.${octets[1]}.${octets[2]}.0/24` : DEFAULT_SUBNET;
}

export interface GatewayInfo {
  subnet: string;
  iface: string;
}

// Derive the network header info (subnet + interface) from the gateway device —
// the router (type "router") or ring-0 node. Single source for the HomeView
// breadcrumb and the topology map's network label, which previously each inlined
// this lookup (#124). Falls back to home-lab defaults when there is no gateway.
export function gatewayInfo(devices: Device[]): GatewayInfo {
  const gw = devices.find((d) => d.type === "router" || d.ring === 0);
  const ipv4 = gw?.detail?.net?.ipv4 ?? gw?.ip;
  return {
    subnet: ipv4 ? toSubnet24(ipv4) : DEFAULT_SUBNET,
    iface: gw?.host?.split(".")[0] || "br-lan",
  };
}

// Suggest the smallest free host address in the home /24 so adding a device
// doesn't require cross-checking an IP table by hand (issue #121, IPAM-lite).
//
// The subnet is inferred from existing devices: we take the most common
// first-three-octets (spec assumes a single /24). We then return the lowest
// unused host in 2..254, reserving .0 (network), .255 (broadcast) and .1
// (conventionally the gateway) so we never propose a structural address.
// Returns null when there are no devices to infer a subnet from, or the /24
// is full.
export function suggestFreeIp(devices: Device[]): string | null {
  const octets = (ip: string) => ip.split(".").map((n) => Number(n));
  const valid = devices
    .map((d) => octets(d.ip))
    .filter((o) => o.length === 4 && o.every((n) => Number.isInteger(n) && n >= 0 && n <= 255));
  if (valid.length === 0) return null;

  // Most common /24 prefix among existing devices.
  const counts = new Map<string, number>();
  for (const o of valid) {
    const prefix = `${o[0]}.${o[1]}.${o[2]}`;
    counts.set(prefix, (counts.get(prefix) ?? 0) + 1);
  }
  let prefix = "";
  let best = -1;
  for (const [p, c] of counts) {
    if (c > best) {
      best = c;
      prefix = p;
    }
  }

  const used = new Set(valid.filter((o) => `${o[0]}.${o[1]}.${o[2]}` === prefix).map((o) => o[3]));
  for (let host = 2; host <= 254; host++) {
    if (!used.has(host)) return `${prefix}.${host}`;
  }
  return null;
}

// ─── Custom-PC parts (#97) ──────────────────────────────────────────────────

// Sum of known part prices (¥). Parts with no price_jpy are skipped.
export function partsTotalJpy(parts: Part[] | null | undefined): number {
  return (parts ?? []).reduce((sum, p) => sum + (p.price_jpy ?? 0), 0);
}

// "¥98,000" — yen, thousands-separated, no decimals.
export function formatJpy(n: number): string {
  return `¥${Math.round(n).toLocaleString("en-US")}`;
}

export type WarrantyState = "expired" | "soon" | "ok";

// Warranty health for a YYYY-MM-DD date: expired (past), soon (≤30 days), or
// ok. Returns null when there's no/invalid date. `now` is injectable for tests.
export function warrantyState(
  until: string | null | undefined,
  now: number = Date.now(),
): WarrantyState | null {
  if (!until) return null;
  const t = Date.parse(until);
  if (Number.isNaN(t)) return null;
  const days = (t - now) / 86_400_000;
  if (days < 0) return "expired";
  if (days <= 30) return "soon";
  return "ok";
}

// Generate a kebab-case id suggestion from a free-text name.
export function kebabId(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  // Non-Latin names (e.g. Japanese) reduce to empty — fall back to a usable base.
  return slug.slice(0, 24).replace(/-+$/, "") || "device";
}

export const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const MAC_RE = /^[0-9A-Fa-f]{2}(:[0-9A-Fa-f]{2}){5}$/;
// Reject leading-zero octets (00, 08, .04) so the form matches Python's
// ipaddress.IPv4Address on the backend — otherwise the client says "valid"
// and the user gets a 422 instead of an inline error.
export const IPV4_RE =
  /^((25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9])\.){3}(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9])$/;
