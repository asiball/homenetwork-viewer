// Left sidebar device list, grouped by category (spec §5.4).

import { useState } from "react";
import { Link } from "react-router-dom";
import { useCatalog } from "../App";
import type { Device } from "../types";
import { groupByOrder, lastOctet } from "../lib/helpers";

interface Props {
  devices: Device[];
  selectedId?: string;
  onSelect?: (id: string) => void;
}

export function DeviceList({ devices, selectedId, onSelect }: Props) {
  const { selfId } = useCatalog();
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const filtered = needle
    ? devices.filter((d) =>
        [d.name, d.host, d.ip, d.type, d.group, d.id].some((v) =>
          v.toLowerCase().includes(needle),
        ),
      )
    : devices;
  const grouped = groupByOrder(filtered);

  return (
    <aside className="n-left" aria-label="device list">
      <div className="lfilter">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setQ("");
          }}
          placeholder="filter · name / ip / type"
          aria-label="filter devices"
        />
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
              <span className={`lstat ${d.online ? "on" : "off"}`} />
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
