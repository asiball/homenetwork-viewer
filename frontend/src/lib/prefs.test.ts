import { describe, it, expect, beforeEach } from "vitest";
import { prefs } from "./prefs";

describe("prefs", () => {
  beforeEach(() => localStorage.clear());

  it("returns defaults when unset", () => {
    expect(prefs.poll.get()).toBe("5m");
    expect(prefs.sort.get()).toBe("group");
    expect(prefs.layout.get()).toBe("radial");
    expect(prefs.showOffline.get()).toBe(true);
  });

  it("round-trips valid values", () => {
    prefs.poll.set("30s");
    prefs.sort.set("ip");
    prefs.layout.set("tree");
    prefs.showOffline.set(false);
    expect(prefs.poll.get()).toBe("30s");
    expect(prefs.sort.get()).toBe("ip");
    expect(prefs.layout.get()).toBe("tree");
    expect(prefs.showOffline.get()).toBe(false);
  });

  it("falls back to the default on a garbage stored value", () => {
    localStorage.setItem("homenet.layout", "bogus");
    localStorage.setItem("homenet.sort", "nonsense");
    expect(prefs.layout.get()).toBe("radial");
    expect(prefs.sort.get()).toBe("group");
  });
});
