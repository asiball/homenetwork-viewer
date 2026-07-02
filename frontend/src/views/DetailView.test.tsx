import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { DetailView } from "./DetailView";
import { CatalogContext, type CatalogValue } from "../CatalogContext";
import type { Cable, Device } from "../types";

vi.mock("../api", () => ({
  api: {
    reachability: vi
      .fn()
      .mockResolvedValue({ device_id: "x", days: 7, history: [], uptime_pct: null, events: [] }),
    wake: vi.fn().mockResolvedValue({ status: "sent", mac: "AA:BB:CC:DD:EE:FF" }),
  },
}));
import { api } from "../api";

const dev = (over: Partial<Device> = {}): Device => ({
  id: "nas",
  name: "NAS",
  host: "nas.home.arpa",
  ip: "192.168.1.20",
  mac: "AA:BB:CC:DD:EE:FF",
  group: "Infra",
  type: "nas",
  online: true,
  ...over,
});

const catalog = (devices: Device[], cables: Cable[] = []): CatalogValue => ({
  devices,
  switches: [],
  cables,
  meta: { total: devices.length, online: 0, offline: 0, updated_at: null },
  selfId: null,
  lastSync: new Date(),
  loading: false,
  refreshing: false,
  syncError: null,
  refresh: vi.fn().mockResolvedValue(undefined),
  notify: vi.fn(),
});

function renderDetail(id: string, devices: Device[], cables: Cable[] = []) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <CatalogContext.Provider value={catalog(devices, cables)}>
        <MemoryRouter initialEntries={[`/d/${id}`]}>
          <Routes>
            <Route path="/d/:id" element={<DetailView />} />
          </Routes>
        </MemoryRouter>
      </CatalogContext.Provider>
    </QueryClientProvider>
  );
}

// The dossier content lives in #main-content; scope queries there so they don't
// also match the device name in the sidebar list.
const dossier = () => within(document.getElementById("main-content") as HTMLElement);

describe("DetailView", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("renders the device dossier with a manual-metrics badge", () => {
    renderDetail("nas", [dev({ detail: { metrics: { cpu_pct: 18 } } })]);
    expect(dossier().getByText("NAS")).toBeInTheDocument();
    expect(dossier().getByText("nas.home.arpa")).toBeInTheDocument();
    expect(dossier().getByText("manual metrics")).toBeInTheDocument();
  });

  it("shows a not-found page for an unknown id", () => {
    renderDetail("ghost", [dev()]);
    expect(screen.getByText("device not found")).toBeInTheDocument();
    expect(screen.getByText(/id · ghost/)).toBeInTheDocument();
  });

  it("offers Wake-on-LAN for an offline wired device and sends the packet", async () => {
    const user = userEvent.setup();
    renderDetail("pc", [
      dev({ id: "pc", name: "Desktop", online: false, conn: "Wired 1G", ring: 2 }),
    ]);
    const wake = screen.getByRole("button", { name: /wake/ });
    await user.click(wake);
    expect(api.wake).toHaveBeenCalledWith("pc");
  });

  it("does not offer Wake-on-LAN for an online device", () => {
    renderDetail("nas", [dev({ online: true })]);
    expect(screen.queryByRole("button", { name: /wake/ })).not.toBeInTheDocument();
  });

  it("shows the wired path ceiling + bottleneck for a device behind a cable", () => {
    // pc (2.5G NIC) —[Cat5e, 1G]— gateway (2.5G): the Cat5e caps the path at 1G.
    const gw = dev({ id: "gw", name: "Gateway", type: "router", ring: 0, conn: "Wired 2.5G" });
    const pc = dev({ id: "pc", name: "Workstation", conn: "Wired 2.5G" });
    const cables: Cable[] = [{ id: "CBL-1", cat: "Cat5e", fromDev: "pc", toDev: "gw" }];
    renderDetail("pc", [gw, pc], cables);
    expect(dossier().getByText("path ↑")).toBeInTheDocument();
    expect(dossier().getByText("1G")).toBeInTheDocument();
    expect(dossier().getByText("bottleneck")).toBeInTheDocument();
    expect(dossier().getByText("CBL-1")).toBeInTheDocument();
  });

  it("omits the path ceiling for the gateway itself (no upstream path)", () => {
    const gw = dev({ id: "gw", name: "Gateway", type: "router", ring: 0, conn: "Wired 2.5G" });
    renderDetail("gw", [gw]);
    expect(dossier().queryByText("path ↑")).not.toBeInTheDocument();
  });

  it("hides stale manual CPU/memory/throughput metrics for an offline device (§6.4)", () => {
    const { container } = renderDetail("nas", [
      dev({
        online: false,
        last: "2024-01-01T00:00:00Z",
        detail: { metrics: { cpu_pct: 42, mem_pct: 55, net_in: 100 } },
      }),
    ]);
    const [cpu, mem, throughput, uptime] = Array.from(container.querySelectorAll(".d-stat"));
    // The last-collected manual numbers must not leak through once offline...
    expect(cpu.textContent).not.toContain("42");
    expect(mem.textContent).not.toContain("55");
    expect(throughput.textContent).not.toContain("100");
    // ...each shows "—" plus an offline-aware subtext instead (CPU/Memory/
    // Uptime say "last online …"; Throughput already had its own "offline ·
    // last …" wording, preserved as-is).
    for (const card of [cpu, mem, throughput, uptime]) {
      expect(card.querySelector(".v")?.textContent).toBe("—");
    }
    expect(cpu.textContent).toContain("last online");
    expect(mem.textContent).toContain("last online");
    expect(uptime.textContent).toContain("last online");
    expect(throughput.textContent).toContain("offline");
    expect(throughput.textContent).toContain("last");
  });

  it("still shows manual metrics for an online device", () => {
    const { container } = renderDetail("nas", [
      dev({ online: true, detail: { metrics: { cpu_pct: 42, mem_pct: 55, net_in: 100 } } }),
    ]);
    const [cpu, mem, throughput] = Array.from(container.querySelectorAll(".d-stat"));
    expect(cpu.textContent).toContain("42");
    expect(mem.textContent).toContain("55");
    expect(throughput.textContent).toContain("100");
  });

  it("clamps a >100% manual 7-day history bar instead of overflowing the meter (clampPct, #88 pattern)", () => {
    const { container } = renderDetail("nas", [dev({ detail: { hist7: [1.2, 0.5, 0.9] } })]);
    const days = container.querySelectorAll(".d-hist .day");
    expect(days).toHaveLength(3);
    const firstFill = days[0].querySelector(".fill") as HTMLElement;
    expect(firstFill.style.height).toBe("100%");
    expect(days[0].querySelector(".pct")?.textContent).toBe("100%");
  });
});
