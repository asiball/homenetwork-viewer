// Header status + refresh controls (spec §4.3 / §5.3).
// Honest about what it does: it re-fetches the catalog from the API on an
// interval. Live ARP/ping scanning is the v1.1 collector (not wired yet), so
// this polls the data source rather than faking metrics.

import { useCatalog } from "../App";

function fmtTime(d: Date | null): string {
  if (!d) return "—";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function RefreshControls() {
  const { meta, lastSync, loading, refresh, pollInterval, setPollInterval } = useCatalog();

  return (
    <>
      <span>
        up <b style={{ color: "var(--amber)" }}>{meta.online}</b>/{meta.total}
      </span>
      <select
        className="sel-interval"
        aria-label="auto-refresh interval"
        value={pollInterval}
        onChange={(e) => setPollInterval(e.target.value as "off" | "30s" | "5m")}
        title="auto-refresh interval"
      >
        <option value="off">poll · off</option>
        <option value="30s">poll · 30s</option>
        <option value="5m">poll · 5m</option>
      </select>
      <span title="last catalog sync">synced {fmtTime(lastSync)}</span>
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
