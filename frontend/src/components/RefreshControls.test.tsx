import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RefreshControls } from "./RefreshControls";
import { CatalogContext, type CatalogValue } from "../CatalogContext";
import type { Meta } from "../types";

vi.mock("../api", () => ({
  api: {
    scan: vi.fn().mockResolvedValue({ status: "scheduled" }),
  },
}));
import { api } from "../api";

const meta = (over: Partial<Meta> = {}): Meta => ({
  total: 3,
  online: 2,
  offline: 1,
  updated_at: null,
  last_sweep: null,
  next_sweep: null,
  sweep_interval: 300,
  ...over,
});

function catalog(over: Partial<CatalogValue> = {}): CatalogValue {
  return {
    devices: [],
    switches: [],
    cables: [],
    meta: meta(),
    selfId: null,
    lastSync: new Date(),
    loading: false,
    refreshing: false,
    syncError: null,
    refresh: vi.fn().mockResolvedValue(undefined),
    notify: vi.fn(),
    ...over,
  };
}

function renderControls(over: Partial<CatalogValue> = {}) {
  const value = catalog(over);
  const utils = render(
    <CatalogContext.Provider value={value}>
      <RefreshControls />
    </CatalogContext.Provider>
  );
  return { ...utils, value };
}

describe("RefreshControls ⟳ scan (#review item 11)", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("triggers a scan, refreshes immediately, then refreshes again after the follow-up delay", async () => {
    vi.useFakeTimers();
    const { value } = renderControls();

    // fireEvent (not userEvent) under fake timers: userEvent's own internal
    // event-loop delays don't reliably resolve with vitest's fake timers,
    // which hung this test — fireEvent dispatches synchronously and we flush
    // the click handler's awaited promises with advanceTimersByTimeAsync.
    fireEvent.click(screen.getByRole("button", { name: /scan now and refresh/ }));
    await act(() => vi.advanceTimersByTimeAsync(0));

    expect(api.scan).toHaveBeenCalledOnce();
    expect(value.refresh).toHaveBeenCalledOnce();

    await act(() => vi.advanceTimersByTimeAsync(3000));

    expect(value.refresh).toHaveBeenCalledTimes(2);
  });

  it("shows an error toast when the scan fails to start, but still refreshes", async () => {
    vi.mocked(api.scan).mockRejectedValueOnce(new Error("scan boom"));
    const user = userEvent.setup();
    const { value } = renderControls();

    await user.click(screen.getByRole("button", { name: /scan now and refresh/ }));

    expect(value.notify).toHaveBeenCalledWith("scan boom", "err");
    expect(value.refresh).toHaveBeenCalled();
  });

  it("shows nothing when the collector has never run (last_sweep null)", () => {
    renderControls({ meta: meta({ last_sweep: null, next_sweep: "2026-07-02T12:05:00Z" }) });
    expect(screen.queryByTitle("next scheduled reachability sweep")).not.toBeInTheDocument();
  });

  it("renders a live countdown to the next scheduled sweep", () => {
    const now = new Date("2026-07-02T12:00:00Z");
    vi.useFakeTimers();
    vi.setSystemTime(now);
    renderControls({
      meta: meta({ last_sweep: "2026-07-02T11:55:00Z", next_sweep: "2026-07-02T12:04:32Z" }),
    });
    expect(screen.getByText("next scan 4:32")).toBeInTheDocument();
  });

  it("shows 'scanning…' once the next sweep time has passed", () => {
    const now = new Date("2026-07-02T12:10:00Z");
    vi.useFakeTimers();
    vi.setSystemTime(now);
    renderControls({
      meta: meta({ last_sweep: "2026-07-02T12:00:00Z", next_sweep: "2026-07-02T12:05:00Z" }),
    });
    expect(screen.getByText("scanning…")).toBeInTheDocument();
  });
});
