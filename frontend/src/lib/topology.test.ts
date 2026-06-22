import { describe, it, expect } from "vitest";
import { computeLayout, MAP_W, MAP_H } from "./topology";
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

const sw = (over: Partial<Switch> = {}): Switch => ({
  id: "sw",
  name: "Switch",
  type: "switch",
  online: true,
  portMap: {},
  ...over,
});

describe("computeLayout — radial", () => {
  it("pins the ring-0 gateway to the centre", () => {
    const gw = dev({ id: "gw", type: "router", ring: 0, group: "Infra" });
    const { positions, deco } = computeLayout("radial", [gw], false);
    expect(positions.gw).toEqual({ x: MAP_W / 2, y: MAP_H / 2 + 4 });
    expect(deco.kind).toBe("radial");
  });

  it("links every non-gateway device back to the gateway, flagging offline edges", () => {
    const gw = dev({ id: "gw", type: "router", ring: 0, group: "Infra" });
    const a = dev({ id: "a", ring: 2, online: true });
    const b = dev({ id: "b", ring: 2, online: false });
    const { positions, edges } = computeLayout("radial", [gw, a, b], false);
    expect(edges).toContainEqual({ from: "gw", to: "a", off: false });
    expect(edges).toContainEqual({ from: "gw", to: "b", off: true });
    // Leaves are placed off-centre.
    expect(positions.a).toBeDefined();
    expect(positions.a).not.toEqual(positions.gw);
  });

  it("emits no edges when there is no gateway", () => {
    const a = dev({ id: "a", ring: 2 });
    const { edges } = computeLayout("radial", [a], false);
    expect(edges).toEqual([]);
  });
});

describe("computeLayout — tree", () => {
  it("attaches everything to the root when the ledger is empty", () => {
    const gw = dev({ id: "gw", type: "router", ring: 0, group: "Infra" });
    const a = dev({ id: "a" });
    const { edges, deco } = computeLayout("tree", [gw, a], false, []);
    expect(deco.kind).toBe("tree");
    expect(edges).toContainEqual(expect.objectContaining({ from: "gw", to: "a" }));
  });

  it("hangs a switch off its uplink and its devices off its ports", () => {
    const gw = dev({ id: "gw", type: "router", ring: 0, group: "Infra" });
    const nas = dev({ id: "nas" });
    const ledger = sw({
      id: "sw1",
      name: "Core Switch",
      portMap: {
        "1": { device: "gw", role: "uplink" },
        "2": { device: "nas", role: "downlink" },
      },
    });
    const { edges, pseudo } = computeLayout("tree", [gw, nas], false, [ledger]);
    // gw → sw1 (uplink), sw1 → nas (downlink).
    expect(edges).toContainEqual(expect.objectContaining({ from: "gw", to: "sw1" }));
    expect(edges).toContainEqual(expect.objectContaining({ from: "sw1", to: "nas" }));
    // A switch that isn't itself a catalog device is drawn as a pseudo node.
    expect(pseudo?.map((p) => p.id)).toContain("sw1");
    expect(pseudo?.find((p) => p.id === "sw1")?.label).toBe("Core Switch");
  });

  it("hangs a Wi-Fi client off an access point that is on the tree", () => {
    const gw = dev({ id: "gw", type: "router", ring: 0, group: "Infra" });
    const ap = dev({ id: "ap", type: "ap" });
    const phone = dev({ id: "phone", conn: "Wi-Fi 5 GHz" });
    const ledger = sw({
      id: "sw1",
      portMap: {
        "1": { device: "gw", role: "uplink" },
        "2": { device: "ap", role: "downlink" },
      },
    });
    const { edges } = computeLayout("tree", [gw, ap, phone], false, [ledger]);
    expect(edges).toContainEqual(expect.objectContaining({ from: "ap", to: "phone" }));
  });

  it("places the root on the top row (pre-order DFS)", () => {
    const gw = dev({ id: "gw", type: "router", ring: 0, group: "Infra" });
    const a = dev({ id: "a" });
    const b = dev({ id: "b" });
    const { positions } = computeLayout("tree", [gw, a, b], false, []);
    // Root sits above its children.
    expect(positions.gw.y).toBeLessThan(positions.a.y);
    expect(positions.gw.y).toBeLessThan(positions.b.y);
  });

  it("falls back to the first device as root when none is ring 0", () => {
    const a = dev({ id: "a", ring: undefined });
    const b = dev({ id: "b" });
    const { positions, edges } = computeLayout("tree", [a, b], false, []);
    expect(positions.a).toBeDefined();
    expect(edges).toContainEqual(expect.objectContaining({ from: "a", to: "b" }));
  });
});
