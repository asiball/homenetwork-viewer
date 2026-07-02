// Typed, centralized access to the handful of UI preferences we persist in
// localStorage (#124). One place owns each key, its allowed values and its
// default — instead of `getItem(...) as SomeType` casts scattered across
// components, which drift and silently accept stale/garbage values.

import type { LayoutKind } from "./topology";

export type PollInterval = "off" | "30s" | "5m";
export type SortMode = "group" | "name" | "ip" | "status";
export type Theme = "dark" | "light";
// Home map view: the two geometric layouts plus a side-by-side "compare"
// (radial + tree) that isn't itself a single layout.
export type ViewMode = LayoutKind | "compare";

// localStorage access can throw (SecurityError/QuotaExceededError — private
// browsing with storage disabled, an enterprise policy, a full quota, …), not
// just return garbage. main.tsx reads prefs.theme.get() before the app (and
// its ErrorBoundary) even mounts, so every read *and* write here has to fail
// silently and fall back to the default instead of taking the whole page down
// on first paint.
function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function safeSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable — the pref just doesn't persist this session */
  }
}

function read<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  const v = safeGet(key);
  return allowed.includes(v as T) ? (v as T) : fallback;
}

const POLL = ["off", "30s", "5m"] as const;
const SORT = ["group", "name", "ip", "status"] as const;
const LAYOUT = ["radial", "tree", "compare"] as const;
const THEME = ["dark", "light"] as const;

export const prefs = {
  theme: {
    get: (): Theme => read("homenet.theme", THEME, "dark"),
    set: (v: Theme) => safeSet("homenet.theme", v),
  },
  poll: {
    get: (): PollInterval => read("homenet.poll", POLL, "5m"),
    set: (v: PollInterval) => safeSet("homenet.poll", v),
  },
  sort: {
    get: (): SortMode => read("homenet.sort", SORT, "group"),
    set: (v: SortMode) => safeSet("homenet.sort", v),
  },
  layout: {
    get: (): ViewMode => read("homenet.layout", LAYOUT, "radial"),
    set: (v: ViewMode) => safeSet("homenet.layout", v),
  },
  showOffline: {
    // Default on; only the explicit string "false" hides offline devices.
    get: (): boolean => safeGet("homenet.showOffline") !== "false",
    set: (v: boolean) => safeSet("homenet.showOffline", String(v)),
  },
  // Wiring-tree link-speed overlay (colour edges by derived speed + flag cable
  // bottlenecks). Default off so the map stays clean until asked for it.
  showSpeeds: {
    get: (): boolean => safeGet("homenet.showSpeeds") === "true",
    set: (v: boolean) => safeSet("homenet.showSpeeds", String(v)),
  },
  // Most-recently-opened device ids, newest first (capped). Lets the home
  // screen reopen where you last looked instead of always devices[0] (#122).
  recent: {
    get: (): string[] => {
      try {
        const v = JSON.parse(safeGet("homenet.recent") ?? "[]");
        return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
      } catch {
        return [];
      }
    },
    push: (id: string) => {
      const next = [id, ...prefs.recent.get().filter((x) => x !== id)].slice(0, 8);
      safeSet("homenet.recent", JSON.stringify(next));
    },
  },
};
