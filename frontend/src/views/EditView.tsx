// Add / edit device form (spec v1.1 §2: /add, /d/:id/edit).
// Edits the user-owned fields (§4.2); preserves any auto-collected detail
// blocks (net/hw/metrics/services/storage/hist7) untouched on update.

import { type ReactNode, useMemo, useState, useRef, useEffect } from "react";
import { Link, useNavigate, useParams, useBlocker, type Location } from "react-router-dom";
import { ConfirmModal } from "../components/ConfirmModal";
import { useCatalog } from "../App";
import { Shell } from "../components/Shell";
import { DeviceNotFound, ViewFooter } from "../components/ViewChrome";
import { ApiError, api } from "../api";
import {
  CONN_OPTIONS,
  type Conn,
  type Device,
  type DeviceDetail,
  type DeviceWrite,
  GROUP_ORDER,
  type Group,
  type Ownership,
  TYPE_OPTIONS,
} from "../types";
import { ID_RE, IPV4_RE, kebabId, MAC_RE } from "../lib/helpers";

interface FormState {
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
  manufacturer: string;
  model: string;
  location: string;
  purchased: string;
  price: string;
  warranty: string;
  tags: string;
  notes: string;
}

function emptyForm(): FormState {
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

function formFromDevice(d: Device): FormState {
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

function Field(props: {
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  full?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`f-field ${props.full ? "full" : ""} ${props.error ? "bad" : ""}`}>
      <label>
        {props.label}
        {props.required && <span className="req">*</span>}
      </label>
      {props.children}
      {props.hint && !props.error && <span className="hint">{props.hint}</span>}
      {props.error && <span className="err">{props.error}</span>}
    </div>
  );
}

interface Props {
  mode: "add" | "edit";
}

export function EditView({ mode }: Props) {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { devices, refresh, notify, loading } = useCatalog();

  const existing = mode === "edit" ? devices.find((d) => d.id === id) : undefined;

  const [form, setForm] = useState<FormState>(() =>
    existing ? formFromDevice(existing) : emptyForm(),
  );
  const [idTouched, setIdTouched] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitErr, setSubmitErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Reset the form when the route switches to a different device id (browser
  // back/forward or a hand-edited URL between two edit pages keeps this same
  // component instance, so the useState initializer would otherwise hold the
  // previous device). React's "adjust state during render" pattern.
  const [loadedId, setLoadedId] = useState(id);
  const initialForm = useRef<FormState>(existing ? formFromDevice(existing) : emptyForm());

  if (id !== loadedId) {
    setLoadedId(id);
    const newForm = existing ? formFromDevice(existing) : emptyForm();
    setForm(newForm);
    initialForm.current = newForm;
    setIdTouched(false);
    setErrors({});
    setSubmitErr(null);
  }

  const isDirty = JSON.stringify(form) !== JSON.stringify(initialForm.current);
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }: { currentLocation: Location; nextLocation: Location }) =>
      isDirty && currentLocation.pathname !== nextLocation.pathname
  );

  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);

  const existingIds = useMemo(() => new Set(devices.map((d) => d.id)), [devices]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => {
      const next = { ...f, [key]: value };
      // Auto-suggest a kebab-case id from the name until the user edits id.
      if (mode === "add" && key === "name" && !idTouched) {
        next.id = kebabId(value as string);
      }
      return next;
    });
  }

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (mode === "add") {
      if (!ID_RE.test(form.id)) e.id = "kebab-case のみ（英小文字・数字・ハイフン）";
      else if (existingIds.has(form.id)) e.id = "この id は既に存在します";
    }
    if (!form.name.trim()) e.name = "必須です";
    if (!form.host.trim()) e.host = "必須です";
    if (!IPV4_RE.test(form.ip)) e.ip = "IPv4 形式（例 192.168.1.10）";
    if (!MAC_RE.test(form.mac)) e.mac = "MAC 形式（XX:XX:XX:XX:XX:XX）";
    if (!form.type.trim()) e.type = "必須です";
    if (form.url.trim() && !/^https?:\/\//.test(form.url.trim())) {
      e.url = "http:// または https:// で始まるURL";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function buildPayload(): DeviceWrite {
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

    // Spread the existing device first so fields the form doesn't edit
    // (last, uptime, idx, …) survive the save; then overlay the form values.
    // Emptied optional fields are sent as `null` (not undefined) so they reach
    // the API and the PUT merge clears them instead of keeping the old value.
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

  async function onSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    setSubmitErr(null);
    if (!validate()) return;
    const payload = buildPayload();
    setBusy(true);
    try {
      if (mode === "add") await api.create(payload);
      else await api.update(id, payload);
      initialForm.current = form; // 保存済み → dirty 解除 (FormState 同士で比較する)
      await refresh();
      notify(mode === "add" ? `added · ${payload.name}` : `saved · ${payload.name}`);
      navigate(`/d/${payload.id}`);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "保存に失敗しました";
      setSubmitErr(msg);
    } finally {
      setBusy(false);
    }
  }

  function onDelete() {
    if (!existing) return;
    setDeleteModalOpen(true);
  }

  async function performDelete() {
    if (!existing) return;
    setDeleteModalOpen(false);
    initialForm.current = form; // 削除確定後の遷移で離脱ガードを出さない
    setBusy(true);
    try {
      await api.remove(existing.id);
      await refresh();
      notify(`deleted · ${existing.name}`, "ok");
      navigate("/");
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "削除に失敗しました";
      setSubmitErr(msg);
      setBusy(false);
    }
  }

  // Edit mode but device not (yet) found. This guard must stay BELOW every
  // hook — an early return above them changes the hook count between renders
  // (React error #310).
  if (mode === "edit" && !existing) {
    if (loading) {
      return (
        <div className="center-screen">
          <div
            className="spin"
            style={{
              display: "inline-block",
              width: "16px",
              height: "16px",
              border: "2px solid var(--fg-faint)",
              borderTopColor: "var(--amber)",
              borderRadius: "50%",
              animation: "spin 1s linear infinite",
            }}
          />
          <div style={{ marginTop: 12 }}>読み込み中...</div>
        </div>
      );
    }
    return <DeviceNotFound devices={devices} id={id} />;
  }

  const footer = <ViewFooter view={mode === "add" ? "add" : "edit"} tail={mode === "add" ? "new device" : id} />;
  const backTo = mode === "edit" ? `/d/${id}` : "/";

  return (
    <Shell
      devices={devices}
      selectedId={existing?.id}
      onSelect={(did) => navigate(`/d/${did}`)}
      crumbs={
        <>
          <Link className="d-back" to={backTo}>← {mode === "edit" ? "detail" : "map"}</Link>
          &nbsp;<span>{mode === "add" ? "add device" : existing?.host}</span>
        </>
      }
      right={<span />}
      footer={footer}
    >
      <ConfirmModal
        open={deleteModalOpen}
        title="デバイスの削除"
        message={`「${existing?.name}」を削除します。よろしいですか？`}
        danger
        confirmLabel="削除"
        onConfirm={performDelete}
        onCancel={() => setDeleteModalOpen(false)}
      />
      <ConfirmModal
        open={blocker.state === "blocked"}
        title="未保存の変更"
        message="未保存の変更があります。このページを離れますか？"
        confirmLabel="離れる"
        cancelLabel="留まる"
        danger
        onConfirm={() => blocker.proceed?.()}
        onCancel={() => blocker.reset?.()}
      />
      <div className="f-main" id="main-content" tabIndex={-1}>
        <form className="f-form" onSubmit={onSubmit} noValidate>
          <div className="f-head">
            <div>
              <div className="eyebrow">{mode === "add" ? "new device" : `edit · ${id}`}</div>
              <div className="name">{form.name || (mode === "add" ? "untitled" : id)}</div>
            </div>
          </div>

          {submitErr && <div className="f-error">⚠ {submitErr}</div>}

          <div className="f-section" data-title="identity" aria-label="identity">
            <div className="f-grid">
              <Field label="id" required={mode === "add"} error={errors.id} hint="kebab-case · 不変">
                <input
                  value={form.id}
                  readOnly={mode === "edit"}
                  onChange={(e) => {
                    setIdTouched(true);
                    set("id", e.target.value);
                  }}
                  placeholder="nas"
                />
              </Field>
              <Field label="display name" required error={errors.name}>
                <input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="NAS" />
              </Field>
              <Field label="host (fqdn)" required error={errors.host}>
                <input value={form.host} onChange={(e) => set("host", e.target.value)} placeholder="nas.home.arpa" />
              </Field>
              <Field label="ipv4" required error={errors.ip}>
                <input value={form.ip} onChange={(e) => set("ip", e.target.value)} placeholder="192.168.1.10" />
              </Field>
              <Field label="mac" required error={errors.mac}>
                <input
                  value={form.mac}
                  onChange={(e) => set("mac", e.target.value)}
                  placeholder="AA:BB:CC:00:0A:11"
                />
              </Field>
              <Field label="type" required error={errors.type} hint="アイコン・分類に使用">
                <input
                  value={form.type}
                  list="type-options"
                  onChange={(e) => set("type", e.target.value)}
                  placeholder="nas"
                />
                <datalist id="type-options">
                  {TYPE_OPTIONS.map((t) => (
                    <option key={t} value={t} />
                  ))}
                </datalist>
              </Field>
              <Field label="group" required>
                <select value={form.group} onChange={(e) => set("group", e.target.value as Group)}>
                  {GROUP_ORDER.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="status">
                <label className="f-check">
                  <input
                    type="checkbox"
                    checked={form.online}
                    onChange={(e) => set("online", e.target.checked)}
                  />
                  online
                </label>
              </Field>
            </div>
          </div>

          <div className="f-section" data-title="placement & link" aria-label="placement & link">
            <div className="f-grid">
              <Field label="connection">
                <select value={form.conn} onChange={(e) => set("conn", e.target.value as Conn | "")}>
                  <option value="">— (未設定)</option>
                  {CONN_OPTIONS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="topology ring" hint="マップ上の配置層">
                <select value={form.ring} onChange={(e) => set("ring", e.target.value as FormState["ring"])}>
                  <option value="2">2 · leaf (末端 / 既定)</option>
                  <option value="1">1 · infrastructure</option>
                  <option value="0">0 · gateway</option>
                  <option value="">— (未設定)</option>
                </select>
              </Field>
              <Field
                label="web ui (url)"
                full
                error={errors.url}
                hint="管理画面のURL · 詳細/サマリーから別タブで開けます"
              >
                <input
                  value={form.url}
                  onChange={(e) => set("url", e.target.value)}
                  placeholder="http://192.168.1.1"
                />
              </Field>
            </div>
          </div>

          <div className="f-section" data-title="hardware (summary)" aria-label="hardware (summary)">
            <div className="f-grid">
              <Field label="cpu">
                <input value={form.cpu} onChange={(e) => set("cpu", e.target.value)} placeholder="Intel N100 4C / 4T" />
              </Field>
              <Field label="memory">
                <input value={form.mem} onChange={(e) => set("mem", e.target.value)} placeholder="16 GB DDR4" />
              </Field>
              <Field label="storage" full>
                <input
                  value={form.storage}
                  onChange={(e) => set("storage", e.target.value)}
                  placeholder="4 × 8 TB HDD · RAID5"
                />
              </Field>
            </div>
          </div>

          <div className="f-section" data-title="ownership" aria-label="ownership">
            <div className="f-grid">
              <Field label="manufacturer">
                <input value={form.manufacturer} onChange={(e) => set("manufacturer", e.target.value)} />
              </Field>
              <Field label="model">
                <input value={form.model} onChange={(e) => set("model", e.target.value)} />
              </Field>
              <Field label="location">
                <input value={form.location} onChange={(e) => set("location", e.target.value)} />
              </Field>
              <Field label="purchased">
                <input value={form.purchased} onChange={(e) => set("purchased", e.target.value)} placeholder="2023-08-15" />
              </Field>
              <Field label="price">
                <input value={form.price} onChange={(e) => set("price", e.target.value)} placeholder="¥98,000" />
              </Field>
              <Field label="warranty">
                <input value={form.warranty} onChange={(e) => set("warranty", e.target.value)} />
              </Field>
              <Field label="tags" full hint="カンマ区切り（例 always-on, backup, critical）">
                <input value={form.tags} onChange={(e) => set("tags", e.target.value)} placeholder="always-on, critical" />
              </Field>
            </div>
          </div>

          <div className="f-section" data-title="notes" aria-label="notes">
            <div className="f-grid">
              <Field label="notes" full>
                <textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={5} />
              </Field>
            </div>
          </div>

          <div className="f-actions">
            <button className="f-btn primary" type="submit" disabled={busy}>
              {busy ? "saving…" : mode === "add" ? "add device" : "save changes"}
            </button>
            <Link className="f-btn ghost" to={backTo}>
              cancel
            </Link>
            {mode === "edit" && (
              <button type="button" className="f-btn danger f-spacer" onClick={onDelete} disabled={busy}>
                delete
              </button>
            )}
          </div>
        </form>
      </div>
    </Shell>
  );
}
