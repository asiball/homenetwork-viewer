// Lookup + formatting helpers, ported from the prototype's data.jsx.

import { GROUP_ORDER, type Cable, type Device, type Group, type Switch } from "../types";

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
): { sw: Switch; port: number } | null {
  for (const sw of switches) {
    for (const [port, slot] of Object.entries(sw.portMap || {})) {
      if (slot && slot.device === devId && slot.role !== "uplink") {
        return { sw, port: Number(port) };
      }
    }
  }
  return null;
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

// Last octet of an IPv4 (".10"), used in the list + map labels.
export function lastOctet(ip: string): string {
  return ip.split(".").pop() ?? "";
}

// "nas.home.arpa" → "nas"
export function shortHost(host: string): string {
  return host.split(".")[0];
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
