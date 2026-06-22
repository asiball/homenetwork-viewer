import { describe, it, expect } from "vitest";
import { resolveHistory } from "./history";
import type { ReachabilityHistory } from "../types";

const reach = (over: Partial<ReachabilityHistory> = {}): ReachabilityHistory => ({
  device_id: "nas",
  days: 7,
  history: [],
  uptime_pct: null,
  events: [],
  ...over,
});

describe("resolveHistory (#171)", () => {
  it("prefers live samples when any day has data", () => {
    const r = reach({
      uptime_pct: 0.95,
      history: [
        { date: "2026-06-12", uptime: 1, samples: 720 },
        { date: "2026-06-13", uptime: 0.9, samples: 700 },
      ],
    });
    const res = resolveHistory(r, [0.5, 0.5, 0.5]);
    expect(res.source).toBe("live");
    expect(res.avg).toBe(0.95);
    expect(res.bars).toHaveLength(2);
    expect(res.bars?.[0].pct).toBe(1);
  });

  it("falls back to manual hist7 when live has no samples", () => {
    const r = reach({ history: [{ date: "2026-06-12", uptime: null, samples: 0 }] });
    const res = resolveHistory(r, [1, 0.8, 0.6]);
    expect(res.source).toBe("manual");
    expect(res.bars).toHaveLength(3);
    expect(res.avg).toBeCloseTo((1 + 0.8 + 0.6) / 3);
  });

  it("uses manual hist7 when there is no live history at all", () => {
    const res = resolveHistory(null, [0.9]);
    expect(res.source).toBe("manual");
    expect(res.bars).toHaveLength(1);
  });

  it("returns nothing when neither live nor manual data exists", () => {
    expect(resolveHistory(null, null)).toEqual({ bars: null, source: null, avg: null });
    expect(resolveHistory(reach(), [])).toEqual({ bars: null, source: null, avg: null });
  });

  it("labels each manual bar (one per hist7 entry)", () => {
    const res = resolveHistory(null, [0.1, 0.2, 0.3, 0.4]);
    expect(res.bars?.map((b) => b.label).every((l) => typeof l === "string" && l.length > 0)).toBe(
      true
    );
  });
});
