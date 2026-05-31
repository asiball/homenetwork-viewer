// Thin API client. Same-origin /api (nginx proxy in prod, vite proxy in dev).

import type { Cable, Device, Meta, Switch } from "./types";

const BASE = "/api";

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
      const body = await res.json();
      // FastAPI returns {detail: "..."} or validation {detail: [{msg,loc}]}
      if (typeof body.detail === "string") detail = body.detail;
      else if (Array.isArray(body.detail)) {
        detail = body.detail
          .map((e: { loc?: unknown[]; msg?: string }) => {
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
  switches: () => req<Switch[]>("/switches"),
  cables: () => req<Cable[]>("/cables"),
  meta: () => req<Meta>("/meta"),
  create: (d: Device) => req<Device>("/devices", { method: "POST", body: JSON.stringify(d) }),
  update: (id: string, d: Device) =>
    req<Device>(`/devices/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(d),
    }),
  remove: (id: string) =>
    req<undefined>(`/devices/${encodeURIComponent(id)}`, { method: "DELETE" }),
};
