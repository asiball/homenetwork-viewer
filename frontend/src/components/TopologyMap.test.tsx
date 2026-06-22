import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { TopologyMap } from "./TopologyMap";
import { CatalogContext, type CatalogValue } from "../CatalogContext";
import { analyzeBottlenecks, linkIndexByPair } from "../lib/bottleneck";
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

const catalog = (devices: Device[], switches: Switch[], cables: Cable[]): CatalogValue => ({
  devices,
  switches,
  cables,
  meta: { total: devices.length, online: devices.length, offline: 0, updated_at: null },
  selfId: null,
  lastSync: new Date(),
  loading: false,
  refreshing: false,
  syncError: null,
  refresh: vi.fn(),
  notify: vi.fn(),
});

function renderTree(
  devices: Device[],
  switches: Switch[],
  cables: Cable[],
  withOverlay: boolean,
) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const linkIndex = withOverlay
    ? linkIndexByPair(analyzeBottlenecks(devices, switches, cables).links)
    : undefined;
  return render(
    <QueryClientProvider client={qc}>
      <CatalogContext.Provider value={catalog(devices, switches, cables)}>
        <MemoryRouter>
          <TopologyMap
            devices={devices}
            layout="tree"
            selectedId={devices[0].id}
            onSelect={vi.fn()}
            linkIndex={linkIndex}
          />
        </MemoryRouter>
      </CatalogContext.Provider>
    </QueryClientProvider>,
  );
}

describe("TopologyMap link-speed overlay", () => {
  // gw —[Cat5e, 1G]— pc, both 2.5G NICs → the cable is the actionable bottleneck.
  const devices = [
    dev({ id: "gw", name: "Gateway", group: "Infra", ring: 0, type: "router", conn: "Wired 2.5G" }),
    dev({ id: "pc", name: "Workstation", conn: "Wired 2.5G" }),
  ];
  const cables: Cable[] = [{ id: "CBL-1", cat: "Cat5e", fromDev: "gw", toDev: "pc" }];

  it("colours the bottleneck edge and labels its speed when the overlay is on", () => {
    const { container } = renderTree(devices, [], cables, true);
    // The capped link is flagged actionable and labelled with its 1G ceiling.
    expect(container.querySelector(".link.bn-act")).not.toBeNull();
    const label = container.querySelector(".link-speed.act");
    expect(label?.textContent).toBe("1G");
    // Legend is shown only with the overlay active.
    expect(container.querySelector(".map-legend")).not.toBeNull();
  });

  it("draws no overlay (no legend / speed classes) when off", () => {
    const { container } = renderTree(devices, [], cables, false);
    expect(container.querySelector(".link.bn-act")).toBeNull();
    expect(container.querySelector(".link-speed")).toBeNull();
    expect(container.querySelector(".map-legend")).toBeNull();
  });
});
