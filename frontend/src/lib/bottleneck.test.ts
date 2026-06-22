import { describe, it, expect } from "vitest";
import {
  analyzeBottlenecks,
  catToMbps,
  connToMbps,
  fmtMbps,
  linkIndexByPair,
  pairKey,
  speedTier,
  switchSpeedToMbps,
} from "./bottleneck";
import type { Cable, Device, Switch } from "../types";

// Minimal device factory — only the fields the analysis reads matter here.
function dev(id: string, extra: Partial<Device> = {}): Device {
  return {
    id,
    name: id,
    host: id,
    ip: "10.0.0.1",
    mac: "AA:BB:CC:DD:EE:FF",
    group: "Computer",
    type: "desktop",
    online: true,
    ...extra,
  };
}

function sw(id: string, speed: string | null): Switch {
  return { id, name: id, type: "switch", online: true, speed, portMap: {} };
}

function cable(id: string, fromDev: string, toDev: string, cat: string | null): Cable {
  return { id, fromDev, toDev, cat };
}

describe("speed parsing", () => {
  it("maps cable categories to rated Mbps (case/format insensitive)", () => {
    expect(catToMbps("Cat5e")).toBe(1000);
    expect(catToMbps("CAT-5E")).toBe(1000);
    expect(catToMbps("Cat 6a")).toBe(10000);
    expect(catToMbps("Cat5")).toBe(100);
    expect(catToMbps("")).toBeNull();
    expect(catToMbps(null)).toBeNull();
    expect(catToMbps("Cat999")).toBeNull();
  });

  it("maps wired conn to Mbps and treats Wi-Fi / unknown as null", () => {
    expect(connToMbps("Wired 1G")).toBe(1000);
    expect(connToMbps("Wired 2.5G")).toBe(2500);
    expect(connToMbps("Wired 100M")).toBe(100);
    expect(connToMbps("Wi-Fi 5 GHz")).toBeNull();
    expect(connToMbps("—")).toBeNull();
    expect(connToMbps(null)).toBeNull();
  });

  it("parses free-text switch speed strings", () => {
    expect(switchSpeedToMbps("1 Gbps")).toBe(1000);
    expect(switchSpeedToMbps("2.5 Gbps")).toBe(2500);
    expect(switchSpeedToMbps("100 Mbps")).toBe(100);
    expect(switchSpeedToMbps("10G")).toBe(10000);
    expect(switchSpeedToMbps("—")).toBeNull();
    expect(switchSpeedToMbps(null)).toBeNull();
  });

  it("formats Mbps for display", () => {
    expect(fmtMbps(2500)).toBe("2.5G");
    expect(fmtMbps(1000)).toBe("1G");
    expect(fmtMbps(100)).toBe("100M");
    expect(fmtMbps(null)).toBe("?");
  });
});

describe("link analysis", () => {
  it("flags a cable as the actionable bottleneck when it is slower than both ends", () => {
    // Two 2.5G NICs joined by a Cat5e (1G) cable → the cable caps the link.
    const a = dev("a", { conn: "Wired 2.5G" });
    const b = dev("b", { conn: "Wired 2.5G", ring: 0, type: "router" });
    const { links } = analyzeBottlenecks([a, b], [], [cable("c1", "a", "b", "Cat5e")]);
    expect(links).toHaveLength(1);
    expect(links[0].linkMbps).toBe(1000);
    expect(links[0].limitedBy).toBe("cable");
    expect(links[0].actionable).toBe(true);
  });

  it("does not flag the cable when an endpoint NIC is the real cap", () => {
    // A 1G NIC behind a Cat6 cable → the NIC limits it, swapping the cable won't help.
    const a = dev("a", { conn: "Wired 1G" });
    const b = dev("b", { conn: "Wired 2.5G", ring: 0, type: "router" });
    const { links } = analyzeBottlenecks([a, b], [], [cable("c1", "a", "b", "Cat6")]);
    expect(links[0].linkMbps).toBe(1000);
    expect(links[0].actionable).toBe(false);
    expect(links[0].limitedBy).toBe("from"); // the "a" end
  });

  it("reports unknown when no component speed can be derived", () => {
    const a = dev("a", { conn: "—" });
    const b = dev("b", { conn: "—", ring: 0 });
    const { links } = analyzeBottlenecks([a, b], [], [cable("c1", "a", "b", null)]);
    expect(links[0].linkMbps).toBeNull();
    expect(links[0].limitedBy).toBe("unknown");
    expect(links[0].unknown.length).toBe(3);
  });
});

describe("map overlay helpers", () => {
  it("pairKey is order-independent", () => {
    expect(pairKey("a", "b")).toBe(pairKey("b", "a"));
    expect(pairKey("a", "b")).not.toBe(pairKey("a", "c"));
  });

  it("buckets speeds into tiers", () => {
    expect(speedTier(10000)).toBe("fast");
    expect(speedTier(2500)).toBe("fast");
    expect(speedTier(1000)).toBe("med");
    expect(speedTier(100)).toBe("slow");
    expect(speedTier(null)).toBe("unknown");
  });

  it("indexes links by endpoint pair, both orderings resolving", () => {
    const a = dev("a", { conn: "Wired 1G" });
    const b = dev("b", { conn: "Wired 1G", ring: 0 });
    const { links } = analyzeBottlenecks([a, b], [], [cable("c1", "a", "b", "Cat6")]);
    const idx = linkIndexByPair(links);
    expect(idx.get(pairKey("a", "b"))).toBeDefined();
    expect(idx.get(pairKey("b", "a"))?.cableId).toBe("c1");
  });
});

describe("path analysis", () => {
  it("traces a device's effective speed to the slowest hop and names the bottleneck cable", () => {
    // pc -[Cat5e 1G]- desk-switch(1G) -[Cat6 → 1G switch]- gw
    const gw = dev("gw", { ring: 0, type: "router", conn: "Wired 2.5G" });
    const pc = dev("pc", { conn: "Wired 2.5G" });
    const desk = sw("desk", "1 Gbps");
    const cables = [
      cable("up", "desk", "gw", "Cat6"), // desk↔gw, capped by 1G switch
      cable("patch", "pc", "desk", "Cat5e"), // pc↔desk, capped by Cat5e (1G)
    ];
    const { paths, worstLinkMbps } = analyzeBottlenecks([gw, pc], [desk], cables);

    const pcPath = paths.find((p) => p.deviceId === "pc");
    expect(pcPath).toBeDefined();
    expect(pcPath?.hops).toHaveLength(2); // pc→desk→gw
    expect(pcPath?.effectiveMbps).toBe(1000);
    expect(pcPath?.bottleneckCableId).toBeTruthy();
    expect(worstLinkMbps).toBe(1000);
  });

  it("excludes devices with no wired path (Wi-Fi-only clients)", () => {
    const gw = dev("gw", { ring: 0, type: "router" });
    const phone = dev("phone", { conn: "Wi-Fi 5 GHz" }); // no cable
    const { paths } = analyzeBottlenecks([gw, phone], [], []);
    expect(paths.find((p) => p.deviceId === "phone")).toBeUndefined();
  });
});
