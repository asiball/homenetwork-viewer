/* eslint-disable react-refresh/only-export-components */
// App root: catalog data provider + router + toast host.

import { createContext, useCallback, useContext, useRef, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import type { Cable, Device, Meta, Switch } from "./types";
import { HomeView } from "./views/HomeView";
import { DetailView } from "./views/DetailView";
import { EditView } from "./views/EditView";

type PollInterval = "off" | "30s" | "5m";
const POLL_MS: Record<PollInterval, number> = { off: 0, "30s": 30_000, "5m": 300_000 };
const POLL_KEY = "homenet.poll";

interface CatalogValue {
  devices: Device[];
  switches: Switch[];
  cables: Cable[];
  meta: Meta;
  lastSync: Date | null;
  loading: boolean;
  refresh: () => Promise<void>;
  notify: (message: string, kind?: "ok" | "err") => void;
  pollInterval: PollInterval;
  setPollInterval: (interval: PollInterval) => void;
}

const CatalogContext = createContext<CatalogValue | null>(null);

export function useCatalog(): CatalogValue {
  const ctx = useContext(CatalogContext);
  if (!ctx) throw new Error("useCatalog must be used within <App>");
  return ctx;
}

const EMPTY_META: Meta = { total: 0, online: 0, offline: 0, updated_at: null };

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppInner />
    </QueryClientProvider>
  );
}

function AppInner() {
  const qc = useQueryClient();
  const [pollInterval, setPollIntervalState] = useState<PollInterval>(
    () => (localStorage.getItem(POLL_KEY) as PollInterval) || "5m"
  );

  const setPollInterval = useCallback((val: PollInterval) => {
    localStorage.setItem(POLL_KEY, val);
    setPollIntervalState(val);
  }, []);

  const intervalMs = POLL_MS[pollInterval];

  // Queries
  const {
    data: devices = [],
    error: devicesError,
    isLoading: devicesLoading,
    dataUpdatedAt: devicesUpdatedAt,
  } = useQuery({
    queryKey: ["devices"],
    queryFn: () => api.devices(),
    refetchInterval: intervalMs || false,
  });

  const {
    data: switches = [],
    error: switchesError,
    isLoading: switchesLoading,
  } = useQuery({
    queryKey: ["switches"],
    queryFn: () => api.switches(),
    staleTime: Infinity,
  });

  const {
    data: cables = [],
    error: cablesError,
    isLoading: cablesLoading,
  } = useQuery({
    queryKey: ["cables"],
    queryFn: () => api.cables(),
    staleTime: Infinity,
  });

  const {
    data: meta = EMPTY_META,
    error: metaError,
    isLoading: metaLoading,
  } = useQuery({
    queryKey: ["meta"],
    queryFn: () => api.meta(),
    refetchInterval: intervalMs || false,
  });

  const [toast, setToast] = useState<{ msg: string; kind: "ok" | "err" } | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);

  const notify = useCallback((message: string, kind: "ok" | "err" = "ok") => {
    setToast({ msg: message, kind });
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 3200);
  }, []);

  const refresh = useCallback(async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["devices"] }),
      qc.invalidateQueries({ queryKey: ["meta"] }),
    ]);
  }, [qc]);

  const loading = devicesLoading || switchesLoading || cablesLoading || metaLoading;

  const bootError =
    devicesError || switchesError || cablesError || metaError
      ? (devicesError || switchesError || cablesError || metaError)?.message ||
        "failed to load data"
      : null;

  const lastSync = devicesUpdatedAt ? new Date(devicesUpdatedAt) : null;

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
        <div>backend unreachable</div>
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
    lastSync,
    loading,
    refresh,
    notify,
    pollInterval,
    setPollInterval,
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
