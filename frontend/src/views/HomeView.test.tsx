import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { HomeView } from "./HomeView";
import { CatalogContext, type CatalogValue } from "../CatalogContext";
import type { Device } from "../types";

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

const catalog = (devices: Device[]): CatalogValue => ({
  devices,
  switches: [],
  cables: [],
  meta: { total: devices.length, online: devices.length, offline: 0, updated_at: null },
  selfId: null,
  lastSync: new Date(),
  loading: false,
  refreshing: false,
  syncError: null,
  refresh: vi.fn(),
  notify: vi.fn(),
});

function renderHome(devices: Device[]) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <CatalogContext.Provider value={catalog(devices)}>
        <MemoryRouter initialEntries={["/"]}>
          <HomeView />
        </MemoryRouter>
      </CatalogContext.Provider>
    </QueryClientProvider>,
  );
}

const sidebar = () => screen.getByRole("complementary", { name: "device list" });

describe("HomeView", () => {
  beforeEach(() => localStorage.clear());

  it("lists every device and selects one by default", () => {
    const devices = [
      dev({ id: "gw", name: "Gateway", group: "Infra", ring: 0 }),
      dev({ id: "nas", name: "NAS", group: "Infra" }),
      dev({ id: "pc", name: "Desktop" }),
    ];
    renderHome(devices);
    const list = sidebar();
    expect(within(list).getByText("Gateway")).toBeInTheDocument();
    expect(within(list).getByText("NAS")).toBeInTheDocument();
    // Exactly one row is marked current (a selection always exists).
    const current = within(list)
      .getAllByRole("button")
      .filter((b) => b.getAttribute("aria-current") === "true");
    expect(current).toHaveLength(1);
  });

  it("filters the list as the user types in the search box", async () => {
    const user = userEvent.setup();
    const devices = [
      dev({ id: "a", name: "Alpha" }),
      dev({ id: "b", name: "Bravo" }),
    ];
    renderHome(devices);
    const list = sidebar();
    expect(within(list).getByText("Bravo")).toBeInTheDocument();

    await user.type(screen.getByRole("textbox", { name: "filter devices" }), "alpha");
    expect(within(list).getByText("Alpha")).toBeInTheDocument();
    expect(within(list).queryByText("Bravo")).not.toBeInTheDocument();
  });

  it("toggles offline-device visibility via the footer control", async () => {
    const user = userEvent.setup();
    const devices = [
      dev({ id: "on", name: "Onine", online: true }),
      dev({ id: "off", name: "Offie", online: false }),
    ];
    renderHome(devices);
    const offieShown = () => within(sidebar()).queryByText("Offie") !== null;
    const before = offieShown();
    await user.click(screen.getByRole("button", { name: /show offline/ }));
    // Online device is always present; offline visibility flips.
    expect(within(sidebar()).getByText("Onine")).toBeInTheDocument();
    expect(offieShown()).toBe(!before);
  });
});
