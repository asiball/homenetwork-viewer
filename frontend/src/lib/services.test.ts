import { describe, it, expect } from "vitest";
import { serviceUrl } from "./services";
import type { ServiceRow } from "../types";

const svc = (over: Partial<ServiceRow> = {}): ServiceRow => ({
  port: 80,
  proto: "tcp",
  svc: "",
  banner: "",
  ...over,
});

describe("serviceUrl (#183)", () => {
  const ip = "192.168.1.20";

  it("links https for 443 / 8443 (with explicit port)", () => {
    expect(serviceUrl(ip, svc({ port: 443 }))).toBe("https://192.168.1.20:443");
    expect(serviceUrl(ip, svc({ port: 8443 }))).toBe("https://192.168.1.20:8443");
  });

  it("links bare http for port 80", () => {
    expect(serviceUrl(ip, svc({ port: 80 }))).toBe("http://192.168.1.20");
  });

  it("links http with port for known HTTP-ish ports", () => {
    expect(serviceUrl(ip, svc({ port: 8080 }))).toBe("http://192.168.1.20:8080");
    expect(serviceUrl(ip, svc({ port: 32400 }))).toBe("http://192.168.1.20:32400");
  });

  it("links http when the service name mentions HTTP, on any port", () => {
    expect(serviceUrl(ip, svc({ port: 7777, svc: "http-alt" }))).toBe("http://192.168.1.20:7777");
  });

  it("returns null for non-HTTP tcp ports and for non-tcp protocols", () => {
    expect(serviceUrl(ip, svc({ port: 22, svc: "ssh" }))).toBeNull();
    expect(serviceUrl(ip, svc({ port: 53, proto: "udp", svc: "dns" }))).toBeNull();
    expect(serviceUrl(ip, svc({ port: 443, proto: "udp" }))).toBeNull();
  });
});
