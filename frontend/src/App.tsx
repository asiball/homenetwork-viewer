// App root: catalog data provider + router + toast host.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "./api";
import type { Cable, Device, Meta, Switch } from "./types";
import { CatalogContext, type CatalogValue } from "./CatalogContext";
import { ErrorBoundary } from "./components/ErrorBoundary";

const EMPTY_META: Meta = { total: 0, online: 0, offline: 0, updated_at: null };
// Shared empty arrays so the "no data yet" fallbacks keep a stable identity
// across renders (a fresh `[]` each render would defeat downstream memoisation).
const EMPTY_DEVICES: Device[] = [];
const EMPTY_SWITCHES: Switch[] = [];
const EMPTY_CABLES: Cable[] = [];

// How long a success toast stays before auto-dismissing (error toasts are
// sticky so the user can read/act on them). Named so it isn't a bare literal.
const OK_TOAST_MS = 3200;

interface CatalogData {
  devices: Device[];
  switches: Switch[];
  cables: Cable[];
  meta: Meta;
}

async function fetchCatalog(): Promise<CatalogData> {
  const [devices, switches, cables, meta] = await Promise.all([
    api.devices(),
    api.switches(),
    api.cables(),
    api.meta(),
  ]);
  return { devices, switches, cables, meta };
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : "failed to reach API";
}

export default function App() {
  const location = useLocation();
  // One query owns the whole catalog. react-query dedupes concurrent refetches
  // (so the old poll-vs-click race can't land responses out of order), keeps the
  // previous data on a background-refetch failure (so a poll error never blanks
  // a working session), and tracks loading / fetching / error / updated-at for
  // us — replacing the hand-rolled state machine and cancellation flags (#159).
  const catalog = useQuery({ queryKey: ["catalog"], queryFn: fetchCatalog });

  // Best-effort client IP so the UI can tag "this device". Never blocks or
  // errors the catalog; the value is static for a session.
  const whoami = useQuery({
    queryKey: ["whoami"],
    queryFn: () => api.whoami(),
    retry: false,
    staleTime: Infinity,
  });

  // Toasts stack instead of overwriting (#166): rapid notifies (e.g. a copy
  // confirmation landing on a save success) no longer clobber each other. Each
  // gets its own id + auto-dismiss timer; the stack is capped so a burst can't
  // grow without bound.
  const [toasts, setToasts] = useState<{ id: number; msg: string; kind: "ok" | "err" }[]>([]);
  const nextToastId = useRef(0);
  const toastTimers = useRef<Map<number, number>>(new Map());

  const dismissToast = useCallback((id: number) => {
    setToasts((ts) => ts.filter((t) => t.id !== id));
    const h = toastTimers.current.get(id);
    if (h !== undefined) {
      window.clearTimeout(h);
      toastTimers.current.delete(id);
    }
  }, []);

  const notify = useCallback(
    (message: string, kind: "ok" | "err" = "ok") => {
      const id = nextToastId.current++;
      // Keep at most the 4 most recent so a flood can't fill the screen.
      setToasts((ts) => [...ts, { id, msg: message, kind }].slice(-4));
      if (kind === "ok") {
        toastTimers.current.set(
          id,
          window.setTimeout(() => dismissToast(id), OK_TOAST_MS)
        );
      }
    },
    [dismissToast]
  );

  useEffect(() => {
    const timers = toastTimers.current;
    return () => timers.forEach((h) => window.clearTimeout(h));
  }, []);

  const devices = catalog.data?.devices ?? EMPTY_DEVICES;
  const switches = catalog.data?.switches ?? EMPTY_SWITCHES;
  const cables = catalog.data?.cables ?? EMPTY_CABLES;
  const meta = catalog.data?.meta ?? EMPTY_META;

  // `loading` gates the full-screen spinner: only the very first load (no data
  // yet). `refreshing` is a background re-fetch, which must never blank a view.
  const loading = catalog.isLoading;
  const refreshing = catalog.isFetching && !catalog.isLoading;
  // A query error with no data is a boot failure (full-screen); with data it's a
  // background sync failure (non-blocking warning) — the #152 distinction, now
  // structural rather than hand-managed.
  const bootError = catalog.isError && !catalog.data ? errMsg(catalog.error) : null;
  const syncError = catalog.isError && catalog.data ? errMsg(catalog.error) : null;
  // Memoise on the numeric timestamp: a fresh Date object every render would make
  // RefreshControls' lastSync effect fire on every render (it pulses on change).
  const lastSync = useMemo(
    () => (catalog.dataUpdatedAt ? new Date(catalog.dataUpdatedAt) : null),
    [catalog.dataUpdatedAt]
  );

  const refresh = useCallback(async () => {
    await catalog.refetch();
  }, [catalog]);

  const clientIp = whoami.data?.ip ?? null;
  const selfId = useMemo(
    () => (clientIp ? (devices.find((d) => d.ip === clientIp)?.id ?? null) : null),
    [clientIp, devices]
  );

  // First load, nothing yet.
  if (loading && devices.length === 0 && !bootError) {
    return (
      <div className="center-screen">
        <div className="big">HOMENET / NOC</div>
        <div>loading catalog…</div>
      </div>
    );
  }

  if (bootError && devices.length === 0) {
    return (
      <div className="center-screen">
        <div className="big">HOMENET / NOC</div>
        <div>couldn't load catalog</div>
        <div style={{ color: "var(--err)" }}>{bootError}</div>
        <button className="f-btn" onClick={() => void refresh()}>
          retry
        </button>
      </div>
    );
  }

  const value: CatalogValue = {
    devices,
    switches,
    cables,
    meta,
    selfId,
    lastSync,
    loading,
    refreshing,
    syncError,
    refresh,
    notify,
  };

  return (
    <CatalogContext.Provider value={value}>
      <ErrorBoundary resetKey={location.pathname}>
        <Outlet />
      </ErrorBoundary>
      {toasts.length > 0 && (
        <div className="toast-stack">
          {toasts.map((t) => (
            <div
              key={t.id}
              className={`toast ${t.kind === "err" ? "err" : ""}`}
              role={t.kind === "err" ? "alert" : "status"}
              aria-live={t.kind === "err" ? "assertive" : "polite"}
            >
              <span>{t.msg}</span>
              <button
                className="toast-close"
                onClick={() => dismissToast(t.id)}
                aria-label="閉じる"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </CatalogContext.Provider>
  );
}
