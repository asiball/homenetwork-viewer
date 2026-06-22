import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { DetailView } from "./DetailView";
import { CatalogContext, type CatalogValue } from "../CatalogContext";
import type { Device } from "../types";

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

const catalog = (devices: Device[]): CatalogValue => ({
  devices,
  switches: [],
  cables: [],
  meta: { total: devices.length, online: 0, offline: 0, updated_at: null },
  selfId: null,
  lastSync: new Date(),
  loading: false,
  refreshing: false,
  syncError: null,
  refresh: vi.fn().mockResolvedValue(undefined),
  notify: vi.fn(),
});

function renderDetail(id: string, devices: Device[]) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <CatalogContext.Provider value={catalog(devices)}>
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
});
