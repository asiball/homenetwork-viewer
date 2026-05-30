// Lookup + formatting helpers, ported from the prototype's data.jsx.

import type { Cable, Device, Switch } from "../types";

export function countOnline(devs: Device[]): number {
  return devs.filter((d) => d.online).length;
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
