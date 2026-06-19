import { describe, it, expect } from "vitest";
import { ID_RE, IPV4_RE, MAC_RE, matchesQuery } from "../lib/helpers";
import type { Device } from "../types";

describe("matchesQuery", () => {
  const dev = {
    id: "nas",
    name: "NAS",
    host: "nas.home.arpa",
    ip: "192.168.1.10",
    mac: "AA:BB:CC:00:0A:11",
    group: "Infra",
    type: "nas",
    online: true,
    notes: "RAID5 scrub on Sundays",
    detail: { own: { manufacturer: "Synology", model: "DS920+", tags: ["critical", "backup"] } },
  } as Device;

  it("matches identity fields", () => {
    expect(matchesQuery(dev, "nas")).toBe(true);
    expect(matchesQuery(dev, "192.168.1.10")).toBe(true);
    expect(matchesQuery(dev, "AA:BB")).toBe(true);
  });

  it("matches notes, tags and ownership the user typed in", () => {
    expect(matchesQuery(dev, "scrub")).toBe(true); // notes
    expect(matchesQuery(dev, "critical")).toBe(true); // tag
    expect(matchesQuery(dev, "synology")).toBe(true); // manufacturer (case-insensitive)
    expect(matchesQuery(dev, "ds920")).toBe(true); // model
  });

  it("empty query matches everything; non-matches return false", () => {
    expect(matchesQuery(dev, "")).toBe(true);
    expect(matchesQuery(dev, "   ")).toBe(true);
    expect(matchesQuery(dev, "printer")).toBe(false);
  });
});

describe("ID_RE", () => {
  it("accepts valid kebab-case ids", () => {
    expect(ID_RE.test("nas")).toBe(true);
    expect(ID_RE.test("my-nas-2")).toBe(true);
    expect(ID_RE.test("a123")).toBe(true);
  });

  it("rejects invalid ids", () => {
    expect(ID_RE.test("My NAS")).toBe(false);
    expect(ID_RE.test("-nas")).toBe(false);
    expect(ID_RE.test("nas-")).toBe(false);
    expect(ID_RE.test("")).toBe(false);
  });
});

describe("IPV4_RE", () => {
  it("accepts valid IPs", () => {
    expect(IPV4_RE.test("192.168.1.1")).toBe(true);
    expect(IPV4_RE.test("10.0.0.1")).toBe(true);
    expect(IPV4_RE.test("255.255.255.0")).toBe(true);
  });

  it("rejects invalid IPs", () => {
    expect(IPV4_RE.test("256.0.0.1")).toBe(false);
    expect(IPV4_RE.test("192.168.01.1")).toBe(false);
    expect(IPV4_RE.test("not-an-ip")).toBe(false);
  });
});

describe("MAC_RE", () => {
  it("accepts valid MACs", () => {
    expect(MAC_RE.test("AA:BB:CC:DD:EE:FF")).toBe(true);
    expect(MAC_RE.test("aa:bb:cc:dd:ee:ff")).toBe(true);
  });

  it("rejects invalid MACs", () => {
    expect(MAC_RE.test("AA:BB:CC:DD:EE")).toBe(false);
    expect(MAC_RE.test("GG:BB:CC:DD:EE:FF")).toBe(false);
    expect(MAC_RE.test("")).toBe(false);
  });
});
