// Header status + refresh controls (spec §4.3 / §5.3).
// Honest about what it does: it re-fetches the catalog from the API on an
// interval. The backend collector already samples reachability live (TCP +
// ICMP every 120s) and writes online/last; this button just re-pulls that
// data — it doesn't fake metrics. detail.metrics/services remain manual.

import { useEffect, useRef, useState } from "react";
import { useCatalog } from "../CatalogContext";
import { prefs, type PollInterval } from "../lib/prefs";

const MS: Record<PollInterval, number> = { off: 0, "30s": 30_000, "5m": 300_000 };

function fmtTime(d: Date | null): string {
  if (!d) return "—";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function RefreshControls() {
  const { meta, lastSync, refreshing, syncError, refresh } = useCatalog();
  const [interval, setInterval_] = useState<PollInterval>(() => prefs.poll.get());
  const savedRefresh = useRef(refresh);
  useEffect(() => {
    savedRefresh.current = refresh;
  });

  const [flashKey, setFlashKey] = useState(0);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (lastSync) setFlashKey((k) => k + 1);
  }, [lastSync]);

  useEffect(() => {
    prefs.poll.set(interval);
    if (interval === "off") return;
    const id = window.setInterval(() => void savedRefresh.current(), MS[interval]);
    return () => window.clearInterval(id);
  }, [interval]);

  return (
    <>
      <span>
        up <b style={{ color: "var(--amber)" }}>{meta.online}</b>/{meta.total}
      </span>
      <select
        className="sel-interval"
        aria-label="auto-refresh interval"
        value={interval}
        onChange={(e) => setInterval_(e.target.value as PollInterval)}
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
        <span key={flashKey} className="flash" title="last catalog sync">
          synced {fmtTime(lastSync)}
        </span>
      )}
      <button
        className="btn"
        onClick={() => void refresh()}
        disabled={refreshing}
        title="re-fetch catalog now"
        aria-label="refresh data"
      >
        <span className={refreshing ? "spin" : ""} style={{ display: "inline-block" }}>
          ⟳
        </span>{" "}
        refresh
      </button>
    </>
  );
}
