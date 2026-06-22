// Right-hand summary panel on the home screen (spec §5.5).

import { Link } from "react-router-dom";
import { useCatalog } from "../CatalogContext";
import { Copyable } from "./Copyable";
import { DeviceIcon } from "./DeviceIcon";
import { clampPct, formatLast, groupColor } from "../lib/helpers";
import type { Device } from "../types";

interface Props {
  device: Device;
}

export function SummaryPanel({ device }: Props) {
  const { selfId } = useCatalog();
  const m = device.detail?.metrics ?? null;

  return (
    <aside className="n-side" aria-label="device summary">
      <div className="panel" data-title="identity">
        <div className="id-row">
          <DeviceIcon type={device.type} size={15} style={{ color: groupColor(device.group) }} />
          <span className={`pill ${device.online ? "on" : "off"}`}>
            {device.online ? "ONLINE" : "OFFLINE"}
          </span>
          <span className="pill">{device.group}</span>
          <span className="pill">{device.type}</span>
          {device.id === selfId && <span className="pill you">this device</span>}
        </div>
        <div className="dname">{device.name}</div>
        <div className="dhost">
          <Copyable text={device.host} />
        </div>
      </div>

      <div className="panel" data-title="network">
        <dl>
          <dt>ipv4</dt>
          <dd>
            <Copyable text={device.ip} />
          </dd>
          <dt>mac</dt>
          <dd>
            <Copyable text={device.mac} />
          </dd>
          <dt>link</dt>
          <dd>{device.conn ?? "—"}</dd>
          <dt>last</dt>
          <dd>{formatLast(device.last)}</dd>
          <dt>up</dt>
          <dd>{device.uptime ?? "—"}</dd>
          {device.url && (
            <>
              <dt>web</dt>
              <dd className="weblink-row">
                <Copyable text={device.url} />
                <a
                  className="weblink"
                  href={device.url}
                  target="_blank"
                  rel="noreferrer"
                  title="open in new tab"
                >
                  ↗
                </a>
              </dd>
            </>
          )}
        </dl>
      </div>

      <div className="panel" data-title="hardware">
        <dl>
          <dt>cpu</dt>
          <dd>{device.cpu ?? "—"}</dd>
          <dt>mem</dt>
          <dd>{device.mem ?? "—"}</dd>
          <dt>disk</dt>
          <dd>{device.storage ?? "—"}</dd>
        </dl>
        {device.online && m && (m.cpu_pct != null || m.mem_pct != null) && (
          <div style={{ marginTop: 10 }}>
            {m.cpu_pct != null && (
              <>
                <div className="meter-cap">
                  <span>cpu</span>
                  <span>{m.cpu_pct}%</span>
                </div>
                <div className="bar">
                  <div className="fill" style={{ width: `${clampPct(m.cpu_pct)}%` }} />
                </div>
              </>
            )}
            {m.mem_pct != null && (
              <>
                <div className="meter-cap" style={{ marginTop: 6 }}>
                  <span>mem</span>
                  <span>{m.mem_pct}%</span>
                </div>
                <div className="bar">
                  <div
                    className="fill"
                    style={{ width: `${clampPct(m.mem_pct)}%`, background: "var(--ok)" }}
                  />
                </div>
              </>
            )}
          </div>
        )}
        <div className="stale">
          {device.online ? (
            m ? (
              <span>catalog · metrics available</span>
            ) : (
              <span>online · no metrics</span>
            )
          ) : (
            <span>offline · last seen {formatLast(device.last)}</span>
          )}
          <span>{device.online ? formatLast(device.last) : ""}</span>
        </div>
      </div>

      <div className="panel" data-title="notes">
        <div className="blob">{device.notes ? `> ${device.notes}` : "> —"}</div>
      </div>

      <Link className="side-btn" to={`/d/${device.id}`}>
        view detail →
      </Link>
    </aside>
  );
}
