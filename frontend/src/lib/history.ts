// Resolve which 7-day reachability history the detail view should show.
// Extracted from DetailView so the spec §6.4 "never invent data" rule — prefer
// real collected samples (#93), fall back to the legacy hand-entered hist7, else
// show nothing — is a pure, unit-testable function (#171).

import type { ReachabilityHistory } from "../types";

export interface HistoryBar {
  /** Uptime ratio 0..1, or null for a day with no data. */
  pct: number | null;
  /** Narrow weekday label (e.g. "M"). */
  label: string;
}

export interface ResolvedHistory {
  bars: HistoryBar[] | null;
  source: "live" | "manual" | null;
  /** Average uptime ratio 0..1, or null when unknown. */
  avg: number | null;
}

const narrowWeekday = (d: Date): string => d.toLocaleDateString("en-US", { weekday: "narrow" });

export function resolveHistory(
  reach: ReachabilityHistory | null,
  hist7: number[] | null,
): ResolvedHistory {
  const liveDays = reach?.history ?? null;
  // Live wins only when at least one day actually has samples — an empty series
  // is "no data", not a flat zero week.
  const hasLive = liveDays?.some((d) => d.samples > 0) ?? false;
  if (hasLive && liveDays) {
    return {
      bars: liveDays.map((d) => ({
        pct: d.uptime,
        label: narrowWeekday(new Date(d.date + "T00:00:00")),
      })),
      source: "live",
      avg: reach?.uptime_pct ?? null,
    };
  }
  if (hist7 && hist7.length > 0) {
    // Label the last N days ending today, matching the series length.
    const labels = Array.from({ length: hist7.length }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (hist7.length - 1 - i));
      return narrowWeekday(d);
    });
    return {
      bars: hist7.map((p, i) => ({ pct: p, label: labels[i] })),
      source: "manual",
      avg: hist7.reduce((a, b) => a + b, 0) / hist7.length,
    };
  }
  return { bars: null, source: null, avg: null };
}
