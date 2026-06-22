import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { DeviceList } from "./DeviceList";
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

const catalog = (over: Partial<CatalogValue> = {}): CatalogValue => ({
  devices: [],
  switches: [],
  cables: [],
  meta: { total: 0, online: 0, offline: 0, updated_at: null },
  selfId: null,
  lastSync: null,
  loading: false,
  refreshing: false,
  syncError: null,
  refresh: vi.fn(),
  notify: vi.fn(),
  ...over,
});

function renderList(
  props: Partial<Parameters<typeof DeviceList>[0]> = {},
  ctx?: Partial<CatalogValue>
) {
  const devices = props.devices ?? [dev()];
  return render(
    <CatalogContext.Provider value={catalog({ devices, ...ctx })}>
      <MemoryRouter>
        <DeviceList devices={devices} {...props} />
      </MemoryRouter>
    </CatalogContext.Provider>
  );
}

const names = () => Array.from(document.querySelectorAll(".lname")).map((el) => el.textContent);

describe("DeviceList", () => {
  beforeEach(() => localStorage.clear());

  it("lists devices and marks the selected one", () => {
    const devices = [dev({ id: "a", name: "Alpha" }), dev({ id: "b", name: "Bravo" })];
    renderList({ devices, selectedId: "b" });
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    const selected = screen.getByRole("button", { name: /Bravo/ });
    expect(selected).toHaveAttribute("aria-current", "true");
  });

  it("calls onSelect when a row is clicked", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    renderList({ devices: [dev({ id: "a", name: "Alpha" })], onSelect });
    await user.click(screen.getByRole("button", { name: /Alpha/ }));
    expect(onSelect).toHaveBeenCalledWith("a");
  });

  it("sorts by IP numerically when the IP sort is chosen", async () => {
    const user = userEvent.setup();
    const devices = [
      dev({ id: "a", name: "Ten", ip: "192.168.1.10" }),
      dev({ id: "b", name: "Two", ip: "192.168.1.2" }),
      dev({ id: "c", name: "Hundred", ip: "192.168.1.100" }),
    ];
    renderList({ devices });
    await user.selectOptions(screen.getByRole("combobox", { name: "sort devices" }), "ip");
    expect(names()).toEqual(["Two", "Ten", "Hundred"]);
  });

  it("focuses the search box when '/' is pressed outside a field", async () => {
    const user = userEvent.setup();
    renderList();
    const search = screen.getByRole("textbox", { name: "filter devices" });
    expect(search).not.toHaveFocus();
    await user.keyboard("/");
    expect(search).toHaveFocus();
  });

  it("tags the device matching the client IP with YOU", () => {
    const devices = [dev({ id: "me", name: "Mine" })];
    renderList({ devices }, { selfId: "me" });
    const row = screen.getByRole("button", { name: /Mine/ });
    expect(within(row).getByText("YOU")).toBeInTheDocument();
  });
});
