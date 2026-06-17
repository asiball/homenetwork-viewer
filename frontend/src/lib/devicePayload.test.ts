import { describe, it, expect } from "vitest";
import { buildPayload, emptyForm, formFromDevice } from "./devicePayload";
import type { Device } from "../types";

const existing: Device = {
  id: "nas",
  name: "NAS",
  host: "nas.home.arpa",
  ip: "192.168.1.10",
  mac: "AA:BB:CC:00:0A:11",
  group: "Infra",
  type: "nas",
  online: true,
  uptime: "42d",
  detail: {
    metrics: { cpu_pct: 18 },
    own: { manufacturer: "Synology", model: "DS920+", tags: ["critical"] },
    hw: { cpu_full: "Celeron J4125", motherboard: "OEM" },
  },
};

describe("buildPayload", () => {
  it("trims, upper-cases the MAC and sends emptied optionals as null", () => {
    const form = { ...formFromDevice(existing), cpu: "  ", mac: "aa:bb:cc:00:0a:11", url: "" };
    const p = buildPayload(form, existing, "edit", "nas");
    expect(p.mac).toBe("AA:BB:CC:00:0A:11");
    expect(p.cpu).toBeNull(); // emptied -> null (clears on PUT)
    expect(p.url).toBeNull();
  });

  it("preserves auto-collected detail (metrics, hw.cpu_full) on edit", () => {
    const p = buildPayload(formFromDevice(existing), existing, "edit", "nas");
    expect(p.detail?.metrics?.cpu_pct).toBe(18);
    expect(p.detail?.hw?.cpu_full).toBe("Celeron J4125");
    expect(p.uptime).toBe("42d"); // untouched field survives the spread
  });

  it("clears ownership to null when emptied but keeps other detail blocks", () => {
    const form = {
      ...formFromDevice(existing),
      manufacturer: "",
      model: "",
      tags: "",
    };
    const p = buildPayload(form, existing, "edit", "nas");
    expect(p.detail?.own).toBeNull();
    expect(p.detail?.metrics?.cpu_pct).toBe(18); // still there
  });

  it("splits comma tags and collects gpu/storage arrays", () => {
    const form = {
      ...emptyForm(),
      id: "rig",
      name: "Rig",
      host: "rig",
      ip: "192.168.1.50",
      mac: "DE:AD:BE:EF:00:01",
      type: "desktop",
      tags: " gaming , primary ",
      gpu1: "RTX 4070",
      gpu2: "",
      storeDrive1: "SN850 2TB",
      storeDrive2: "MX500 1TB",
    };
    const p = buildPayload(form, undefined, "add", "");
    expect(p.id).toBe("rig");
    expect(p.detail?.own?.tags).toEqual(["gaming", "primary"]);
    expect(p.detail?.hw?.gpu).toEqual(["RTX 4070"]);
    expect(p.detail?.hw?.storage_drives).toEqual(["SN850 2TB", "MX500 1TB"]);
  });

  it("uses the path id in edit mode, the form id in add mode", () => {
    const editP = buildPayload(formFromDevice(existing), existing, "edit", "nas");
    expect(editP.id).toBe("nas");
    const addForm = { ...emptyForm(), id: "new-dev", name: "X", host: "x", ip: "192.168.1.9", mac: "DE:AD:BE:EF:00:09", type: "desktop" };
    const addP = buildPayload(addForm, undefined, "add", "");
    expect(addP.id).toBe("new-dev");
  });
});
