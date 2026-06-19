// Detail screen: one device dossier (spec §6). Ported from view-detail.jsx.
// Honours §6.4 missing-value rules — never invents data.

import { Fragment, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useCatalog } from "../CatalogContext";
import { api } from "../api";
import { Shell } from "../components/Shell";
import { Sparkline } from "../components/Sparkline";
import { RefreshControls } from "../components/RefreshControls";
import { cableForDevice, clampPct, formatJpy, formatLast, groupColor, partsTotalJpy, switchForDevice, warrantyState } from "../lib/helpers";
import { resolveHistory } from "../lib/history";
import { serviceUrl } from "../lib/services";
import { DeviceNotFound, ViewFooter } from "../components/ViewChrome";
import { Copyable } from "../components/Copyable";
import { DeviceIcon } from "../components/DeviceIcon";
import { CableSwatch } from "../components/CableSwatch";
import { prefs } from "../lib/prefs";
import { Spinner } from "../components/Spinner";

function mean(xs: number[]): number {
  return Math.round(xs.reduce((a, b) => a + b, 0) / xs.length);
}

export function DetailView() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { devices, switches, cables, selfId, loading, notify } = useCatalog();
  const device = devices.find((d) => d.id === id);
  const [waking, setWaking] = useState(false);

  // Pull the real 7-day reachability history (#93). Keying on device.last means a
  // new sweep (which stamps last) refetches, so the chart tracks live samples
  // rather than the legacy hand-entered detail.hist7. A failure leaves `reach`
  // null, which falls back to the manual hist7 (#159 — was a hand-rolled effect).
  const { data: reach = null } = useQuery({
    queryKey: ["reachability", id, device?.last],
    queryFn: () => api.reachability(id, 7),
    enabled: !!id,
    retry: false,
  });

  // Remember this device as recently-opened so the home screen can reopen it
  // instead of always selecting devices[0] (#122).
  useEffect(() => {
    if (device) prefs.recent.push(device.id);
  }, [device?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleWake() {
    if (!device) return;
    setWaking(true);
    try {
      await api.wake(device.id);
      notify("magic packet sent · device may take 30s to boot", "ok");
    } catch (e) {
      notify(e instanceof Error ? e.message : "failed to send magic packet", "err");
    } finally {
      setWaking(false);
    }
  }

  if (loading && !device) return <Spinner />;
  if (!device) return <DeviceNotFound devices={devices} id={id} />;

  const detail = device.detail ?? null;
  const m = detail?.metrics ?? null;
  const sw = switchForDevice(switches, device.id);
  const cbl = cableForDevice(cables, device.id);
  // §6.4: never invent data — prefer the real collected series (#93), fall back
  // to the legacy hand-entered detail.hist7, else show nothing. Pure + tested in
  // lib/history.ts (#171).
  const { bars: histBars, source: histSource, avg: histAvg } = resolveHistory(
    reach,
    detail?.hist7 ?? null,
  );
  const lastEvent = reach?.events?.[0] ?? null;

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
          {/* Clone: prefill an add form from this device for similar units (#121). */}
          <Link className="btn" to="/add" state={{ clone: device.id }}>
            ⧉ clone
          </Link>
          <Link className="btn" to={`/d/${device.id}/edit`}>
            ✎ edit
          </Link>
        </>
      }
      footer={<ViewFooter view="detail" tail={id} />}
    >
      <div className="d-main" id="main-content" tabIndex={-1}>
        {/* identity */}
        <div className="d-id">
          <div>
            <div className="eyebrow">
              {device.group} · {device.type}
            </div>
            <div className="name">
              <DeviceIcon type={device.type} size={20} className="name-icon" style={{ color: groupColor(device.group) }} />
              {device.name}
            </div>
            <div className="host">
              <Copyable text={device.host} />
              <span className="sep">·</span>
              <Copyable text={device.ip} />
              <span className="sep">·</span>
              <Copyable text={device.mac} />
            </div>
            {/* Bridge the ledger to real work: copy ready-to-run commands (#108). */}
            <div className="host" style={{ marginTop: 4, opacity: 0.8 }}>
              <Copyable text={`ping ${device.ip}`}>⧉ ping</Copyable>
              <span className="sep">·</span>
              <Copyable text={`ssh ${device.ip}`}>⧉ ssh</Copyable>
              {!device.url && (
                <>
                  <span className="sep">·</span>
                  <Copyable text={`http://${device.ip}`}>⧉ http</Copyable>
                </>
              )}
            </div>
          </div>
          <div className="badges">
            <span className={`pill ${device.online ? "on" : "off"}`}>
              {device.online ? "ONLINE" : "OFFLINE"}
            </span>
            {device.conn && <span className="pill">{device.conn}</span>}
            {device.id === selfId && <span className="pill you">this device</span>}
            {m && (
              <span className="pill" title="hand-entered in the catalog — not live-collected">
                manual metrics
              </span>
            )}
            {!device.online && device.ring !== 0 && (!device.conn || !device.conn.startsWith("Wi-Fi")) && (
              <button
                className="d-edit"
                onClick={handleWake}
                disabled={waking}
                title="Send Wake-on-LAN magic packet"
              >
                {waking ? "sending…" : "⏻ wake"}
              </button>
            )}
            {device.url && (
              <a className="d-edit" href={device.url} target="_blank" rel="noreferrer">
                ↗ open
              </a>
            )}
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
                <div className="sub">{device.online ? "no agent" : `offline · last ${formatLast(device.last)}`}</div>
              </>
            )}
          </div>

          <div className="d-stat">
            <div className="l">Uptime</div>
            <div className="v">{device.online ? (device.uptime ?? "—") : "—"}</div>
            <div className="sub">
              {device.online
                ? device.uptime ? "since boot" : "online"
                : `last online ${formatLast(device.last)}`}
            </div>
          </div>
        </div>

        {/* content grid */}
        <div className="d-grid">
          <div className="d-card" data-title="network" aria-label="network">
            <dl>
              <dt>ipv4</dt>
              <dd>
                <Copyable text={detail?.net?.ipv4 ?? device.ip} />
              </dd>
              <dt>ipv6</dt>
              <dd>{detail?.net?.ipv6 ? <Copyable text={detail.net.ipv6} /> : "—"}</dd>
              <dt>mac</dt>
              <dd>
                <Copyable text={device.mac} />
              </dd>
              <dt>link</dt>
              <dd>{device.conn ?? "—"}</dd>
              <dt>gateway</dt>
              <dd>{detail?.net?.gateway ? <Copyable text={detail.net.gateway} /> : "—"}</dd>
              <dt>dns</dt>
              <dd>{detail?.net?.dns ? <Copyable text={detail.net.dns} /> : "—"}</dd>
              <dt>dhcp</dt>
              <dd>{detail?.net?.dhcp ?? "—"}</dd>
              <dt>vlan</dt>
              <dd>{detail?.net?.vlan ?? "—"}</dd>
              {device.url && (
                <>
                  <dt>web ui</dt>
                  <dd className="weblink-row">
                    <Copyable text={device.url} />
                    <a className="weblink" href={device.url} target="_blank" rel="noreferrer" title="open in new tab">
                      ↗
                    </a>
                  </dd>
                </>
              )}
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
                    <CableSwatch color={cbl.color} />
                    <span>
                      {cbl.id} · {cbl.cat} · {cbl.len}
                    </span>
                  </dd>
                </>
              )}
            </dl>
          </div>

          <div className="d-card" data-title="hardware" aria-label="hardware">
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
              {m?.temp != null && (
                <>
                  <dt>temp</dt>
                  <dd>{m.temp}°C</dd>
                </>
              )}
              {detail?.hw?.motherboard && (
                <>
                  <dt>motherboard</dt>
                  <dd>{detail.hw.motherboard}</dd>
                </>
              )}
              {(() => {
                const gpus = detail?.hw?.gpu ?? [];
                return gpus.map((g, i) => (
                  <Fragment key={i}>
                    <dt>gpu {gpus.length > 1 ? i + 1 : ""}</dt>
                    <dd>{g}</dd>
                  </Fragment>
                ));
              })()}
              {(detail?.hw?.storage_drives ?? []).map((d, i) => (
                <Fragment key={i}>
                  <dt>drive {i + 1}</dt>
                  <dd>{d}</dd>
                </Fragment>
              ))}
            </dl>
          </div>

          <div className="d-card" data-title="services / open ports" aria-label="services / open ports">
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
                    {detail.services.map((s) => {
                      const link = serviceUrl(device.ip, s);
                      return (
                        <tr key={`${s.proto}-${s.port}`}>
                          <td className="port">
                            {link ? (
                              <a className="weblink" href={link} target="_blank" rel="noreferrer">
                                {s.port} ↗
                              </a>
                            ) : (
                              s.port
                            )}
                          </td>
                          <td className="proto">{s.proto}</td>
                          <td>{s.svc}</td>
                          <td className="banner">{s.banner}</td>
                        </tr>
                      );
                    })}
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

          <div className="d-card" data-title="storage / volumes" aria-label="storage / volumes">
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
                          style={{ width: `${clampPct(d.pct)}%` }}
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

          <div className="d-card" data-title="connection · last 7 days" aria-label="connection · last 7 days">
            {histBars ? (
              <>
                <div className="d-hist">
                  {histBars.map((b, i) => {
                    if (b.pct == null) {
                      // A day with no samples — show a gap, don't invent uptime.
                      return (
                        <div key={i} className="day">
                          <div className="bar" />
                          <div className="pct">—</div>
                          <div className="lbl">{b.label}</div>
                        </div>
                      );
                    }
                    const cls = b.pct > 0.95 ? "" : b.pct > 0.7 ? "partial" : "poor";
                    return (
                      <div key={i} className="day">
                        <div className="bar">
                          <div className={`fill ${cls}`} style={{ height: `${b.pct * 100}%` }} />
                        </div>
                        <div className="pct">{Math.round(b.pct * 100)}%</div>
                        <div className="lbl">{b.label}</div>
                      </div>
                    );
                  })}
                </div>
                <div className="d-pool">
                  <span>avg uptime · {histAvg != null ? `${Math.round(histAvg * 100)}%` : "—"}</span>
                  {histSource === "live" ? (
                    <span title="computed from live reachability samples">live · last 7 days</span>
                  ) : (
                    <span title="hand-entered — superseded once the collector gathers samples">manual · this week</span>
                  )}
                </div>
                {histSource === "live" && lastEvent && (
                  <div className="d-pool" style={{ marginTop: 4, opacity: 0.8 }}>
                    <span>
                      last change · went {lastEvent.kind} {formatLast(lastEvent.ts)}
                    </span>
                  </div>
                )}
              </>
            ) : (
              <div className="d-sparse">no uptime history yet · samples accrue as the collector probes</div>
            )}
          </div>

          <div className="d-card" data-title="ownership" aria-label="ownership">
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

          {((detail?.parts && detail.parts.length > 0) ||
            (detail?.build_events && detail.build_events.length > 0)) && (
            <div className="d-card full" data-title="build / parts" aria-label="build / parts">
              {detail?.parts && detail.parts.length > 0 && (
                <>
                  <table className="d-table parts">
                    <thead>
                      <tr>
                        <th style={{ width: 70 }}>part</th>
                        <th>model</th>
                        <th style={{ width: 90 }}>purchased</th>
                        <th style={{ width: 90 }}>price</th>
                        <th style={{ width: 100 }}>warranty</th>
                        <th style={{ width: 70 }}>status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.parts.map((p) => {
                        const ws = warrantyState(p.warranty_until);
                        return (
                          <tr key={p.id}>
                            <td className="proto">{p.category}</td>
                            <td>
                              {p.model}
                              {p.serial ? <span className="part-serial"> · {p.serial}</span> : null}
                            </td>
                            <td>{p.purchased ?? "—"}</td>
                            <td>{p.price_jpy != null ? formatJpy(p.price_jpy) : "—"}</td>
                            <td className={ws ? `warr-${ws}` : ""}>
                              {p.warranty_until ?? "—"}
                              {ws === "soon" ? " ⚠" : ""}
                            </td>
                            <td className={`part-status st-${p.status}`}>{p.status}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <div className="d-pool">
                    <span>
                      <b>{detail.parts.length}</b> parts
                    </span>
                    <span>total · <b>{formatJpy(partsTotalJpy(detail.parts))}</b></span>
                  </div>
                </>
              )}
              {detail?.build_events && detail.build_events.length > 0 && (
                <ul className="d-builds">
                  {[...detail.build_events]
                    .sort((a, b) => b.date.localeCompare(a.date))
                    .map((e, i) => (
                      <li key={i}>
                        <span className="bd-date">{e.date}</span>
                        <span className={`bd-action ba-${e.action}`}>{e.action}</span>
                        <span className="bd-part">{e.part_id}</span>
                        {e.note ? <span className="bd-note">{e.note}</span> : null}
                      </li>
                    ))}
                </ul>
              )}
            </div>
          )}

          <div className="d-card full" data-title="notes" aria-label="notes">
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
