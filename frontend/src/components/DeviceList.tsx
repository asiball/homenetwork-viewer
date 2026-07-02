// Left sidebar device list, grouped by category (spec §5.4).

import { useCallback, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useCatalog } from "../CatalogContext";
import type { Device } from "../types";
import { groupByOrder, groupColor, lastOctet, matchesQuery, sortDevices } from "../lib/helpers";
import { isTypingTarget, useGlobalKeydown } from "../lib/useGlobalKeydown";
import { prefs, type SortMode } from "../lib/prefs";
import { DeviceIcon } from "./DeviceIcon";

interface Props {
  devices: Device[];
  selectedId?: string;
  /** Row click handler. When omitted (e.g. /inventory, /analysis — screens
   *  that don't otherwise drive a selection) rows fall back to navigating
   *  straight to the device's detail page, so the sidebar is never a dead
   *  click surface (review item 2). */
  onSelect?: (id: string) => void;
  searchQuery?: string;
  onSearchChange?: (q: string) => void;
  /** Controlled sort mode + setter. Falls back to local state (persisted via
   *  prefs, as before) when rendered standalone / without Shell wiring. */
  sort?: SortMode;
  onSortChange?: (s: SortMode) => void;
}

export function DeviceList({
  devices,
  selectedId,
  onSelect,
  searchQuery = "",
  onSearchChange,
  sort: sortProp,
  onSortChange: onSortChangeProp,
}: Props) {
  const { selfId } = useCatalog();
  const navigate = useNavigate();
  const [localSort, setLocalSort] = useState<SortMode>(() => prefs.sort.get());
  const sort = sortProp ?? localSort;

  // "/" focuses the search box from anywhere (unless already typing in a
  // field) — fast path to the core "what is this IP?" lookup (#108).
  const searchRef = useRef<HTMLInputElement>(null);
  useGlobalKeydown(
    useCallback((e: KeyboardEvent) => {
      if (e.key !== "/" || isTypingTarget(e)) return;
      e.preventDefault();
      searchRef.current?.focus();
    }, [])
  );

  const needle = searchQuery.trim().toLowerCase();
  const filtered = needle ? devices.filter((d) => matchesQuery(d, needle)) : devices;

  // Single source of truth for row order, shared with HomeView's keyboard nav
  // (lib/helpers sortDevices) so ↑/↓ can never drift from what's on screen
  // (review item 14).
  const sorted = sortDevices(filtered, sort);
  const grouped = sort === "group" ? groupByOrder(sorted) : [{ group: "All", items: sorted }];

  function handleSortChange(s: SortMode) {
    prefs.sort.set(s);
    (onSortChangeProp ?? setLocalSort)(s);
  }

  function handleRowClick(id: string) {
    if (onSelect) onSelect(id);
    else navigate(`/d/${id}`);
  }

  return (
    <aside className="n-left" aria-label="device list">
      <div className="lfilter">
        <div style={{ display: "flex", gap: "8px", width: "100%" }}>
          <input
            ref={searchRef}
            style={{ flex: 1 }}
            value={searchQuery}
            onChange={(e) => onSearchChange?.(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") onSearchChange?.("");
            }}
            placeholder="search…  ( / )"
            aria-label="filter devices"
          />
          <select
            value={sort}
            onChange={(e) => handleSortChange(e.target.value as SortMode)}
            style={{
              width: "80px",
              background: "var(--bg-2)",
              color: "var(--fg)",
              border: "1px solid var(--rule-2)",
              fontSize: "10px",
            }}
            aria-label="sort devices"
          >
            <option value="group">group</option>
            <option value="name">name</option>
            <option value="ip">IP</option>
            <option value="status">status</option>
          </select>
        </div>
      </div>
      {needle && filtered.length === 0 && <div className="lempty">no match</div>}
      {grouped.map(({ group, items }) => (
        <div key={group}>
          <div className="ltitle">
            {group !== "All" && (
              <span
                aria-hidden
                style={{
                  display: "inline-block",
                  width: 7,
                  height: 7,
                  borderRadius: 2,
                  background: groupColor(group),
                  marginRight: 6,
                  verticalAlign: "middle",
                }}
              />
            )}
            {group} · {items.length}
          </div>
          {items.map((d) => (
            <button
              key={d.id}
              type="button"
              className={`lrow ${selectedId === d.id ? "sel" : ""}`}
              onClick={() => handleRowClick(d.id)}
              aria-current={selectedId === d.id ? "true" : undefined}
              title={`${d.name} · ${d.ip}`}
            >
              <span
                className={`lstat ${d.online ? "on" : "off"}`}
                aria-label={d.online ? "online" : "offline"}
              />
              <DeviceIcon type={d.type} className="licon" style={{ color: groupColor(d.group) }} />
              <span className="lname">{d.name}</span>
              {d.id === selfId && <span className="lyou">YOU</span>}
              <span className="lip">.{lastOctet(d.ip)}</span>
            </button>
          ))}
        </div>
      ))}
      <Link className="ladd" to="/add">
        + add device
      </Link>
    </aside>
  );
}
