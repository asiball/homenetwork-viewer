import { describe, it, expect } from "vitest";
import { lastOctet, shortHost, kebabId, countOnline, groupByOrder } from "./helpers";
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
