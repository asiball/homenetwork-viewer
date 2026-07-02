import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { HomeView } from "./HomeView";
import { CatalogContext, type CatalogValue } from "../CatalogContext";
import type { Device, Switch } from "../types";

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

const catalog = (devices: Device[], switches: Switch[] = []): CatalogValue => ({
  devices,
  switches,
  cables: [],
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

function renderHome(devices: Device[], switches: Switch[] = [], initialEntries = ["/"]) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <CatalogContext.Provider value={catalog(devices, switches)}>
        <MemoryRouter initialEntries={initialEntries}>
          <Routes>
            <Route path="/" element={<HomeView />} />
            <Route path="/d/:id" element={<div data-testid="detail-stub" />} />
          </Routes>
        </MemoryRouter>
      </CatalogContext.Provider>
    </QueryClientProvider>
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
    const devices = [dev({ id: "a", name: "Alpha" }), dev({ id: "b", name: "Bravo" })];
    renderHome(devices);
    const list = sidebar();
    expect(within(list).getByText("Bravo")).toBeInTheDocument();

    await user.type(screen.getByRole("textbox", { name: "filter devices" }), "alpha");
    expect(within(list).getByText("Alpha")).toBeInTheDocument();
    expect(within(list).queryByText("Bravo")).not.toBeInTheDocument();
  });

  it("moves the selection with the arrow keys", async () => {
    const user = userEvent.setup();
    const devices = [
      dev({ id: "gw", name: "Gateway", group: "Infra", ring: 0 }),
      dev({ id: "pc", name: "Desktop", group: "Computer" }),
    ];
    renderHome(devices);
    const current = () =>
      within(sidebar())
        .getAllByRole("button")
        .find((b) => b.getAttribute("aria-current") === "true")?.textContent;
    // Default selection is the first device; ArrowDown advances to the next.
    expect(current()).toContain("Gateway");
    await user.keyboard("{ArrowDown}");
    expect(current()).toContain("Desktop");
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

  it("renders radial + tree together in compare view", async () => {
    const user = userEvent.setup();
    const devices = [
      dev({ id: "gw", name: "Gateway", group: "Infra", ring: 0, type: "router" }),
      dev({ id: "pc", name: "Desktop", group: "Computer" }),
    ];
    const { container } = renderHome(devices);
    // Single map by default.
    expect(container.querySelector(".map-compare")).toBeNull();

    await user.click(screen.getByRole("button", { name: /compare/ }));

    const compare = container.querySelector(".map-compare");
    expect(compare).not.toBeNull();
    // Two stacked maps: radial + the wiring tree.
    expect(compare?.querySelectorAll(".n-map")).toHaveLength(2);
    expect(within(compare as HTMLElement).getByText("radial")).toBeInTheDocument();
    expect(within(compare as HTMLElement).getByText("wiring tree")).toBeInTheDocument();
  });

  it("Enter on a focused wiring-tree row only fires that row's own handler, not the global navigate-to-selected shortcut", async () => {
    const user = userEvent.setup();
    const gw = dev({ id: "gw", name: "Gateway", group: "Infra", ring: 0, type: "router" });
    const nas = dev({ id: "nas", name: "NAS", group: "Infra" });
    const sw1: Switch = {
      id: "sw1",
      name: "Switch · rack",
      type: "switch",
      online: true,
      portMap: {
        "1": { device: "gw", role: "uplink" },
        "2": { device: "nas", role: "downlink" },
      },
    };
    renderHome([gw, nas], [sw1]);

    await user.click(screen.getByRole("button", { name: /tree/ }));
    // Repro precondition: some other device (NAS) is the current `selected`
    // before Enter lands on the switch's row.
    await user.click(
      within(screen.getByRole("complementary", { name: "device list" })).getByText("NAS")
    );

    // The switch's SVG hit area is a rect with role="button" — lowercase
    // tagName, which the old BUTTON/A-only guard didn't recognise.
    const switchRow = screen.getByRole("button", { name: "Switch · rack" });
    switchRow.focus();
    fireEvent.keyDown(switchRow, { key: "Enter" });

    // The row's own onKeyDown selected the switch (side panel swaps to it)...
    expect(screen.getByRole("complementary", { name: "switch summary" })).toBeInTheDocument();
    // ...and the global handler did not *also* fire and navigate to /d/nas
    // using the stale render-time `selected`.
    expect(screen.queryByTestId("detail-stub")).not.toBeInTheDocument();
  });

  it("shows the plain empty-catalog message when there are no devices at all", () => {
    renderHome([]);
    expect(screen.getByText(/no devices · add one to begin/)).toBeInTheDocument();
  });

  it("distinguishes a filter-excluded empty map from an empty catalog, with a clear-search action (#review item 6)", async () => {
    const user = userEvent.setup();
    const devices = [dev({ id: "a", name: "Alpha" })];
    renderHome(devices);

    await user.type(screen.getByRole("textbox", { name: "filter devices" }), "nomatch");

    // (DeviceList's own sidebar also shows a plain "no match" — match the map's
    // more specific copy so the two can't collide.)
    expect(screen.getByText("no match — clear search")).toBeInTheDocument();
    expect(screen.queryByText(/no devices · add one to begin/)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "clear search" }));

    // "Alpha" now shows up in both the sidebar and the map/summary panel —
    // just check the sidebar is back to normal.
    expect(within(sidebar()).getByText("Alpha")).toBeInTheDocument();
  });

  it("offers a 'show offline' action when every device is offline and hidden by the footer toggle", async () => {
    const user = userEvent.setup();
    const devices = [dev({ id: "a", name: "Alpha", online: false })];
    renderHome(devices);
    // Default catalog starts with showOffline on; turn it off to exclude the
    // only (offline) device from the map.
    await user.click(screen.getByRole("button", { name: /show offline/ }));

    expect(screen.getByText("no match — clear search")).toBeInTheDocument();
    const showOfflineAction = screen.getByRole("button", { name: "show offline" });

    await user.click(showOfflineAction);

    expect(within(sidebar()).getByText("Alpha")).toBeInTheDocument();
  });

  it("moves the selection to the next device by IP when the sidebar sort is 'ip', matching the visible order (#review item 14)", async () => {
    const user = userEvent.setup();
    const devices = [
      dev({ id: "gw", name: "Gateway", group: "Infra", ring: 0, ip: "192.168.1.1" }),
      dev({ id: "hi", name: "HighIp", ip: "192.168.1.200" }),
      dev({ id: "lo", name: "LowIp", ip: "192.168.1.5" }),
    ];
    renderHome(devices);
    const current = () =>
      within(sidebar())
        .getAllByRole("button")
        .find((b) => b.getAttribute("aria-current") === "true")?.textContent;

    const sortSelect = screen.getByRole("combobox", { name: "sort devices" });
    await user.selectOptions(sortSelect, "ip");
    // ↑/↓ is a global shortcut that yields to an active text-entry control
    // (isTypingTarget treats a focused <select> the same way) — blur it first,
    // same as a real user clicking elsewhere after picking a sort mode.
    sortSelect.blur();
    // Sidebar visible order by IP: Gateway (.1) → LowIp (.5) → HighIp (.200).
    // Default selection stays on Gateway until moved.
    expect(current()).toContain("Gateway");

    await user.keyboard("{ArrowDown}");
    expect(current()).toContain("LowIp");

    await user.keyboard("{ArrowDown}");
    expect(current()).toContain("HighIp");
  });

  it("keeps the layout in sync when the URL's ?layout= changes without a remount (e.g. the brand link)", async () => {
    const user = userEvent.setup();
    const devices = [dev({ id: "gw", name: "Gateway", group: "Infra", ring: 0, type: "router" })];
    renderHome(devices, [], ["/?layout=tree"]);

    expect(screen.getByRole("button", { name: /tree/ }).className).toContain("sel");

    // The brand link navigates to "/" (no query) without unmounting HomeView
    // — the view has to fall back like a fresh visit instead of keeping the
    // stale "tree" selection the URL no longer names.
    await user.click(screen.getByRole("link", { name: /HOMENET/ }));

    expect(screen.getByRole("button", { name: /radial/ }).className).toContain("sel");
    expect(screen.getByRole("button", { name: /tree/ }).className).not.toContain("sel");
  });
});
