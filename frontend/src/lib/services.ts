// Best-effort "open in browser" link for a scanned service. Extracted from
// DetailView so the HTTP-port heuristics are unit-testable (#183).

import type { ServiceRow } from "../types";

// Common non-standard ports that speak HTTP (dev servers, dashboards, Plex…).
const HTTPISH_PORTS = new Set([3000, 5000, 8080, 8081, 9090, 32400]);

export function serviceUrl(ip: string, s: ServiceRow): string | null {
  if (s.proto !== "tcp") return null;
  if (s.port === 443 || s.port === 8443) return `https://${ip}:${s.port}`;
  if (s.port === 80) return `http://${ip}`;
  if (HTTPISH_PORTS.has(s.port) || s.svc.toUpperCase().includes("HTTP")) {
    return `http://${ip}:${s.port}`;
  }
  return null;
}
