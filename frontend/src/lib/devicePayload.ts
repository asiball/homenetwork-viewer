// Form <-> device-payload mapping for the add/edit view (EditView), extracted
// here so the delicate "empty field -> send null to clear" semantics can be
// unit-tested without rendering the form (issue #124). DeviceWrite's null
// semantics (types.ts) are what the PUT merge relies on, so they deserve a
// test that pins them down.

import type {
  BuildEvent,
  Conn,
  Device,
  DeviceDetail,
  DeviceWrite,
  Group,
  HwInfo,
  Ownership,
  Part,
} from "../types";
import { kebabId } from "./helpers";

export interface FormState {
  id: string;
  name: string;
  host: string;
  ip: string;
  mac: string;
  group: Group;
  type: string;
  online: boolean;
  conn: Conn | "";
  ring: "" | "0" | "1" | "2";
  url: string;
  cpu: string;
  mem: string;
  storage: string;
  arch: string;
  chassis: string;
  bios: string;
  motherboard: string;
  gpu1: string;
  gpu2: string;
  storeDrive1: string;
  storeDrive2: string;
  manufacturer: string;
  model: string;
  location: string;
  purchased: string;
  price: string;
  warranty: string;
  tags: string;
  notes: string;
}

export function emptyForm(): FormState {
  return {
    id: "",
    name: "",
    host: "",
    ip: "",
    mac: "",
    group: "Computer",
    type: "",
    online: true,
    conn: "",
    ring: "2",
    url: "",
    cpu: "",
    mem: "",
    storage: "",
    arch: "",
    chassis: "",
    bios: "",
    motherboard: "",
    gpu1: "",
    gpu2: "",
    storeDrive1: "",
    storeDrive2: "",
    manufacturer: "",
    model: "",
    location: "",
    purchased: "",
    price: "",
    warranty: "",
    tags: "",
    notes: "",
  };
}

export function formFromDevice(d: Device): FormState {
  const own = d.detail?.own ?? {};
  return {
    id: d.id,
    name: d.name,
    host: d.host,
    ip: d.ip,
    mac: d.mac,
    group: d.group,
    type: d.type,
    online: d.online,
    conn: d.conn ?? "",
    ring: d.ring != null ? (String(d.ring) as "0" | "1" | "2") : "",
    url: d.url ?? "",
    cpu: d.cpu ?? "",
    mem: d.mem ?? "",
    storage: d.storage ?? "",
    arch: d.detail?.hw?.arch ?? "",
    chassis: d.detail?.hw?.chassis ?? "",
    bios: d.detail?.hw?.bios ?? "",
    motherboard: d.detail?.hw?.motherboard ?? "",
    gpu1: d.detail?.hw?.gpu?.[0] ?? "",
    gpu2: d.detail?.hw?.gpu?.[1] ?? "",
    storeDrive1: d.detail?.hw?.storage_drives?.[0] ?? "",
    storeDrive2: d.detail?.hw?.storage_drives?.[1] ?? "",
    manufacturer: own.manufacturer ?? "",
    model: own.model ?? "",
    location: own.location ?? "",
    purchased: own.purchased ?? "",
    price: own.price ?? "",
    warranty: own.warranty ?? "",
    tags: (own.tags ?? []).join(", "),
    notes: d.notes ?? "",
  };
}

// Prefill an "add" form from an existing device so similar units (e.g. four
// identical cameras) don't start from a blank form (issue #121). The shared
// "template" fields (type, group, hardware, ownership, notes…) carry over; the
// per-unit identity that must be unique is cleared: id (re-suggested from the
// name), ip and mac (backend-enforced unique → would block save) start empty,
// and the device is assumed not-yet-online. The name gets a " copy" suffix.
export function cloneForm(d: Device): FormState {
  const name = `${d.name} copy`;
  return {
    ...formFromDevice(d),
    id: kebabId(name),
    name,
    ip: "",
    mac: "",
    online: false,
  };
}

// Build the API payload from the form. `existing` (edit mode) is spread first so
// auto-collected fields the form never touches (last, uptime, idx, …) survive;
// emptied optional fields are sent as `null` so the PUT merge clears them.
export function buildPayload(
  form: FormState,
  existing: Device | undefined,
  mode: "add" | "edit",
  id: string,
  parts?: Part[],
  buildEvents?: BuildEvent[]
): DeviceWrite {
  // Ownership is fully form-owned. Emptied fields are sent as explicit null
  // (not omitted) because the backend deep-merges nested dicts — omitting a key
  // would let the stored value survive, so clearing a field in the form would
  // silently not clear it. (issue #122 review)
  const tags = form.tags
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  const own: Ownership = {
    manufacturer: form.manufacturer.trim() || null,
    model: form.model.trim() || null,
    location: form.location.trim() || null,
    purchased: form.purchased.trim() || null,
    price: form.price.trim() || null,
    warranty: form.warranty.trim() || null,
    tags: tags.length ? tags : null,
  };
  const ownHasAny = Object.values(own).some((v) => v != null);

  let detail: DeviceDetail | undefined = existing?.detail ? { ...existing.detail } : undefined;
  // Include the block (with explicit nulls) whenever the form has data or the
  // stored device already had ownership to clear; otherwise leave it absent.
  if (ownHasAny || detail?.own) {
    detail = { ...(detail ?? {}), own: ownHasAny ? own : null };
  }

  // Hardware fields the form owns. cpu_full / mem_full are auto-collected and
  // NOT in this object, so the merge below preserves them; the form-owned
  // fields carry explicit null when emptied so the backend clears them rather
  // than keeping a stale value. (issue #122 review)
  const gpus = [form.gpu1, form.gpu2].map((s) => s.trim()).filter(Boolean);
  const drives = [form.storeDrive1, form.storeDrive2].map((s) => s.trim()).filter(Boolean);
  const formHw: HwInfo = {
    arch: form.arch.trim() || null,
    chassis: form.chassis.trim() || null,
    bios: form.bios.trim() || null,
    motherboard: form.motherboard.trim() || null,
    gpu: gpus.length ? gpus : null,
    storage_drives: drives.length ? drives : null,
  };
  const hwHasAny = Object.values(formHw).some((v) => v != null);
  if (hwHasAny || detail?.hw) {
    detail = { ...(detail ?? {}), hw: { ...(detail?.hw ?? {}), ...formHw } };
  }

  // Custom-PC parts / build history (#97). Drop rows the user left blank
  // (no id/model, or an event with no date/part). Emptied → explicit null so
  // the merge clears a previously-stored list.
  const cleanParts = (parts ?? []).filter((p) => p.id.trim() && p.model.trim());
  if (cleanParts.length || detail?.parts) {
    detail = { ...(detail ?? {}), parts: cleanParts.length ? cleanParts : null };
  }
  const cleanEvents = (buildEvents ?? []).filter((e) => e.date.trim() && e.part_id.trim());
  if (cleanEvents.length || detail?.build_events) {
    detail = { ...(detail ?? {}), build_events: cleanEvents.length ? cleanEvents : null };
  }

  const payload: DeviceWrite = {
    ...(existing ?? {}),
    id: mode === "edit" ? id : form.id,
    name: form.name.trim(),
    host: form.host.trim(),
    ip: form.ip.trim(),
    mac: form.mac.trim().toUpperCase(),
    group: form.group,
    type: form.type.trim(),
    online: form.online,
    conn: form.conn || null,
    ring: form.ring !== "" ? (Number(form.ring) as 0 | 1 | 2) : null,
    url: form.url.trim() || null,
    cpu: form.cpu.trim() || null,
    mem: form.mem.trim() || null,
    storage: form.storage.trim() || null,
    notes: form.notes.trim() ? form.notes : null,
    detail: detail ?? undefined,
  };
  return payload;
}
