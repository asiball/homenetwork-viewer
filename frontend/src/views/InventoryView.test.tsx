import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { InventoryView } from "./InventoryView";
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

const sw = (over: Partial<Switch> = {}): Switch => ({
  id: "sw",
  name: "Switch",
  type: "switch",
  online: true,
  portMap: {},
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

function renderInventory(devices: Device[], switches: Switch[], cables: Cable[]) {
  return render(
    <CatalogContext.Provider value={catalog(devices, switches, cables)}>
      <MemoryRouter>
        <InventoryView />
      </MemoryRouter>
    </CatalogContext.Provider>
  );
}

describe("InventoryView cable ledger", () => {
  it("resolves a cable endpoint that is a ledger switch, not just a device", () => {
    // The switch isn't a catalog device (a plain unmanaged switch), only a
    // ledger entry — deviceName() used to only search `devices` and fall
    // straight back to the raw id.
    const nas = dev({ id: "nas", name: "NAS" });
    const rackSwitch = sw({ id: "sw-rack", name: "Rack Switch" });
    const cables: Cable[] = [{ id: "CBL-1", fromDev: "sw-rack", toDev: "nas" }];

    renderInventory([nas], [rackSwitch], cables);

    // "Rack Switch" legitimately appears twice — once as the switch card's own
    // heading, once as the cable ledger's resolved "from" endpoint name.
    expect(screen.getAllByText("Rack Switch").length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText("sw-rack")).not.toBeInTheDocument();
  });
});
