// Add / edit device form (spec v1.1 §2: /add, /d/:id/edit).
// Edits the user-owned fields (§4.2); preserves any auto-collected detail
// blocks (net/hw/metrics/services/storage/hist7) untouched on update.

import { type ReactNode, useMemo, useState, useRef, useEffect } from "react";
import { Link, useNavigate, useParams, useBlocker, useLocation, type Location } from "react-router-dom";
import { ConfirmModal } from "../components/ConfirmModal";
import { Spinner } from "../components/Spinner";
import { useCatalog } from "../CatalogContext";
import { Shell } from "../components/Shell";
import { DeviceNotFound, ViewFooter } from "../components/ViewChrome";
import { ApiError, api } from "../api";
import {
  BUILD_ACTIONS,
  type BuildEvent,
  CONN_OPTIONS,
  type Conn,
  GROUP_ORDER,
  type Group,
  PART_CATEGORIES,
  PART_STATUSES,
  type Part,
  TYPE_OPTIONS,
} from "../types";
import { ID_RE, IPV4_RE, kebabId, MAC_RE, suggestFreeIp } from "../lib/helpers";
import {
  buildPayload,
  cloneForm,
  emptyForm,
  formFromDevice,
  type FormState,
} from "../lib/devicePayload";

function Field(props: {
  id: string;
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  full?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`f-field ${props.full ? "full" : ""} ${props.error ? "bad" : ""}`}>
      <label htmlFor={props.id} aria-required={props.required || undefined}>
        {props.label}
        {props.required && <span className="req">*</span>}
      </label>
      {props.children}
      {props.hint && !props.error && <span className="hint">{props.hint}</span>}
      {props.error && <span className="err" id={`${props.id}-err`}>{props.error}</span>}
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

  // "Clone this device" (#121): DetailView navigates to /add with the source id
  // in router state; we prefill the form from it. Only meaningful in add mode.
  const location = useLocation();
  const cloneFromId =
    mode === "add" ? (location.state as { clone?: string } | null)?.clone : undefined;

  const cloneSrc = cloneFromId ? devices.find((d) => d.id === cloneFromId) : undefined;

  function makeInitialForm(): FormState {
    if (existing) return formFromDevice(existing);
    return cloneSrc ? cloneForm(cloneSrc) : emptyForm();
  }
  // Parts carry over when cloning (same build), but build history doesn't — it
  // belongs to the physical unit (#97).
  function makeInitialParts(): Part[] {
    return (existing ?? cloneSrc)?.detail?.parts?.map((p) => ({ ...p })) ?? [];
  }
  function makeInitialEvents(): BuildEvent[] {
    return existing?.detail?.build_events?.map((e) => ({ ...e })) ?? [];
  }

  const [form, setForm] = useState<FormState>(makeInitialForm);
  const [parts, setParts] = useState<Part[]>(makeInitialParts);
  const [buildEvents, setBuildEvents] = useState<BuildEvent[]>(makeInitialEvents);
  const [idTouched, setIdTouched] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitErr, setSubmitErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Reset the form when the route switches to a different device id (browser
  // back/forward or a hand-edited URL between two edit pages keeps this same
  // component instance, so the useState initializer would otherwise hold the
  // previous device). React's "adjust state during render" pattern.
  const [loadedId, setLoadedId] = useState(id);
  const initialForm = useRef<FormState>(makeInitialForm());
  // Snapshot of the full editable state (form + parts + events) at load, so the
  // unsaved-changes guard also fires when only parts/build history changed (#97).
  const initialSnapshot = useRef<string>(
    JSON.stringify({ form: makeInitialForm(), parts: makeInitialParts(), buildEvents: makeInitialEvents() }),
  );

  if (id !== loadedId) {
    setLoadedId(id);
    const newForm = makeInitialForm();
    const newParts = makeInitialParts();
    const newEvents = makeInitialEvents();
    setForm(newForm);
    setParts(newParts);
    setBuildEvents(newEvents);
    // eslint-disable-next-line react-hooks/refs
    initialForm.current = newForm;
    // eslint-disable-next-line react-hooks/refs
    initialSnapshot.current = JSON.stringify({ form: newForm, parts: newParts, buildEvents: newEvents });
    setIdTouched(false);
    setErrors({});
    setSubmitErr(null);
  }

  // eslint-disable-next-line react-hooks/refs
  const isDirty = JSON.stringify({ form, parts, buildEvents }) !== initialSnapshot.current;
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

  // Live duplicate detection: which *other* device already uses the typed ip /
  // mac. Lets us warn while the user types instead of only after the backend
  // rejects the save with a 409 (#121). The device being edited is excluded.
  const selfId = mode === "edit" ? id : null;
  const ipDupName = useMemo(() => {
    const ip = form.ip.trim();
    if (!ip) return null;
    const hit = devices.find((d) => d.id !== selfId && d.ip === ip);
    return hit ? hit.name || hit.id : null;
  }, [devices, form.ip, selfId]);
  const macDupName = useMemo(() => {
    const mac = form.mac.trim().toUpperCase();
    if (!mac) return null;
    const hit = devices.find((d) => d.id !== selfId && (d.mac || "").toUpperCase() === mac);
    return hit ? hit.name || hit.id : null;
  }, [devices, form.mac, selfId]);

  // OUI → manufacturer suggestion: the first 24+ bits of a MAC identify the
  // vendor via the bundled IEEE table. We look it up (debounced) as the user
  // types and offer it as a one-click fill for the manufacturer field — never
  // auto-overwriting what they typed (#107). Randomized phone MACs aren't in
  // the table, so they quietly yield no suggestion.
  const [ouiVendor, setOuiVendor] = useState<string | null>(null);
  const macHex = form.mac.replace(/[^0-9a-fA-F]/g, "");
  useEffect(() => {
    let ignore = false;
    // All setState happens inside the (async) timeout so the lookup is
    // debounced and we never set state synchronously during the effect.
    const t = setTimeout(() => {
      if (macHex.length < 6) {
        if (!ignore) setOuiVendor(null);
        return;
      }
      api
        .oui(macHex)
        .then((r) => {
          if (!ignore) setOuiVendor(r.manufacturer);
        })
        .catch(() => {
          if (!ignore) setOuiVendor(null);
        });
    }, 300);
    return () => {
      ignore = true;
      clearTimeout(t);
    };
  }, [macHex]);
  // Hide the suggestion once the manufacturer field already holds it.
  const showOuiSuggestion = !!ouiVendor && form.manufacturer.trim() !== ouiVendor;

  // Smallest free IP in the home /24, offered while adding a device so the
  // user doesn't have to hunt for an unused address (#121). Only when adding
  // and the field is still empty — never nag once they've typed something.
  const freeIp = useMemo(() => (mode === "add" ? suggestFreeIp(devices) : null), [mode, devices]);
  const showFreeIp = mode === "add" && !form.ip.trim() && !!freeIp;

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

  // ── parts / build-history editing (#97) ──
  function addPart() {
    setParts((ps) => [...ps, { id: "", category: "other", model: "", status: "active" }]);
  }
  function updatePart(i: number, patch: Partial<Part>) {
    setParts((ps) => ps.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  }
  function removePart(i: number) {
    setParts((ps) => ps.filter((_, j) => j !== i));
  }
  function addEvent() {
    setBuildEvents((es) => [...es, { date: "", action: "add", part_id: "", note: null }]);
  }
  function updateEvent(i: number, patch: Partial<BuildEvent>) {
    setBuildEvents((es) => es.map((e, j) => (j === i ? { ...e, ...patch } : e)));
  }
  function removeEvent(i: number) {
    setBuildEvents((es) => es.filter((_, j) => j !== i));
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
    else if (ipDupName) e.ip = `IP は既に "${ipDupName}" が使用中です`;
    if (!MAC_RE.test(form.mac)) e.mac = "MAC 形式（XX:XX:XX:XX:XX:XX）";
    else if (macDupName) e.mac = `MAC は既に "${macDupName}" が使用中です`;
    if (!form.type.trim()) e.type = "必須です";
    if (form.url.trim() && !/^https?:\/\//.test(form.url.trim())) {
      e.url = "http:// または https:// で始まるURL";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }


  async function onSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    setSubmitErr(null);
    if (!validate()) {
      requestAnimationFrame(() => {
        const firstBad = document.querySelector<HTMLElement>('.f-field.bad input, .f-field.bad select');
        firstBad?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        firstBad?.focus();
      });
      return;
    }
    const payload = buildPayload(form, existing, mode, id, parts, buildEvents);
    setBusy(true);
    try {
      if (mode === "add") await api.create(payload);
      else await api.update(id, payload);
      // 保存済み → dirty 解除（form + parts + events のスナップショットを更新）
      initialSnapshot.current = JSON.stringify({ form, parts, buildEvents });
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
    initialSnapshot.current = JSON.stringify({ form, parts, buildEvents }); // 削除確定後の遷移で離脱ガードを出さない
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
      return <Spinner />;
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
              <Field id="f-id" label="id" required={mode === "add"} error={errors.id} hint="kebab-case · 不変">
                <input
                  id="f-id"
                  value={form.id}
                  readOnly={mode === "edit"}
                  aria-invalid={errors.id ? true : undefined}
                  aria-describedby={errors.id ? "f-id-err" : undefined}
                  onChange={(e) => {
                    setIdTouched(true);
                    set("id", e.target.value);
                  }}
                  placeholder="nas"
                />
              </Field>
              <Field id="f-name" label="display name" required error={errors.name}>
                <input
                  id="f-name"
                  value={form.name}
                  aria-invalid={errors.name ? true : undefined}
                  aria-describedby={errors.name ? "f-name-err" : undefined}
                  onChange={(e) => set("name", e.target.value)}
                  placeholder="NAS"
                />
              </Field>
              <Field id="f-host" label="host (fqdn)" required error={errors.host}>
                <input
                  id="f-host"
                  value={form.host}
                  aria-invalid={errors.host ? true : undefined}
                  aria-describedby={errors.host ? "f-host-err" : undefined}
                  onChange={(e) => set("host", e.target.value)}
                  placeholder="nas.home.arpa"
                />
              </Field>
              <Field
                id="f-ip"
                label="ipv4"
                required
                error={errors.ip}
                hint={ipDupName ? `⚠ "${ipDupName}" が使用中` : undefined}
              >
                <input
                  id="f-ip"
                  value={form.ip}
                  aria-invalid={errors.ip ? true : undefined}
                  aria-describedby={errors.ip ? "f-ip-err" : undefined}
                  onChange={(e) => set("ip", e.target.value)}
                  placeholder="192.168.1.10"
                />
                {showFreeIp && (
                  <span className="oui-suggest">
                    free: {freeIp}
                    <button type="button" className="oui-apply" onClick={() => freeIp && set("ip", freeIp)}>
                      use
                    </button>
                  </span>
                )}
              </Field>
              <Field
                id="f-mac"
                label="mac"
                required
                error={errors.mac}
                hint={macDupName ? `⚠ "${macDupName}" が使用中` : undefined}
              >
                <input
                  id="f-mac"
                  value={form.mac}
                  aria-invalid={errors.mac ? true : undefined}
                  aria-describedby={errors.mac ? "f-mac-err" : undefined}
                  onChange={(e) => set("mac", e.target.value)}
                  placeholder="AA:BB:CC:00:0A:11"
                />
                {showOuiSuggestion && (
                  <span className="oui-suggest">
                    OUI: {ouiVendor}
                    <button type="button" className="oui-apply" onClick={() => ouiVendor && set("manufacturer", ouiVendor)}>
                      use as manufacturer
                    </button>
                  </span>
                )}
              </Field>
              <Field id="f-type" label="type" required error={errors.type} hint="アイコン・分類に使用">
                <input
                  id="f-type"
                  value={form.type}
                  list="type-options"
                  aria-invalid={errors.type ? true : undefined}
                  aria-describedby={errors.type ? "f-type-err" : undefined}
                  onChange={(e) => set("type", e.target.value)}
                  placeholder="nas"
                />
                <datalist id="type-options">
                  {TYPE_OPTIONS.map((t) => (
                    <option key={t} value={t} />
                  ))}
                </datalist>
              </Field>
              <Field id="f-group" label="group" required>
                <select id="f-group" value={form.group} onChange={(e) => set("group", e.target.value as Group)}>
                  {GROUP_ORDER.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              </Field>
              <Field id="f-online" label="status">
                <label className="f-check">
                  <input
                    id="f-online"
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
              <Field id="f-conn" label="connection">
                <select id="f-conn" value={form.conn} onChange={(e) => set("conn", e.target.value as Conn | "")}>
                  <option value="">— (未設定)</option>
                  {CONN_OPTIONS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </Field>
              <Field id="f-ring" label="topology ring" hint="マップ上の配置層">
                <select id="f-ring" value={form.ring} onChange={(e) => set("ring", e.target.value as FormState["ring"])}>
                  <option value="2">2 · leaf (末端 / 既定)</option>
                  <option value="1">1 · infrastructure</option>
                  <option value="0">0 · gateway</option>
                  <option value="">— (未設定)</option>
                </select>
              </Field>
              <Field
                id="f-url"
                label="web ui (url)"
                full
                error={errors.url}
                hint="管理画面のURL · 詳細/サマリーから別タブで開けます"
              >
                <input
                  id="f-url"
                  value={form.url}
                  aria-invalid={errors.url ? true : undefined}
                  aria-describedby={errors.url ? "f-url-err" : undefined}
                  onChange={(e) => set("url", e.target.value)}
                  placeholder="http://192.168.1.1"
                />
              </Field>
            </div>
          </div>

          <div className="f-section" data-title="hardware (summary)" aria-label="hardware (summary)">
            <div className="f-grid">
              <Field id="f-cpu" label="cpu">
                <input id="f-cpu" value={form.cpu} onChange={(e) => set("cpu", e.target.value)} placeholder="Intel N100 4C / 4T" />
              </Field>
              <Field id="f-mem" label="memory">
                <input id="f-mem" value={form.mem} onChange={(e) => set("mem", e.target.value)} placeholder="16 GB DDR4" />
              </Field>
              <Field id="f-arch" label="arch">
                <input id="f-arch" value={form.arch} onChange={(e) => set("arch", e.target.value)} placeholder="x86_64 / arm64" />
              </Field>
              <Field id="f-chassis" label="chassis">
                <input id="f-chassis" value={form.chassis} onChange={(e) => set("chassis", e.target.value)} placeholder="Mini-ITX / Tower" />
              </Field>
              <Field id="f-bios" label="firmware / bios">
                <input id="f-bios" value={form.bios} onChange={(e) => set("bios", e.target.value)} placeholder="AMI 2.21" />
              </Field>
              <Field id="f-motherboard" label="motherboard">
                <input id="f-motherboard" value={form.motherboard} onChange={(e) => set("motherboard", e.target.value)} placeholder="ASUS B550M" />
              </Field>
              <Field id="f-gpu1" label="gpu 1">
                <input id="f-gpu1" value={form.gpu1} onChange={(e) => set("gpu1", e.target.value)} placeholder="NVIDIA RTX 4070" />
              </Field>
              <Field id="f-gpu2" label="gpu 2">
                <input id="f-gpu2" value={form.gpu2} onChange={(e) => set("gpu2", e.target.value)} placeholder="(optional)" />
              </Field>
              <Field id="f-storage" label="storage" full>
                <input
                  id="f-storage"
                  value={form.storage}
                  onChange={(e) => set("storage", e.target.value)}
                  placeholder="4 × 8 TB HDD · RAID5"
                />
              </Field>
              <Field id="f-drive1" label="drive 1">
                <input id="f-drive1" value={form.storeDrive1} onChange={(e) => set("storeDrive1", e.target.value)} placeholder="Samsung 990 Pro 2TB NVMe" />
              </Field>
              <Field id="f-drive2" label="drive 2">
                <input id="f-drive2" value={form.storeDrive2} onChange={(e) => set("storeDrive2", e.target.value)} placeholder="WD Red 4TB HDD" />
              </Field>
            </div>
          </div>

          <div className="f-section" data-title="ownership" aria-label="ownership">
            <div className="f-grid">
              <Field id="f-manufacturer" label="manufacturer">
                <input id="f-manufacturer" value={form.manufacturer} onChange={(e) => set("manufacturer", e.target.value)} />
              </Field>
              <Field id="f-model" label="model">
                <input id="f-model" value={form.model} onChange={(e) => set("model", e.target.value)} />
              </Field>
              <Field id="f-location" label="location">
                <input id="f-location" value={form.location} onChange={(e) => set("location", e.target.value)} />
              </Field>
              <Field id="f-purchased" label="purchased">
                <input id="f-purchased" value={form.purchased} onChange={(e) => set("purchased", e.target.value)} placeholder="2023-08-15" />
              </Field>
              <Field id="f-price" label="price">
                <input id="f-price" value={form.price} onChange={(e) => set("price", e.target.value)} placeholder="¥98,000" />
              </Field>
              <Field id="f-warranty" label="warranty">
                <input id="f-warranty" value={form.warranty} onChange={(e) => set("warranty", e.target.value)} />
              </Field>
              <Field id="f-tags" label="tags" full hint="カンマ区切り（例 always-on, backup, critical）">
                <input id="f-tags" value={form.tags} onChange={(e) => set("tags", e.target.value)} placeholder="always-on, critical" />
              </Field>
            </div>
          </div>

          <div className="f-section" data-title="build / parts" aria-label="build / parts">
            <div className="parts-edit">
              {parts.length === 0 && <div className="hint">部品単位で購入日・価格・保証・状態を管理（自作PC向け · 任意）</div>}
              {parts.map((p, i) => (
                <div className="part-row" key={i}>
                  <select aria-label="category" value={p.category} onChange={(e) => updatePart(i, { category: e.target.value as Part["category"] })}>
                    {PART_CATEGORIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                  <input aria-label="part id" value={p.id} onChange={(e) => updatePart(i, { id: e.target.value })} placeholder="id (例 gpu-1)" />
                  <input aria-label="model" value={p.model} onChange={(e) => updatePart(i, { model: e.target.value })} placeholder="model" />
                  <input aria-label="serial" value={p.serial ?? ""} onChange={(e) => updatePart(i, { serial: e.target.value || null })} placeholder="serial" />
                  <input aria-label="purchased" value={p.purchased ?? ""} onChange={(e) => updatePart(i, { purchased: e.target.value || null })} placeholder="purchased YYYY-MM-DD" />
                  <input aria-label="price (jpy)" inputMode="numeric" value={p.price_jpy ?? ""} onChange={(e) => updatePart(i, { price_jpy: e.target.value.trim() === "" ? null : Number(e.target.value) })} placeholder="price ¥" />
                  <input aria-label="warranty until" value={p.warranty_until ?? ""} onChange={(e) => updatePart(i, { warranty_until: e.target.value || null })} placeholder="warranty YYYY-MM-DD" />
                  <select aria-label="status" value={p.status} onChange={(e) => updatePart(i, { status: e.target.value as Part["status"] })}>
                    {PART_STATUSES.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                  <button type="button" className="row-del" aria-label="remove part" onClick={() => removePart(i)}>✕</button>
                </div>
              ))}
              <button type="button" className="f-btn ghost row-add" onClick={addPart}>+ add part</button>

              {buildEvents.length > 0 && <div className="hint build-hint">構成変更履歴</div>}
              {buildEvents.map((ev, i) => (
                <div className="event-row" key={i}>
                  <input aria-label="event date" value={ev.date} onChange={(e) => updateEvent(i, { date: e.target.value })} placeholder="date YYYY-MM-DD" />
                  <select aria-label="action" value={ev.action} onChange={(e) => updateEvent(i, { action: e.target.value as BuildEvent["action"] })}>
                    {BUILD_ACTIONS.map((a) => (
                      <option key={a} value={a}>{a}</option>
                    ))}
                  </select>
                  <select aria-label="part" value={ev.part_id} onChange={(e) => updateEvent(i, { part_id: e.target.value })}>
                    <option value="">— part —</option>
                    {parts.filter((p) => p.id.trim()).map((p) => (
                      <option key={p.id} value={p.id}>{p.id}</option>
                    ))}
                  </select>
                  <input aria-label="note" value={ev.note ?? ""} onChange={(e) => updateEvent(i, { note: e.target.value || null })} placeholder="note" />
                  <button type="button" className="row-del" aria-label="remove event" onClick={() => removeEvent(i)}>✕</button>
                </div>
              ))}
              <button type="button" className="f-btn ghost row-add" onClick={addEvent} disabled={parts.filter((p) => p.id.trim()).length === 0}>+ add build event</button>
            </div>
          </div>

          <div className="f-section" data-title="notes" aria-label="notes">
            <div className="f-grid">
              <Field id="f-notes" label="notes" full>
                <textarea id="f-notes" value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={5} />
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
