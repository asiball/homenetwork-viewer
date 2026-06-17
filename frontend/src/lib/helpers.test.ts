import { describe, it, expect } from "vitest";
import { lastOctet, shortHost, kebabId, countOnline, groupByOrder, formatLast } from "./helpers";
import type { Device } from "../types";

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
