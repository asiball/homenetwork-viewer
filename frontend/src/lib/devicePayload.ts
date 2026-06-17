// Form <-> device-payload mapping for the add/edit view (EditView), extracted
// here so the delicate "empty field -> send null to clear" semantics can be
// unit-tested without rendering the form (issue #124). DeviceWrite's null
// semantics (types.ts) are what the PUT merge relies on, so they deserve a
// test that pins them down.

import type {
  Conn,
  Device,
  DeviceDetail,
  DeviceWrite,
  Group,
  HwInfo,
  Ownership,
} from "../types";

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

// Build the API payload from the form. `existing` (edit mode) is spread first so
// auto-collected fields the form never touches (last, uptime, idx, …) survive;
// emptied optional fields are sent as `null` so the PUT merge clears them.
export function buildPayload(
  form: FormState,
  existing: Device | undefined,
  mode: "add" | "edit",
  id: string,
): DeviceWrite {
  const own: Ownership = {};
  if (form.manufacturer.trim()) own.manufacturer = form.manufacturer.trim();
  if (form.model.trim()) own.model = form.model.trim();
  if (form.location.trim()) own.location = form.location.trim();
  if (form.purchased.trim()) own.purchased = form.purchased.trim();
  if (form.price.trim()) own.price = form.price.trim();
  if (form.warranty.trim()) own.warranty = form.warranty.trim();
  const tags = form.tags
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  if (tags.length) own.tags = tags;
  const ownHasAny = Object.keys(own).length > 0;

  // Preserve auto-collected detail blocks on edit; ownership is form-owned.
  // When the user empties ownership, send `own: null` so the backend clears it
  // (and keeps the other detail blocks) rather than silently retaining it.
  let detail: DeviceDetail | undefined = existing?.detail
    ? { ...existing.detail }
    : undefined;
  if (ownHasAny) {
    detail = { ...(detail ?? {}), own };
  } else if (detail && detail.own) {
    detail = { ...detail, own: null };
  }

  // Merge user-entered hw fields into the detail.hw block, preserving any
  // auto-collected fields (cpu_full, arch, mem_full, chassis, bios).
  const hw: HwInfo = {};
  if (form.motherboard.trim()) hw.motherboard = form.motherboard.trim();
  const gpus = [form.gpu1, form.gpu2].map((s) => s.trim()).filter(Boolean);
  if (gpus.length) hw.gpu = gpus;
  const drives = [form.storeDrive1, form.storeDrive2].map((s) => s.trim()).filter(Boolean);
  if (drives.length) hw.storage_drives = drives;
  if (Object.keys(hw).length) {
    detail = { ...(detail ?? {}), hw: { ...(detail?.hw ?? {}), ...hw } };
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
