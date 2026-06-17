// App root: catalog data provider + router + toast host.

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Outlet } from "react-router-dom";
import { api } from "./api";
import type { Cable, Device, Meta, Switch } from "./types";
import { CatalogContext, type CatalogValue } from "./CatalogContext";
import { ErrorBoundary } from "./components/ErrorBoundary";

const EMPTY_META: Meta = { total: 0, online: 0, offline: 0, updated_at: null };

export default function App() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [switches, setSwitches] = useState<Switch[]>([]);
  const [cables, setCables] = useState<Cable[]>([]);
  const [meta, setMeta] = useState<Meta>(EMPTY_META);
  const [clientIp, setClientIp] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [bootError, setBootError] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  const [toast, setToast] = useState<{ msg: string; kind: "ok" | "err" } | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);

  const notify = useCallback((message: string, kind: "ok" | "err" = "ok") => {
    setToast({ msg: message, kind });
    window.clearTimeout(toastTimer.current);
    if (kind === "ok") {
      toastTimer.current = window.setTimeout(() => setToast(null), 3200);
    }
  }, []);

  useEffect(() => {
    return () => window.clearTimeout(toastTimer.current);
  }, []);

  // Lightweight refresh: devices + meta only, unless boot failed. Uses
  // `refreshing` (not `loading`) so a poll never collapses a detail/edit view
  // into the full-screen spinner.
  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      if (bootError) {
        const [d, s, c, m] = await Promise.all([
          api.devices(),
          api.switches(),
          api.cables(),
          api.meta(),
        ]);
        setDevices(d);
        setSwitches(s);
        setCables(c);
        setMeta(m);
      } else {
        const [d, m] = await Promise.all([api.devices(), api.meta()]);
        setDevices(d);
        setMeta(m);
      }
      setLastSync(new Date());
      setBootError(null);
      setSyncError(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "failed to reach API";
      setBootError(msg);
      setSyncError(msg);
    } finally {
      setRefreshing(false);
    }
  }, [bootError]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [d, s, c, m] = await Promise.all([
          api.devices(),
          api.switches(),
          api.cables(),
          api.meta(),
        ]);
        if (cancelled) return;
        setDevices(d);
        setSwitches(s);
        setCables(c);
        setMeta(m);
        setLastSync(new Date());
        setBootError(null);
      } catch (e) {
        if (!cancelled) {
          setBootError(e instanceof Error ? e.message : "failed to reach API");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    // Best-effort: lets the UI tag "this device". Never blocks the catalog.
    api
      .whoami()
      .then((w) => {
        if (!cancelled) setClientIp(w.ip);
      })
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const selfId = useMemo(
    () => (clientIp ? (devices.find((d) => d.ip === clientIp)?.id ?? null) : null),
    [clientIp, devices],
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
      <ErrorBoundary>
        <Outlet />
      </ErrorBoundary>
      {toast && (
        <div
          className={`toast ${toast.kind === "err" ? "err" : ""}`}
          role={toast.kind === "err" ? "alert" : "status"}
          aria-live={toast.kind === "err" ? "assertive" : "polite"}
        >
          <span>{toast.msg}</span>
          <button className="toast-close" onClick={() => setToast(null)} aria-label="閉じる">×</button>
        </div>
      )}
    </CatalogContext.Provider>
  );
}
