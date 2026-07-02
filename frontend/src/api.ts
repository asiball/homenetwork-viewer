// Thin API client. Same-origin /api (nginx proxy in prod, vite proxy in dev).

import type { Cable, Device, DeviceWrite, Meta, ReachabilityHistory, Switch } from "./types";
import type { components } from "./types/api-schema";

const BASE = "/api";

// FastAPI error bodies, typed from the generated OpenAPI schema rather than a
// hand-rolled `any`: a plain `{detail: "..."}` or the 422 validation shape
// `{detail: [{loc, msg, ...}]}` (#158).
interface ErrorBody {
  detail?: string | components["schemas"]["ValidationError"][];
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body: ErrorBody = await res.json();
      // FastAPI returns {detail: "..."} or validation {detail: [{msg,loc}]}
      if (typeof body.detail === "string") detail = body.detail;
      else if (Array.isArray(body.detail)) {
        detail = body.detail
          .map((e) => {
            const field = Array.isArray(e.loc) ? e.loc.slice(1).join(".") : "";
            return field ? `${field}: ${e.msg}` : e.msg;
          })
          .join("; ");
      }
    } catch {
      /* keep statusText */
    }
    throw new ApiError(res.status, detail);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  devices: () => req<Device[]>("/devices"),
  device: (id: string) => req<Device>(`/devices/${encodeURIComponent(id)}`),
  reachability: (id: string, days = 7) =>
    req<ReachabilityHistory>(`/devices/${encodeURIComponent(id)}/reachability?days=${days}`),
  switches: () => req<Switch[]>("/switches"),
  cables: () => req<Cable[]>("/cables"),
  meta: () => req<Meta>("/meta"),
  whoami: () => req<{ ip: string | null }>("/whoami"),
  oui: (mac: string) => req<{ manufacturer: string | null }>(`/oui/${encodeURIComponent(mac)}`),
  create: (d: DeviceWrite) => req<Device>("/devices", { method: "POST", body: JSON.stringify(d) }),
  update: (id: string, d: DeviceWrite) =>
    req<Device>(`/devices/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(d),
    }),
  remove: async (id: string): Promise<void> => {
    await req<unknown>(`/devices/${encodeURIComponent(id)}`, { method: "DELETE" });
  },
  wake: (id: string) =>
    // X-Requested-With, same as importCatalog below: forces a CORS preflight
    // so a cross-site form can't silently trigger a magic packet. The backend
    // rejects POST /wake without this header.
    // req()'s own default headers are spread *before* init, so passing custom
    // headers here has to repeat Content-Type — a bare `init.headers` would
    // otherwise replace (not merge with) the default.
    req<{ status: string; mac: string }>(`/devices/${encodeURIComponent(id)}/wake`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
    }),
  export: () =>
    fetch(BASE + "/export").then(async (r) => {
      if (!r.ok) throw new Error(await r.text());
      return r.blob();
    }),
  importCatalog: async (file: File) => {
    const form = new FormData();
    form.append("file", file);
    // X-Requested-With makes this a non-simple CORS request (forces a preflight),
    // so a cross-site form can't silently POST a catalog replacement. The backend
    // rejects the import without this header.
    const res = await fetch(BASE + "/import", {
      method: "POST",
      body: form,
      headers: { "X-Requested-With": "XMLHttpRequest" },
    });
    if (!res.ok) {
      const body: ErrorBody = await res.json().catch(() => ({}));
      throw new Error(typeof body.detail === "string" ? body.detail : res.statusText);
    }
    return res.json() as Promise<{ devices: number; switches: number; cables: number }>;
  },
};
