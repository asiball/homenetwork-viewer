import { describe, it, expect } from "vitest";
import { buildPayload, cloneForm, emptyForm, formFromDevice } from "./devicePayload";
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

describe("cloneForm", () => {
  it("carries over template fields but clears per-unit identity", () => {
    const f = cloneForm(existing);
    // Unique / per-unit fields cleared.
    expect(f.ip).toBe("");
    expect(f.mac).toBe("");
    expect(f.online).toBe(false);
    // Name suffixed and id re-suggested from it.
    expect(f.name).toBe("NAS copy");
    expect(f.id).toBe("nas-copy");
    // Shared "template" fields preserved.
    expect(f.group).toBe("Infra");
    expect(f.type).toBe("nas");
    expect(f.manufacturer).toBe("Synology");
    expect(f.model).toBe("DS920+");
    expect(f.tags).toBe("critical");
  });
});

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

  it("folds parts/build_events into detail and drops blank rows (#97)", () => {
    const form = {
      ...emptyForm(),
      id: "rig",
      name: "Rig",
      host: "rig",
      ip: "192.168.1.52",
      mac: "DE:AD:BE:EF:00:03",
      type: "desktop",
    };
    const parts = [
      {
        id: "cpu-1",
        category: "cpu" as const,
        model: "N100",
        price_jpy: 20000,
        status: "active" as const,
      },
      { id: "", category: "gpu" as const, model: "", status: "active" as const }, // blank → dropped
    ];
    const events = [
      { date: "2024-01-02", action: "add" as const, part_id: "cpu-1" },
      { date: "", action: "add" as const, part_id: "" }, // blank → dropped
    ];
    const p = buildPayload(form, undefined, "add", "", parts, events);
    expect(p.detail?.parts).toHaveLength(1);
    expect(p.detail?.parts?.[0].model).toBe("N100");
    expect(p.detail?.build_events).toHaveLength(1);
  });

  it("clears a previously-stored parts list when emptied (#97)", () => {
    const dev: Device = {
      ...existing,
      detail: {
        ...existing.detail,
        parts: [{ id: "p1", category: "cpu", model: "old", status: "active" }],
      },
    };
    const p = buildPayload(formFromDevice(dev), dev, "edit", "nas", [], []);
    expect(p.detail?.parts).toBeNull();
  });

  it("writes arch/chassis/bios into detail.hw", () => {
    const form = {
      ...emptyForm(),
      id: "rig",
      name: "Rig",
      host: "rig",
      ip: "192.168.1.51",
      mac: "DE:AD:BE:EF:00:02",
      type: "desktop",
      arch: "x86_64",
      chassis: "Mini-ITX",
      bios: "AMI 2.21",
    };
    const p = buildPayload(form, undefined, "add", "");
    expect(p.detail?.hw).toMatchObject({ arch: "x86_64", chassis: "Mini-ITX", bios: "AMI 2.21" });
  });

  it("round-trips hw fields through formFromDevice", () => {
    const dev: Device = {
      ...existing,
      detail: { hw: { arch: "arm64", chassis: "SFF", bios: "v1.2" } },
    };
    const f = formFromDevice(dev);
    expect([f.arch, f.chassis, f.bios]).toEqual(["arm64", "SFF", "v1.2"]);
  });

  it("sends null for an emptied hw field while keeping the rest and auto-collected", () => {
    const dev: Device = {
      ...existing,
      detail: { hw: { arch: "x86_64", chassis: "Tower", cpu_full: "i5-12400" } },
    };
    const form = { ...formFromDevice(dev), arch: "" }; // clear arch, keep chassis
    const p = buildPayload(form, dev, "edit", "nas");
    expect(p.detail?.hw?.arch).toBeNull(); // cleared -> backend deep-merge clears it
    expect(p.detail?.hw?.chassis).toBe("Tower"); // kept
    expect(p.detail?.hw?.cpu_full).toBe("i5-12400"); // auto-collected preserved
  });

  it("sends null for an emptied ownership field while keeping the rest", () => {
    const form = { ...formFromDevice(existing), manufacturer: "" };
    const p = buildPayload(form, existing, "edit", "nas");
    expect(p.detail?.own?.manufacturer).toBeNull(); // cleared
    expect(p.detail?.own?.model).toBe("DS920+"); // kept
  });

  it("uses the path id in edit mode, the form id in add mode", () => {
    const editP = buildPayload(formFromDevice(existing), existing, "edit", "nas");
    expect(editP.id).toBe("nas");
    const addForm = {
      ...emptyForm(),
      id: "new-dev",
      name: "X",
      host: "x",
      ip: "192.168.1.9",
      mac: "DE:AD:BE:EF:00:09",
      type: "desktop",
    };
    const addP = buildPayload(addForm, undefined, "add", "");
    expect(addP.id).toBe("new-dev");
  });
});
