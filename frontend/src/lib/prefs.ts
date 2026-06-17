// Typed, centralized access to the handful of UI preferences we persist in
// localStorage (#124). One place owns each key, its allowed values and its
// default — instead of `getItem(...) as SomeType` casts scattered across
// components, which drift and silently accept stale/garbage values.

import type { LayoutKind } from "./topology";

export type PollInterval = "off" | "30s" | "5m";
export type SortMode = "group" | "name" | "ip" | "status";
export type Theme = "dark" | "light";

function read<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  const v = localStorage.getItem(key);
  return allowed.includes(v as T) ? (v as T) : fallback;
}

const POLL = ["off", "30s", "5m"] as const;
const SORT = ["group", "name", "ip", "status"] as const;
const LAYOUT = ["radial", "spine", "tree"] as const;
const THEME = ["dark", "light"] as const;

export const prefs = {
  theme: {
    get: (): Theme => read("homenet.theme", THEME, "dark"),
    set: (v: Theme) => localStorage.setItem("homenet.theme", v),
  },
  poll: {
    get: (): PollInterval => read("homenet.poll", POLL, "5m"),
    set: (v: PollInterval) => localStorage.setItem("homenet.poll", v),
  },
  sort: {
    get: (): SortMode => read("homenet.sort", SORT, "group"),
    set: (v: SortMode) => localStorage.setItem("homenet.sort", v),
  },
  layout: {
    get: (): LayoutKind => read("homenet.layout", LAYOUT, "radial"),
    set: (v: LayoutKind) => localStorage.setItem("homenet.layout", v),
  },
  showOffline: {
    // Default on; only the explicit string "false" hides offline devices.
    get: (): boolean => localStorage.getItem("homenet.showOffline") !== "false",
    set: (v: boolean) => localStorage.setItem("homenet.showOffline", String(v)),
  },
  // Most-recently-opened device ids, newest first (capped). Lets the home
  // screen reopen where you last looked instead of always devices[0] (#122).
  recent: {
    get: (): string[] => {
      try {
        const v = JSON.parse(localStorage.getItem("homenet.recent") ?? "[]");
        return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
      } catch {
        return [];
      }
    },
    push: (id: string) => {
      const next = [id, ...prefs.recent.get().filter((x) => x !== id)].slice(0, 8);
      localStorage.setItem("homenet.recent", JSON.stringify(next));
    },
  },
};
