import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { BottleneckView } from "./BottleneckView";
import { CatalogContext, type CatalogValue } from "../CatalogContext";
import type { Cable, Device, Switch } from "../types";

const dev = (over: Partial<Device> = {}): Device => ({
  id: "d",
  name: "Device",
  host: "d.home.arpa",
  ip: "192.168.1.10",
  mac: "AA:BB:CC:DD:EE:FF",
  group: "Computer",
  type: "desktop",
  online: true,
  ...over,
});

const catalog = (
  devices: Device[],
  switches: Switch[] = [],
  cables: Cable[] = []
): CatalogValue => ({
  devices,
  switches,
  cables,
  meta: {
    total: devices.length,
    online: devices.length,
    offline: 0,
    updated_at: null,
    last_sweep: null,
    next_sweep: null,
    sweep_interval: 0,
  },
  selfId: null,
  lastSync: new Date(),
  loading: false,
  refreshing: false,
  syncError: null,
  refresh: vi.fn(),
  notify: vi.fn(),
});

function renderView(value: CatalogValue) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <CatalogContext.Provider value={value}>
        <MemoryRouter initialEntries={["/analysis"]}>
          <BottleneckView />
        </MemoryRouter>
      </CatalogContext.Provider>
    </QueryClientProvider>
  );
}

describe("BottleneckView", () => {
  beforeEach(() => localStorage.clear());

  it("computes nothing until the run button is pressed (on demand)", async () => {
    const devices = [
      dev({
        id: "gw",
        name: "Gateway",
        group: "Infra",
        ring: 0,
        type: "router",
        conn: "Wired 2.5G",
      }),
      dev({ id: "pc", name: "Workstation", conn: "Wired 2.5G" }),
    ];
    const cables: Cable[] = [{ id: "CBL-1", cat: "Cat5e", fromDev: "pc", toDev: "gw" }];
    const { container } = renderView(catalog(devices, [], cables));

    // Prompt is shown, no result table / no actionable pill yet.
    expect(screen.getByText(/を押すと計算します/)).toBeInTheDocument();
    expect(screen.queryByText("CBL-1")).not.toBeInTheDocument();
    expect(container.querySelector(".pill.warn")).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: /解析を実行/ }));

    // The Cat5e link between two 2.5G NICs is flagged as a cable bottleneck.
    // (CBL-1 appears in both the link table and the per-device bottleneck column.)
    expect(screen.getAllByText("CBL-1").length).toBeGreaterThan(0);
    expect(container.querySelector(".pill.warn")).not.toBeNull();
    // worst link is 1G (the Cat5e cap), shown in the footer summary.
    expect(screen.getAllByText("1G").length).toBeGreaterThan(0);
  });

  it("renders the per-device ceiling table for wired devices", async () => {
    const devices = [
      dev({
        id: "gw",
        name: "Gateway",
        group: "Infra",
        ring: 0,
        type: "router",
        conn: "Wired 2.5G",
      }),
      dev({ id: "pc", name: "Workstation", conn: "Wired 1G" }),
    ];
    const cables: Cable[] = [{ id: "CBL-1", cat: "Cat6", fromDev: "pc", toDev: "gw" }];
    renderView(catalog(devices, [], cables));

    await userEvent.click(screen.getByRole("button", { name: /解析を実行/ }));

    const ceiling = screen.getByText(/per-device ceiling/i).closest("section");
    expect(ceiling).not.toBeNull();
    if (ceiling) {
      // The 1G NIC caps the workstation's path even over a Cat6 cable.
      expect(within(ceiling).getByText("Workstation")).toBeInTheDocument();
    }
  });

  it("flags the report as stale once the catalog changes underneath it (#review item 13)", async () => {
    const devices = [
      dev({
        id: "gw",
        name: "Gateway",
        group: "Infra",
        ring: 0,
        type: "router",
        conn: "Wired 2.5G",
      }),
      dev({ id: "pc", name: "Workstation", conn: "Wired 2.5G" }),
    ];
    const cables: Cable[] = [{ id: "CBL-1", cat: "Cat5e", fromDev: "pc", toDev: "gw" }];
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const tree = (value: CatalogValue) => (
      <QueryClientProvider client={qc}>
        <CatalogContext.Provider value={value}>
          <MemoryRouter initialEntries={["/analysis"]}>
            <BottleneckView />
          </MemoryRouter>
        </CatalogContext.Provider>
      </QueryClientProvider>
    );

    const { rerender } = render(tree(catalog(devices, [], cables)));
    await userEvent.click(screen.getByRole("button", { name: /解析を実行/ }));
    expect(screen.queryByText(/stale/)).not.toBeInTheDocument();

    // A refetch/import/edit hands useCatalog() fresh array references even
    // when the underlying data is unchanged — that's the signal this view
    // tracks (rather than deep-diffing the catalog) (#review item 13).
    const refetchedDevices = [...devices];
    rerender(tree(catalog(refetchedDevices, [], cables)));

    expect(screen.getByText(/stale/)).toBeInTheDocument();

    // Re-running clears the staleness until the catalog changes again.
    await userEvent.click(screen.getByRole("button", { name: /再計算/ }));
    expect(screen.queryByText(/stale/)).not.toBeInTheDocument();
  });
});
