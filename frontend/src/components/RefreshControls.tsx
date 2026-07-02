// Header status + refresh controls (spec §4.3 / §5.3).
// The backend collector samples reachability on its own schedule (TCP + ICMP,
// meta.sweep_interval seconds) and writes online/last; the poll interval here
// only re-pulls that data. The ⟳ button additionally asks the collector for an
// immediate sweep (POST /api/scan, spec §5.6) before re-pulling — but it still
// doesn't fake metrics: detail.metrics/services remain manual.

import { useEffect, useRef, useState } from "react";
import { useCatalog } from "../CatalogContext";
import { api } from "../api";
import { prefs, type PollInterval } from "../lib/prefs";

const MS: Record<PollInterval, number> = { off: 0, "30s": 30_000, "5m": 300_000 };
// How long after triggering a scan we wait before re-pulling the catalog —
// long enough for the collector's immediate sweep to actually land (#review
// item 11).
const SCAN_FOLLOWUP_MS = 3000;

function fmtTime(d: Date | null): string {
  if (!d) return "—";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

// "next scan 4:32" / "scanning…" countdown to meta.next_sweep (spec §4.3).
function fmtCountdown(ms: number): string {
  const totalSec = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function RefreshControls() {
  const { meta, lastSync, refreshing, syncError, refresh, notify } = useCatalog();
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

  // ⟳ now triggers a real immediate reachability sweep (spec §5.6) instead of
  // just re-pulling whatever the catalog already had. `scanning` keeps the
  // spinner lit across the whole scan→wait→refetch sequence — react-query's
  // own `refreshing` only covers the two individual fetches, with a gap in
  // between that would otherwise make the spinner flicker off mid-sequence.
  const [scanning, setScanning] = useState(false);
  const scanTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(scanTimer.current), []);

  async function handleScan() {
    setScanning(true);
    try {
      await api.scan();
    } catch (e) {
      // The scan failing to *start* is worth a toast; a slow/late sweep isn't
      // — the delayed refresh below still runs either way.
      notify(e instanceof Error ? e.message : "scan failed to start", "err");
    }
    try {
      await refresh();
    } finally {
      window.clearTimeout(scanTimer.current);
      scanTimer.current = window.setTimeout(() => {
        void refresh().finally(() => setScanning(false));
      }, SCAN_FOLLOWUP_MS);
    }
  }

  // Live countdown to the collector's next scheduled sweep. Ticks locally
  // (cheap setInterval) between catalog refetches; a null last_sweep means the
  // collector has never run, so there's nothing meaningful to count down to.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const nextSweepLabel =
    meta.last_sweep && meta.next_sweep
      ? (() => {
          const remaining = Date.parse(meta.next_sweep) - now;
          return remaining > 0 ? `next scan ${fmtCountdown(remaining)}` : "scanning…";
        })()
      : null;

  const busy = refreshing || scanning;

  return (
    <>
      {/* Hidden under 820px (the home footer repeats the up/down counts). */}
      <span className="up-count">
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
      {/* Reflects the backend collector, which sweeps on its own schedule
          regardless of the poll interval above — so it stays visible even
          with polling "off". Hidden ≤820px alongside the sync clock. */}
      {nextSweepLabel && (
        <span className="sweep-countdown" title="next scheduled reachability sweep">
          {nextSweepLabel}
        </span>
      )}
      <button
        className="btn"
        onClick={() => void handleScan()}
        disabled={busy}
        title="scan now + refresh"
        aria-label="scan now and refresh data"
      >
        <span className={busy ? "spin" : ""} style={{ display: "inline-block" }}>
          ⟳
        </span>{" "}
        <span className="tog-txt">scan</span>
      </button>
    </>
  );
}
