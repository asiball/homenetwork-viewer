// Catalog context + hook, split out of App.tsx so App can export only its
// component. Co-locating the hook with the App component tripped eslint's
// react-refresh/only-export-components rule (and weakened Fast Refresh).

import { createContext, useContext } from "react";
import type { Cable, Device, Meta, Switch } from "./types";

export interface CatalogValue {
  devices: Device[];
  switches: Switch[];
  cables: Cable[];
  meta: Meta;
  /** id of the catalog device whose IP matches the browser's client IP. */
  selfId: string | null;
  lastSync: Date | null;
  /** true only during the very first catalog load (gates full-screen spinners). */
  loading: boolean;
  /** true during a background re-fetch (poll / manual refresh) — never blanks views. */
  refreshing: boolean;
  syncError: string | null;
  refresh: () => Promise<void>;
  notify: (message: string, kind?: "ok" | "err") => void;
}

export const CatalogContext = createContext<CatalogValue | null>(null);

export function useCatalog(): CatalogValue {
  const ctx = useContext(CatalogContext);
  if (!ctx) throw new Error("useCatalog must be used within <App>");
  return ctx;
}
