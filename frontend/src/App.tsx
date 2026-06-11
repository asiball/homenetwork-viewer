// App root: catalog data provider + router + toast host.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { api } from "./api";
import type { Cable, Device, Meta, Switch } from "./types";
import { HomeView } from "./views/HomeView";
import { DetailView } from "./views/DetailView";
import { EditView } from "./views/EditView";

interface CatalogValue {
  devices: Device[];
  switches: Switch[];
  cables: Cable[];
  meta: Meta;
  /** id of the catalog device whose IP matches the browser's client IP. */
  selfId: string | null;
  lastSync: Date | null;
  loading: boolean;
  syncError: string | null;
  refresh: () => Promise<void>;
  notify: (message: string, kind?: "ok" | "err") => void;
}

const CatalogContext = createContext<CatalogValue | null>(null);

export function useCatalog(): CatalogValue {
  const ctx = useContext(CatalogContext);
  if (!ctx) throw new Error("useCatalog must be used within <App>");
  return ctx;
}

const EMPTY_META: Meta = { total: 0, online: 0, offline: 0, updated_at: null };

export default function App() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [switches, setSwitches] = useState<Switch[]>([]);
  const [cables, setCables] = useState<Cable[]>([]);
  const [meta, setMeta] = useState<Meta>(EMPTY_META);
  const [clientIp, setClientIp] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);
  const [bootError, setBootError] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  const [toast, setToast] = useState<{ msg: string; kind: "ok" | "err" } | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);

  const notify = useCallback((message: string, kind: "ok" | "err" = "ok") => {
    setToast({ msg: message, kind });
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 3200);
  }, []);

  // Lightweight refresh: devices + meta only (switches/cables are static).
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [d, m] = await Promise.all([api.devices(), api.meta()]);
      setDevices(d);
      setMeta(m);
      setLastSync(new Date());
      setBootError(null);
      setSyncError(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "failed to reach API";
      setBootError(msg);
      setSyncError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

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
    syncError,
    refresh,
    notify,
  };

  return (
    <CatalogContext.Provider value={value}>
      <Routes>
        <Route path="/" element={<HomeView />} />
        <Route path="/d/:id" element={<DetailView />} />
        <Route path="/d/:id/edit" element={<EditView mode="edit" />} />
        <Route path="/add" element={<EditView mode="add" />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {toast && <div className={`toast ${toast.kind === "err" ? "err" : ""}`}>{toast.msg}</div>}
    </CatalogContext.Provider>
  );
}
