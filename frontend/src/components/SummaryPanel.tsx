// Right-hand summary panel on the home screen (spec §5.5).

import { Link } from "react-router-dom";
import { useCatalog } from "../App";
import { Copyable } from "./Copyable";
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
          <span className={`pill ${device.online ? "on" : "off"}`}>
            {device.online ? "ONLINE" : "OFFLINE"}
          </span>
          <span className="pill">{device.group}</span>
          <span className="pill">{device.type}</span>
          {device.id === selfId && <span className="pill you">this device</span>}
        </div>
        <div className="dname">{device.name}</div>
        <div className="dhost">{device.host}</div>
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
          <dd>{device.last ?? "—"}</dd>
          <dt>up</dt>
          <dd>{device.uptime ?? "—"}</dd>
          {device.url && (
            <>
              <dt>web</dt>
              <dd>
                <a className="weblink" href={device.url} target="_blank" rel="noreferrer">
                  open ↗
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
                  <div className="fill" style={{ width: `${m.cpu_pct}%` }} />
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
                  <div className="fill" style={{ width: `${m.mem_pct}%`, background: "var(--ok)" }} />
                </div>
              </>
            )}
          </div>
        )}
        <div className={`stale${device.online && m ? " live" : ""}`}>
          {device.online
            ? m
              ? <span>agent · metrics live</span>
              : <span>online · no agent</span>
            : <span>offline · last seen {device.last ?? "—"}</span>}
          <span>{device.online ? device.last ?? "" : ""}</span>
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
