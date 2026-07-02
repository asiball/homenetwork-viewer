import { describe, it, expect, beforeEach, vi } from "vitest";
import { prefs } from "./prefs";

describe("prefs", () => {
  beforeEach(() => localStorage.clear());

  it("returns defaults when unset", () => {
    expect(prefs.poll.get()).toBe("5m");
    expect(prefs.sort.get()).toBe("group");
    expect(prefs.layout.get()).toBe("radial");
    expect(prefs.showOffline.get()).toBe(true);
    expect(prefs.theme.get()).toBe("dark");
  });

  it("round-trips valid values", () => {
    prefs.poll.set("30s");
    prefs.sort.set("ip");
    prefs.layout.set("tree");
    prefs.showOffline.set(false);
    prefs.theme.set("light");
    expect(prefs.poll.get()).toBe("30s");
    expect(prefs.sort.get()).toBe("ip");
    expect(prefs.layout.get()).toBe("tree");
    expect(prefs.showOffline.get()).toBe(false);
    expect(prefs.theme.get()).toBe("light");
  });

  it("falls back to the default on a garbage stored value", () => {
    localStorage.setItem("homenet.layout", "bogus");
    localStorage.setItem("homenet.sort", "nonsense");
    expect(prefs.layout.get()).toBe("radial");
    expect(prefs.sort.get()).toBe("group");
  });

  it("falls back to defaults, silently, when localStorage throws (storage disabled)", () => {
    // e.g. Safari private browsing / an enterprise policy: getItem/setItem
    // throw a SecurityError instead of just behaving oddly. main.tsx reads
    // prefs.theme.get() before the app (and its ErrorBoundary) mounts, so a
    // throw here must never escape.
    const getSpy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("storage disabled", "SecurityError");
    });
    const setSpy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("storage disabled", "SecurityError");
    });

    expect(prefs.theme.get()).toBe("dark");
    expect(prefs.poll.get()).toBe("5m");
    expect(prefs.sort.get()).toBe("group");
    expect(prefs.layout.get()).toBe("radial");
    expect(prefs.showOffline.get()).toBe(true);
    expect(prefs.showSpeeds.get()).toBe(false);
    expect(prefs.recent.get()).toEqual([]);

    expect(() => prefs.theme.set("light")).not.toThrow();
    expect(() => prefs.showOffline.set(false)).not.toThrow();
    expect(() => prefs.recent.push("x")).not.toThrow();

    getSpy.mockRestore();
    setSpy.mockRestore();
  });

  describe("recent", () => {
    it("returns [] when unset or stored value is garbage", () => {
      expect(prefs.recent.get()).toEqual([]);
      localStorage.setItem("homenet.recent", "not json");
      expect(prefs.recent.get()).toEqual([]);
      localStorage.setItem("homenet.recent", '{"not":"an array"}');
      expect(prefs.recent.get()).toEqual([]);
    });

    it("pushes newest-first, de-dupes, and caps at 8", () => {
      prefs.recent.push("a");
      prefs.recent.push("b");
      prefs.recent.push("a"); // moves 'a' back to front, no duplicate
      expect(prefs.recent.get()).toEqual(["a", "b"]);

      for (let i = 0; i < 10; i++) prefs.recent.push(`d${i}`);
      const got = prefs.recent.get();
      expect(got).toHaveLength(8);
      expect(got[0]).toBe("d9"); // newest first
    });
  });
});
