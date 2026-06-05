// Header status + refresh controls (spec §4.3 / §5.3).
// Honest about what it does: it re-fetches the catalog from the API on an
// interval. Live ARP/ping scanning is the v1.1 collector (not wired yet), so
// this polls the data source rather than faking metrics.

import { useEffect, useRef, useState } from "react";
import { useCatalog } from "../App";

type Interval = "off" | "30s" | "5m";
const MS: Record<Interval, number> = { off: 0, "30s": 30_000, "5m": 300_000 };
const KEY = "homenet.poll";

function fmtTime(d: Date | null): string {
  if (!d) return "—";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function RefreshControls() {
  const { meta, lastSync, loading, syncError, refresh } = useCatalog();
  const [interval, setInterval_] = useState<Interval>(
    () => (localStorage.getItem(KEY) as Interval) || "5m",
  );
  const savedRefresh = useRef(refresh);
  savedRefresh.current = refresh;

  useEffect(() => {
    localStorage.setItem(KEY, interval);
    if (interval === "off") return;
    const id = window.setInterval(() => void savedRefresh.current(), MS[interval]);
    return () => window.clearInterval(id);
  }, [interval]);

  return (
    <>
      <span>
        up{" "}
        <b style={{ color: "var(--amber)" }}>{meta.online}</b>/{meta.total}
      </span>
      <select
        className="sel-interval"
        aria-label="auto-refresh interval"
        value={interval}
        onChange={(e) => setInterval_(e.target.value as Interval)}
        title="auto-refresh interval"
      >
        <option value="off">poll · off</option>
        <option value="30s">poll · 30s</option>
        <option value="5m">poll · 5m</option>
      </select>
      {syncError ? (
        <span title={syncError} style={{ color: "var(--err)" }}>
          ⚠ sync failed
        </span>
      ) : (
        <span title="last catalog sync">synced {fmtTime(lastSync)}</span>
      )}
      <button
        className="btn"
        onClick={() => void refresh()}
        disabled={loading}
        title="re-fetch catalog now"
      >
        <span className={loading ? "spin" : ""}>⟳</span> refresh
      </button>
    </>
  );
}
