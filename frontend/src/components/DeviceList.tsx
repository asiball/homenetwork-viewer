// Left sidebar device list, grouped by category (spec §5.4).

import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useCatalog } from "../CatalogContext";
import type { Device } from "../types";
import { groupByOrder, groupColor, lastOctet, matchesQuery } from "../lib/helpers";
import { prefs, type SortMode } from "../lib/prefs";
import { DeviceIcon } from "./DeviceIcon";

interface Props {
  devices: Device[];
  selectedId?: string;
  onSelect?: (id: string) => void;
  searchQuery?: string;
  onSearchChange?: (q: string) => void;
}

export function DeviceList({ devices, selectedId, onSelect, searchQuery = "", onSearchChange }: Props) {
  const { selfId } = useCatalog();
  const [sort, setSort] = useState<SortMode>(() => prefs.sort.get());

  // "/" focuses the search box from anywhere (unless already typing in a
  // field) — fast path to the core "what is this IP?" lookup (#108).
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "/") return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag && /^(INPUT|TEXTAREA|SELECT)$/.test(tag)) return;
      e.preventDefault();
      searchRef.current?.focus();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const needle = searchQuery.trim().toLowerCase();
  const filtered = needle ? devices.filter((d) => matchesQuery(d, needle)) : devices;

  const sorted = [...filtered].sort((a, b) => {
    if (sort === "name") return a.name.localeCompare(b.name);
    if (sort === "ip") {
      const aIp = a.ip.split(".").map(Number);
      const bIp = b.ip.split(".").map(Number);
      for (let i = 0; i < 4; i++) {
        if (aIp[i] !== bIp[i]) return (aIp[i] || 0) - (bIp[i] || 0);
      }
      return 0;
    }
    if (sort === "status") return (b.online ? 1 : 0) - (a.online ? 1 : 0);
    return 0; // 'group' sorting is handled by groupByOrder
  });

  const grouped = sort === "group" ? groupByOrder(sorted) : [{ group: "All", items: sorted }];

  function handleSortChange(s: SortMode) {
    setSort(s);
    prefs.sort.set(s);
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
            style={{ width: "80px", background: "var(--bg-2)", color: "var(--fg)", border: "1px solid var(--rule-2)", fontSize: "10px" }}
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
              onClick={() => onSelect?.(d.id)}
              aria-current={selectedId === d.id ? "true" : undefined}
              title={`${d.name} · ${d.ip}`}
            >
              <span className={`lstat ${d.online ? "on" : "off"}`} aria-label={d.online ? "online" : "offline"} />
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
