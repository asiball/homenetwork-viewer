// NOC shell: persistent header / left list / footer around a body slot
// (spec §5.1, §6.1). The body fills the map (+side) grid areas.

import { type ReactNode, useState } from "react";
import { Link } from "react-router-dom";
import type { Device } from "../types";
import { DeviceList } from "./DeviceList";
import { ThemeToggle } from "./ThemeToggle";
import { prefs, type SortMode } from "../lib/prefs";

interface Props {
  devices: Device[];
  selectedId?: string;
  onSelect?: (id: string) => void;
  /** Controlled search query. Omit to let Shell own its own (uncontrolled)
   *  search state — every screen gets a working sidebar filter this way, not
   *  just the ones that wire it up themselves (review item 1). HomeView passes
   *  both so it can also drive the map + keyboard-nav order from the query. */
  searchQuery?: string;
  onSearchChange?: (q: string) => void;
  /** Same controlled/uncontrolled pattern as search, for the sidebar sort mode
   *  (review item 14) — HomeView controls it so its keyboard-nav order can
   *  match exactly what the sidebar displays; other screens fall back to
   *  Shell's own state (persisted via prefs, same as before). */
  sort?: SortMode;
  onSortChange?: (s: SortMode) => void;
  crumbs: ReactNode;
  right: ReactNode;
  footer: ReactNode;
  children: ReactNode;
}

export function Shell({
  devices,
  selectedId,
  onSelect,
  searchQuery: searchQueryProp,
  onSearchChange: onSearchChangeProp,
  sort: sortProp,
  onSortChange: onSortChangeProp,
  crumbs,
  right,
  footer,
  children,
}: Props) {
  // Wide screens start with the list open; iPad-portrait starts collapsed.
  const [leftOpen, setLeftOpen] = useState(
    () => typeof window === "undefined" || window.innerWidth > 820
  );

  const [localQuery, setLocalQuery] = useState("");
  const searchQuery = searchQueryProp ?? localQuery;
  const onSearchChange = onSearchChangeProp ?? setLocalQuery;

  const [localSort, setLocalSort] = useState<SortMode>(() => prefs.sort.get());
  const sort = sortProp ?? localSort;
  function onSortChange(s: SortMode) {
    prefs.sort.set(s);
    (onSortChangeProp ?? setLocalSort)(s);
  }

  return (
    <div className={`noc ${leftOpen ? "left-open" : "left-collapsed"}`}>
      <a href="#main-content" className="skip-link">
        skip to main content
      </a>
      <header className="n-head">
        <button
          type="button"
          className="iconbtn"
          aria-label="toggle device list"
          aria-pressed={leftOpen}
          onClick={() => setLeftOpen((v) => !v)}
        >
          ≡
        </button>
        <Link className="brand" to="/" title="home">
          <span className="dot" /> <b>HOMENET / NOC</b>
        </Link>
        <Link className="nav-link" to="/inventory" title="switch & cable inventory">
          inventory
        </Link>
        <Link className="nav-link" to="/analysis" title="link-speed bottleneck analysis">
          analysis
        </Link>
        <div className="crumbs">{crumbs}</div>
        <div className="right">
          {right}
          <ThemeToggle />
        </div>
      </header>

      <DeviceList
        devices={devices}
        selectedId={selectedId}
        onSelect={onSelect}
        searchQuery={searchQuery}
        onSearchChange={onSearchChange}
        sort={sort}
        onSortChange={onSortChange}
      />

      {children}

      <footer className="n-foot">{footer}</footer>
    </div>
  );
}
