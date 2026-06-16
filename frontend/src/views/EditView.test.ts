import { describe, it, expect } from "vitest";
import { ID_RE, IPV4_RE, MAC_RE } from "../lib/helpers";

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
