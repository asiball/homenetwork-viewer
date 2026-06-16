// Left sidebar device list, grouped by category (spec §5.4).

import { useState } from "react";
import { Link } from "react-router-dom";
import { useCatalog } from "../App";
import type { Device } from "../types";
import { groupByOrder, lastOctet } from "../lib/helpers";

type SortMode = "group" | "name" | "ip" | "status";

interface Props {
  devices: Device[];
  selectedId?: string;
  onSelect?: (id: string) => void;
}

export function DeviceList({ devices, selectedId, onSelect }: Props) {
  const { selfId } = useCatalog();
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortMode>(
    () => (localStorage.getItem("homenet.sort") as SortMode) || "group"
  );

  const needle = q.trim().toLowerCase();
  const filtered = needle
    ? devices.filter((d) =>
        [d.name, d.host, d.ip, d.type, d.group, d.id].some((v) =>
          v.toLowerCase().includes(needle),
        ),
      )
    : devices;

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
    localStorage.setItem("homenet.sort", s);
  }

  return (
    <aside className="n-left" aria-label="device list">
      <div className="lfilter">
        <div style={{ display: "flex", gap: "8px", width: "100%" }}>
          <input
            style={{ flex: 1 }}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setQ("");
            }}
            placeholder="search..."
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
      {needle && grouped.length === 0 && <div className="lempty">no match</div>}
      {grouped.map(({ group, items }) => (
        <div key={group}>
          <div className="ltitle">
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
