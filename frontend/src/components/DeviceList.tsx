// Left sidebar device list, grouped by category (spec §5.4).

import { Link } from "react-router-dom";
import { GROUP_ORDER, type Device } from "../types";
import { lastOctet } from "../lib/helpers";

interface Props {
  devices: Device[];
  selectedId?: string;
  onSelect?: (id: string) => void;
}

export function DeviceList({ devices, selectedId, onSelect }: Props) {
  const grouped = GROUP_ORDER.map((g) => ({
    g,
    items: devices.filter((d) => d.group === g),
  })).filter((x) => x.items.length);

  return (
    <aside className="n-left" aria-label="device list">
      {grouped.map(({ g, items }) => (
        <div key={g}>
          <div className="ltitle">
            {g} · {items.length}
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
