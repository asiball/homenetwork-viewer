import { describe, it, expect } from "vitest";
import { lastOctet, shortHost, kebabId, countOnline, groupByOrder, formatLast, clampPct, groupColor, suggestFreeIp, partsTotalJpy, formatJpy, warrantyState, gatewayInfo } from "./helpers";
import type { Device, Part } from "../types";

const makeDevice = (overrides: Partial<Device> = {}): Device => ({
  id: "test",
  name: "Test Device",
  host: "test.home.arpa",
  ip: "192.168.1.100",
  mac: "AA:BB:CC:DD:EE:FF",
  group: "Computer",
  type: "desktop",
  online: true,
  ...overrides,
});

describe("lastOctet", () => {
  it("returns last IP octet", () => {
    expect(lastOctet("192.168.1.100")).toBe("100");
    expect(lastOctet("10.0.0.1")).toBe("1");
  });
});

describe("shortHost", () => {
  it("returns hostname without domain", () => {
    expect(shortHost("nas.home.arpa")).toBe("nas");
    expect(shortHost("router")).toBe("router");
  });
});

describe("gatewayInfo", () => {
  it("derives subnet + iface from the gateway's detail.net.ipv4 (with CIDR)", () => {
    const gw = makeDevice({
      id: "gw",
      type: "router",
      host: "gw.home.arpa",
      ip: "192.168.1.1",
      detail: { net: { ipv4: "192.168.1.1/24" } },
    });
    expect(gatewayInfo([gw])).toEqual({ subnet: "192.168.1.0/24", iface: "gw" });
  });

  it("zeroes the host octet for a bare IP without a CIDR suffix (#124 bug fix)", () => {
    // The old regex required a /xx suffix, so a bare IP leaked through as the
    // 'subnet'. Now it is normalised to the /24 network.
    const gw = makeDevice({ ring: 0, host: "router.lan", ip: "10.0.5.42" });
    expect(gatewayInfo([gw])).toEqual({ subnet: "10.0.5.0/24", iface: "router" });
  });

  it("identifies the gateway by ring 0 when no router type is present", () => {
    const a = makeDevice({ id: "a", type: "desktop", ip: "192.168.2.50" });
    const gw = makeDevice({ id: "g", ring: 0, host: "edge.home", ip: "192.168.2.1" });
    expect(gatewayInfo([a, gw]).subnet).toBe("192.168.2.0/24");
  });

  it("falls back to home-lab defaults when there is no gateway", () => {
    expect(gatewayInfo([])).toEqual({ subnet: "192.168.1.0/24", iface: "br-lan" });
  });
});

describe("kebabId", () => {
  it("converts name to kebab-case", () => {
    expect(kebabId("My NAS")).toBe("my-nas");
    expect(kebabId("Pixel Tablet")).toBe("pixel-tablet");
  });

  it("falls back to 'device' for non-Latin input", () => {
    expect(kebabId("テスト")).toBe("device");
  });

  it("trims to 24 characters", () => {
    expect(kebabId("a".repeat(30))).toHaveLength(24);
  });
});

describe("countOnline", () => {
  it("counts online devices", () => {
    const devs = [
      makeDevice({ online: true }),
      makeDevice({ online: false }),
      makeDevice({ online: true }),
    ];
    expect(countOnline(devs)).toBe(2);
  });
});

describe("formatLast", () => {
  it("returns dash for missing values", () => {
    expect(formatLast(undefined)).toBe("—");
    expect(formatLast(null)).toBe("—");
    expect(formatLast("")).toBe("—");
  });

  it("renders an ISO timestamp as a relative time that ages", () => {
    const now = Date.now();
    expect(formatLast(new Date(now - 5_000).toISOString())).toBe("just now");
    expect(formatLast(new Date(now - 5 * 60_000).toISOString())).toBe("5m ago");
    expect(formatLast(new Date(now - 3 * 3_600_000).toISOString())).toBe("3h ago");
    expect(formatLast(new Date(now - 2 * 86_400_000).toISOString())).toBe("2d ago");
  });

  it("shows legacy / hand-edited human strings verbatim", () => {
    expect(formatLast("just now")).toBe("just now");
    expect(formatLast("yesterday")).toBe("yesterday");
  });
});

describe("groupColor", () => {
  it("gives each known group a distinct colour and falls back to grey", () => {
    expect(groupColor("Infra")).toMatch(/^#/);
    expect(groupColor("Computer")).not.toBe(groupColor("Infra"));
    expect(groupColor("Unknown")).toBe("#8a8f99");
  });
});

describe("clampPct", () => {
  it("clamps to 0–100 and defaults bad input to 0", () => {
    expect(clampPct(50)).toBe(50);
    expect(clampPct(150)).toBe(100);
    expect(clampPct(-5)).toBe(0);
    expect(clampPct(null)).toBe(0);
    expect(clampPct(undefined)).toBe(0);
    expect(clampPct(NaN)).toBe(0);
  });
});

describe("suggestFreeIp", () => {
  it("returns null when there are no devices to infer a subnet", () => {
    expect(suggestFreeIp([])).toBeNull();
  });

  it("suggests the smallest unused host in the busiest /24", () => {
    const devs = [
      makeDevice({ id: "a", ip: "192.168.1.2" }),
      makeDevice({ id: "b", ip: "192.168.1.3" }),
      makeDevice({ id: "c", ip: "192.168.1.5" }),
    ];
    // .1 is reserved (gateway), .2/.3 used → .4 is the lowest free.
    expect(suggestFreeIp(devs)).toBe("192.168.1.4");
  });

  it("reserves .0/.1 and starts from .2", () => {
    const devs = [makeDevice({ id: "a", ip: "192.168.1.50" })];
    expect(suggestFreeIp(devs)).toBe("192.168.1.2");
  });

  it("picks the most common /24 when devices span subnets", () => {
    const devs = [
      makeDevice({ id: "a", ip: "192.168.1.2" }),
      makeDevice({ id: "b", ip: "192.168.1.3" }),
      makeDevice({ id: "c", ip: "10.0.0.9" }),
    ];
    expect(suggestFreeIp(devs)).toBe("192.168.1.4");
  });

  it("returns null when the /24 is full", () => {
    const devs = Array.from({ length: 253 }, (_, i) =>
      makeDevice({ id: `d${i}`, ip: `192.168.1.${i + 2}` }),
    );
    expect(suggestFreeIp(devs)).toBeNull();
  });
});

describe("parts helpers (#97)", () => {
  const part = (over: Partial<Part> = {}): Part => ({
    id: "p",
    category: "gpu",
    model: "X",
    status: "active",
    ...over,
  });

  it("sums known part prices and skips priceless ones", () => {
    const parts = [part({ price_jpy: 58000 }), part({ price_jpy: 90000 }), part({ price_jpy: null })];
    expect(partsTotalJpy(parts)).toBe(148000);
    expect(partsTotalJpy([])).toBe(0);
    expect(partsTotalJpy(null)).toBe(0);
  });

  it("formats yen with separators", () => {
    expect(formatJpy(148000)).toBe("¥148,000");
    expect(formatJpy(0)).toBe("¥0");
  });

  it("classifies warranty state relative to now", () => {
    const now = Date.parse("2026-06-18");
    expect(warrantyState("2026-01-01", now)).toBe("expired");
    expect(warrantyState("2026-07-01", now)).toBe("soon"); // within 30 days
    expect(warrantyState("2027-01-01", now)).toBe("ok");
    expect(warrantyState(null, now)).toBeNull();
    expect(warrantyState("garbage", now)).toBeNull();
  });
});

describe("groupByOrder", () => {
  it("groups devices by category and drops empty groups", () => {
    const devs = [
      makeDevice({ id: "a", group: "Computer" }),
      makeDevice({ id: "b", group: "Mobile" }),
      makeDevice({ id: "c", group: "Computer" }),
    ];
    const groups = groupByOrder(devs);
    expect(groups.map(g => g.group)).toEqual(["Mobile", "Computer"]);
    expect(groups.find(g => g.group === "Computer")?.items).toHaveLength(2);
  });
});
