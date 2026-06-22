import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { TopologyMap } from "./TopologyMap";
import { CatalogContext, type CatalogValue } from "../CatalogContext";
import { analyzeBottlenecks, linkIndexByPair } from "../lib/bottleneck";
import { groupColor } from "../lib/helpers";
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

function renderTree(devices: Device[], switches: Switch[], cables: Cable[], withOverlay: boolean) {
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
    </QueryClientProvider>
  );
}

function renderMap(devices: Device[]) {
  return render(
    <CatalogContext.Provider value={catalog(devices, [], [])}>
      <MemoryRouter>
        <TopologyMap devices={devices} layout="radial" selectedId="gw" onSelect={vi.fn()} />
      </MemoryRouter>
    </CatalogContext.Provider>
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

  it("colours but does not label a healthy (fast / 1G) link", () => {
    // gw —[Cat6]— pc, both 2.5G → a clean 2.5G link: coloured, but no label.
    const fast: Cable[] = [{ id: "CBL-2", cat: "Cat6", fromDev: "gw", toDev: "pc" }];
    const { container } = renderTree(devices, [], fast, true);
    expect(container.querySelector(".link.bn-fast")).not.toBeNull();
    expect(container.querySelector(".link-speed")).toBeNull();
  });

  it("draws no overlay (no legend / speed classes) when off", () => {
    const { container } = renderTree(devices, [], cables, false);
    expect(container.querySelector(".link.bn-act")).toBeNull();
    expect(container.querySelector(".link-speed")).toBeNull();
    expect(container.querySelector(".map-legend")).toBeNull();
  });
});

describe("TopologyMap node group colour (#120)", () => {
  it("fills a non-selected device node with its group colour", () => {
    const devices = [
      dev({ id: "gw", group: "Infra", ring: 0, type: "router" }),
      dev({ id: "pc", group: "Computer" }),
    ];
    const { container } = renderMap(devices);
    const fills = Array.from(container.querySelectorAll<SVGRectElement>(".node-box")).map(
      (el) => el.style.fill
    );
    // The Computer leaf is tinted with its group colour; the selected gateway
    // keeps its amber accent (no inline group fill).
    expect(fills).toContain(groupColor("Computer"));
  });

  it("does not group-tint the selected node", () => {
    const devices = [dev({ id: "gw", group: "Infra", ring: 0, type: "router" })];
    const { container } = renderMap(devices);
    const gwRect = container.querySelector<SVGRectElement>(".node-box.center");
    expect(gwRect?.style.fill).toBe("");
  });
});
