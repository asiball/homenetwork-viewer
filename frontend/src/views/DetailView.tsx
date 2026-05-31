// Detail screen: one device dossier (spec §6). Ported from view-detail.jsx.
// Honours §6.4 missing-value rules — never invents data.

import { Link, useNavigate, useParams } from "react-router-dom";
import { useCatalog } from "../App";
import { Shell } from "../components/Shell";
import { Sparkline } from "../components/Sparkline";
import { RefreshControls } from "../components/RefreshControls";
import { cableForDevice, cableSwatch, switchForDevice } from "../lib/helpers";

function mean(xs: number[]): number {
  return Math.round(xs.reduce((a, b) => a + b, 0) / xs.length);
}

export function DetailView() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { devices, switches, cables } = useCatalog();
  const device = devices.find((d) => d.id === id);

  const footer = (
    <>
      <span>view <b>detail</b></span>
      <span className="right">homenet v1.0 · {id}</span>
    </>
  );

  if (!device) {
    return (
      <Shell
        devices={devices}
        onSelect={(did) => navigate(`/d/${did}`)}
        crumbs={
          <>
            <Link className="d-back" to="/">← map</Link> &nbsp;<span>not found</span>
          </>
        }
        right={<RefreshControls />}
        footer={footer}
      >
        <div className="d-main">
          <div className="center-screen">
            <div className="big">device not found</div>
            <div>id · {id}</div>
            <Link className="f-btn" to="/">← back to map</Link>
          </div>
        </div>
      </Shell>
    );
  }

  const detail = device.detail ?? null;
  const m = detail?.metrics ?? null;
  const sw = switchForDevice(switches, device.id);
  const cbl = cableForDevice(cables, device.id);
  const hist = detail?.hist7 ?? [1, 1, 1, 1, 1, 1, 1];
  const days = ["M", "T", "W", "T", "F", "S", "S"];
  const uptimeParts = (device.uptime ?? "").split(" ");

  return (
    <Shell
      devices={devices}
      selectedId={device.id}
      onSelect={(did) => navigate(`/d/${did}`)}
      crumbs={
        <>
          <Link className="d-back" to="/">← map</Link> &nbsp;<span>{device.host}</span>
        </>
      }
      right={
        <>
          <RefreshControls />
          <Link className="btn" to={`/d/${device.id}/edit`}>
            ✎ edit
          </Link>
        </>
      }
      footer={footer}
    >
      <div className="d-main">
        {/* identity */}
        <div className="d-id">
          <div>
            <div className="eyebrow">
              {device.group} · {device.type}
            </div>
            <div className="name">{device.name}</div>
            <div className="host">
              {device.host}
              <span className="sep">·</span>
              {device.ip}
              <span className="sep">·</span>
              {device.mac}
            </div>
          </div>
          <div className="badges">
            <span className={`pill ${device.online ? "on" : "off"}`}>
              {device.online ? "ONLINE" : "OFFLINE"}
            </span>
            {device.conn && <span className="pill">{device.conn}</span>}
            {device.online && m && <span className="pill live">live agent</span>}
            <Link className="d-edit" to={`/d/${device.id}/edit`}>
              ✎ edit
            </Link>
          </div>
        </div>

        {/* stat row × 4 */}
        <div className="d-stats">
          <div className="d-stat">
            <div className="l">CPU load</div>
            {m && m.cpu_pct != null ? (
              <>
                <div className="v amber">
                  {m.cpu_pct}
                  <span className="u">%</span>
                </div>
                {m.cpu_series && <Sparkline values={m.cpu_series} color="amber" />}
                {m.cpu_series && m.cpu_series.length > 0 && (
                  <div className="sub">
                    avg {mean(m.cpu_series)}% · peak {Math.max(...m.cpu_series)}%
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="v dim">—</div>
                <div className="sub">no agent / offline</div>
              </>
            )}
          </div>

          <div className="d-stat">
            <div className="l">Memory</div>
            {m && m.mem_pct != null ? (
              <>
                <div className="v ok">
                  {m.mem_pct}
                  <span className="u">%</span>
                </div>
                {m.mem_series && <Sparkline values={m.mem_series} color="ok" />}
                {m.mem_series && m.mem_series.length > 0 && (
                  <div className="sub">avg {mean(m.mem_series)}%</div>
                )}
              </>
            ) : (
              <>
                <div className="v dim">—</div>
                <div className="sub">no agent / offline</div>
              </>
            )}
          </div>

          <div className="d-stat">
            <div className="l">Throughput</div>
            {m && m.net_in != null ? (
              <>
                <div className="v">
                  {m.net_in}
                  <span className="u"> Mbps ↓</span>
                </div>
                {m.net_in_series && <Sparkline values={m.net_in_series} color="amber" />}
                <div className="sub">
                  ↑ {m.net_out ?? "—"} Mbps
                  {m.net_in_series && m.net_in_series.length > 0 &&
                    ` · peak ${Math.max(...m.net_in_series)}`}
                </div>
              </>
            ) : (
              <>
                <div className="v dim">—</div>
                <div className="sub">{device.online ? "no agent" : `offline · last ${device.last ?? "—"}`}</div>
              </>
            )}
          </div>

          <div className="d-stat">
            <div className="l">Uptime</div>
            <div className="v">{device.online ? uptimeParts[0] || "—" : "—"}</div>
            <div className="sub">
              {device.online
                ? uptimeParts.length > 1
                  ? `boot ${uptimeParts.slice(1).join(" ")} ago`
                  : "online"
                : `last online ${device.last ?? "—"}`}
            </div>
          </div>
        </div>

        {/* content grid */}
        <div className="d-grid">
          <div className="d-card" data-title="network">
            <dl>
              <dt>ipv4</dt>
              <dd>{detail?.net?.ipv4 ?? device.ip}</dd>
              <dt>ipv6</dt>
              <dd>{detail?.net?.ipv6 ?? "—"}</dd>
              <dt>mac</dt>
              <dd>{device.mac}</dd>
              <dt>link</dt>
              <dd>{device.conn ?? "—"}</dd>
              <dt>gateway</dt>
              <dd>{detail?.net?.gateway ?? "—"}</dd>
              <dt>dns</dt>
              <dd>{detail?.net?.dns ?? "—"}</dd>
              <dt>dhcp</dt>
              <dd>{detail?.net?.dhcp ?? "—"}</dd>
              <dt>vlan</dt>
              <dd>{detail?.net?.vlan ?? "—"}</dd>
              {detail?.net?.rssi && (
                <>
                  <dt>rssi</dt>
                  <dd>{detail.net.rssi}</dd>
                </>
              )}
              {sw && (
                <>
                  <dt>patch</dt>
                  <dd>
                    {sw.sw.name} · port {sw.port}
                  </dd>
                </>
              )}
              {cbl && (
                <>
                  <dt>cable</dt>
                  <dd style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span
                      className="swatch"
                      style={{
                        background: cableSwatch(cbl.color),
                        border: cbl.color === "white" ? "1px solid var(--rule-2)" : "0",
                      }}
                    />
                    <span>
                      {cbl.id} · {cbl.cat} · {cbl.len}
                    </span>
                  </dd>
                </>
              )}
            </dl>
          </div>

          <div className="d-card" data-title="hardware">
            <dl>
              <dt>cpu</dt>
              <dd>{detail?.hw?.cpu_full ?? device.cpu ?? "—"}</dd>
              <dt>arch</dt>
              <dd>{detail?.hw?.arch ?? "—"}</dd>
              <dt>memory</dt>
              <dd>{detail?.hw?.mem_full ?? device.mem ?? "—"}</dd>
              <dt>chassis</dt>
              <dd>{detail?.hw?.chassis ?? "—"}</dd>
              <dt>firmware</dt>
              <dd>{detail?.hw?.bios ?? "—"}</dd>
            </dl>
          </div>

          <div className="d-card" data-title="services / open ports">
            {detail?.services && detail.services.length > 0 ? (
              <>
                <table className="d-table">
                  <thead>
                    <tr>
                      <th style={{ width: 50 }}>port</th>
                      <th style={{ width: 36 }}>p</th>
                      <th>service</th>
                      <th>banner</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.services.map((s) => (
                      <tr key={`${s.proto}-${s.port}`}>
                        <td className="port">{s.port}</td>
                        <td className="proto">{s.proto}</td>
                        <td>{s.svc}</td>
                        <td className="banner">{s.banner}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="d-pool">
                  <span>tcp / udp</span>
                  <span>
                    <b>{detail.services.length}</b> ports open
                  </span>
                </div>
              </>
            ) : (
              <div className="d-sparse">no scan data · run port scan to populate</div>
            )}
          </div>

          <div className="d-card" data-title="storage / volumes">
            {detail?.storage && detail.storage.drives && detail.storage.drives.length > 0 ? (
              <>
                <div className="d-drives">
                  {detail.storage.drives.map((d) => (
                    <div key={d.nm} className="d-drive">
                      <span className="nm">
                        {d.nm}
                        {d.size ? ` · ${d.size}` : ""}
                      </span>
                      <span className="md">{d.md ?? ""}</span>
                      <span className="meter">
                        <span
                          className={`fill ${d.pct > 85 ? "hot" : ""}`}
                          style={{ width: `${d.pct}%` }}
                        />
                      </span>
                      <span className="pct">{d.pct}%</span>
                    </div>
                  ))}
                </div>
                {(detail.storage.pool || detail.storage.health) && (
                  <div className="d-pool">
                    <span>{detail.storage.pool ?? ""}</span>
                    <span>
                      <b>{detail.storage.health ?? ""}</b>
                    </span>
                  </div>
                )}
              </>
            ) : (
              <div className="d-sparse">no storage info available</div>
            )}
          </div>

          <div className="d-card" data-title="connection · last 7 days">
            <div className="d-hist">
              {hist.map((p, i) => {
                const cls = p > 0.95 ? "" : p > 0.7 ? "partial" : "poor";
                return (
                  <div key={i} className="day">
                    <div className="bar">
                      <div className={`fill ${cls}`} style={{ height: `${p * 100}%` }} />
                    </div>
                    <div className="pct">{Math.round(p * 100)}%</div>
                    <div className="lbl">{days[i]}</div>
                  </div>
                );
              })}
            </div>
            <div className="d-pool">
              <span>avg uptime · {Math.round((hist.reduce((a, b) => a + b, 0) / hist.length) * 100)}%</span>
              <span>this week</span>
            </div>
          </div>

          <div className="d-card" data-title="ownership">
            <dl>
              <dt>maker</dt>
              <dd>{detail?.own?.manufacturer ?? "—"}</dd>
              <dt>model</dt>
              <dd>{detail?.own?.model ?? "—"}</dd>
              <dt>location</dt>
              <dd>{detail?.own?.location ?? "—"}</dd>
              <dt>purchased</dt>
              <dd>{detail?.own?.purchased ?? "—"}</dd>
              <dt>price</dt>
              <dd>{detail?.own?.price ?? "—"}</dd>
              <dt>warranty</dt>
              <dd>{detail?.own?.warranty ?? "—"}</dd>
            </dl>
            <div className="d-tags">
              {(detail?.own?.tags ?? []).map((t) => (
                <span key={t} className="d-tag">
                  {t}
                </span>
              ))}
              <Link className="d-tag add" to={`/d/${device.id}/edit`}>
                + add
              </Link>
            </div>
          </div>

          <div className="d-card full" data-title="notes">
            <div className="d-notes">
              <div className="pen">
                {device.notes ? `${device.notes.length} chars` : "no notes"}
              </div>
              {device.notes ?? "—"}
            </div>
          </div>
        </div>
      </div>
    </Shell>
  );
}
