// view-detail.jsx — full detail screen for one device.
// Uses the same .noc dark theme (we re-use N_CSS by class). Adds detail-only
// styles. Drops the map; expands the device into a multi-panel dossier.

(() => {
  const D_CSS = `
  .noc .d-main { grid-area: map / map / side / side; padding: 22px 32px 20px;
    overflow-y: auto; display: flex; flex-direction: column; gap: 16px; }

  /* identity row */
  .noc .d-id { display: flex; align-items: flex-end; gap: 18px;
    padding-bottom: 16px; border-bottom: 1px solid var(--rule); }
  .noc .d-id .eyebrow { font-size: 10px; color: var(--fg-faint); letter-spacing: 0.14em;
    text-transform: uppercase; margin-bottom: 6px; }
  .noc .d-id .name { font-size: 30px; line-height: 1; color: var(--amber); letter-spacing: -0.005em;
    font-weight: 500; font-family: 'JetBrains Mono', monospace; }
  .noc .d-id .host { font-size: 12px; color: var(--fg-soft); margin-top: 6px;
    font-family: 'JetBrains Mono', monospace; }
  .noc .d-id .host .sep { color: var(--fg-faint); margin: 0 8px; }
  .noc .d-id .badges { margin-left: auto; display: flex; gap: 6px; }
  .noc .d-id .badges .pill { font-size: 9px; padding: 3px 8px; border: 1px solid var(--rule-2);
    letter-spacing: 0.08em; text-transform: uppercase; color: var(--fg-soft); }
  .noc .d-id .badges .pill.on { color: var(--ok); border-color: rgba(121,221,176,0.4);
    box-shadow: inset 0 0 0 0 var(--ok); }
  .noc .d-id .badges .pill.off { color: var(--err); border-color: rgba(232,122,106,0.4); }
  .noc .d-id .badges .pill.live::before { content: '\\25cf'; color: var(--ok); margin-right: 4px;
    animation: nblink 2.5s infinite; }

  /* stat row */
  .noc .d-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
  .noc .d-stat { border: 1px solid var(--rule-2); padding: 11px 14px 10px;
    display: flex; flex-direction: column; gap: 4px; }
  .noc .d-stat .l { font-size: 9.5px; color: var(--fg-faint); letter-spacing: 0.14em;
    text-transform: uppercase; }
  .noc .d-stat .v { font-size: 24px; color: var(--fg);
    font-family: 'JetBrains Mono', monospace; line-height: 1.05; }
  .noc .d-stat .v .u { font-size: 12px; color: var(--fg-faint); margin-left: 2px; }
  .noc .d-stat .v.amber { color: var(--amber); }
  .noc .d-stat .v.ok { color: var(--ok); }
  .noc .d-stat .v.dim { color: var(--fg-faint); }
  .noc .d-stat svg { display: block; margin-top: 2px; }
  .noc .d-stat .spark { stroke: var(--amber); stroke-width: 1; fill: none; }
  .noc .d-stat .spark.ok { stroke: var(--ok); }
  .noc .d-stat .spark.dim { stroke: var(--fg-faint); }
  .noc .d-stat .spark-area { fill: var(--amber); opacity: 0.08; }
  .noc .d-stat .spark-area.ok { fill: var(--ok); opacity: 0.08; }
  .noc .d-stat .sub { font-size: 9.5px; color: var(--fg-faint); margin-top: 2px;
    letter-spacing: 0.04em; }

  /* content grid */
  .noc .d-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .noc .d-card { border: 1px solid var(--rule-2); background: var(--bg-2);
    padding: 14px 16px 14px; position: relative; }
  .noc .d-card::before { content: attr(data-title); position: absolute; top: -7px; left: 12px;
    background: var(--bg-2); padding: 0 6px; font-size: 9px; color: var(--amber);
    letter-spacing: 0.14em; text-transform: uppercase; }
  .noc .d-card.full { grid-column: 1 / -1; }
  .noc .d-card dl { margin: 0; display: grid; grid-template-columns: 88px 1fr;
    row-gap: 5px; column-gap: 14px; font-size: 11px; }
  .noc .d-card dt { color: var(--fg-faint); text-transform: uppercase; letter-spacing: 0.08em;
    font-size: 9.5px; padding-top: 1px; }
  .noc .d-card dd { margin: 0; color: var(--fg); font-family: 'JetBrains Mono', monospace; }
  .noc .d-card .none { color: var(--fg-faint); font-style: italic; }

  /* services / ports table */
  .noc .d-table { width: 100%; border-collapse: collapse; font-family: 'JetBrains Mono', monospace;
    font-size: 10.5px; }
  .noc .d-table th { text-align: left; padding: 4px 8px 6px; font-size: 9.5px;
    color: var(--fg-faint); letter-spacing: 0.12em; text-transform: uppercase;
    border-bottom: 1px solid var(--rule-2); font-weight: 400; }
  .noc .d-table td { padding: 5px 8px; border-bottom: 1px dotted var(--rule); }
  .noc .d-table td.port { color: var(--amber); width: 50px; }
  .noc .d-table td.proto { color: var(--fg-faint); width: 36px; text-transform: uppercase; font-size: 9.5px; }
  .noc .d-table td.banner { color: var(--fg-soft); font-size: 9.5px; }

  /* storage rows */
  .noc .d-drives { display: flex; flex-direction: column; gap: 7px; }
  .noc .d-drive { display: grid; grid-template-columns: 60px 1fr 80px 50px; gap: 10px;
    align-items: center; font-family: 'JetBrains Mono', monospace; font-size: 10.5px; }
  .noc .d-drive .nm { color: var(--amber); }
  .noc .d-drive .md { color: var(--fg-soft); font-size: 9.5px;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .noc .d-drive .pct { text-align: right; color: var(--fg-faint); font-size: 9.5px; }
  .noc .d-drive .meter { height: 6px; background: var(--bg-3); position: relative; }
  .noc .d-drive .meter .fill { position: absolute; left:0; top:0; bottom:0; background: var(--amber);
    transition: width 0.4s; }
  .noc .d-drive .meter .fill.hot { background: var(--err); }
  .noc .d-pool { margin-top: 8px; padding-top: 8px; border-top: 1px dotted var(--rule);
    display: flex; justify-content: space-between; font-size: 9.5px; color: var(--fg-faint);
    letter-spacing: 0.08em; text-transform: uppercase; }
  .noc .d-pool b { color: var(--ok); font-weight: 500; }

  /* connection histogram */
  .noc .d-hist { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; }
  .noc .d-hist .day { display: flex; flex-direction: column; align-items: center; gap: 4px; }
  .noc .d-hist .bar { width: 100%; height: 56px; background: var(--bg-3); position: relative; }
  .noc .d-hist .bar .fill { position: absolute; left:0; right:0; bottom:0; background: var(--ok); }
  .noc .d-hist .bar .fill.partial { background: var(--warn); }
  .noc .d-hist .bar .fill.poor { background: var(--err); }
  .noc .d-hist .lbl { font-size: 9px; color: var(--fg-faint); letter-spacing: 0.08em; }
  .noc .d-hist .pct { font-size: 9px; color: var(--fg); font-family: 'JetBrains Mono', monospace; }

  /* ownership */
  .noc .d-tags { display: flex; gap: 5px; flex-wrap: wrap; margin-top: 8px; padding-top: 8px;
    border-top: 1px dotted var(--rule); }
  .noc .d-tag { font-size: 9.5px; padding: 2px 7px; border: 1px solid var(--rule-2);
    color: var(--fg-soft); font-family: 'JetBrains Mono', monospace;
    letter-spacing: 0.04em; }
  .noc .d-tag.add { color: var(--fg-faint); border-style: dashed; cursor: pointer; }
  .noc .d-tag.add:hover { color: var(--amber); border-color: var(--amber); }

  /* notes (full) */
  .noc .d-notes { font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--fg);
    white-space: pre-wrap; line-height: 1.6; }
  .noc .d-notes .pen { color: var(--fg-faint); font-size: 9.5px; letter-spacing: 0.08em;
    text-transform: uppercase; margin-bottom: 6px; }

  /* back button */
  .noc .d-back { appearance: none; background: transparent; color: var(--fg-soft);
    border: 1px solid var(--rule-2); padding: 3px 10px; font: inherit; font-size: 10px;
    letter-spacing: 0.08em; text-transform: uppercase; cursor: pointer; border-radius: 2px;
    display: inline-flex; align-items: center; gap: 6px; }
  .noc .d-back:hover { background: var(--bg-3); color: var(--amber); }

  /* small section divider used inside cards */
  .noc .d-divider { height: 1px; background: var(--rule); margin: 9px 0; }

  /* empty / sparse helpers */
  .noc .d-sparse { color: var(--fg-faint); font-style: italic; font-family: 'JetBrains Mono', monospace;
    font-size: 10.5px; padding: 6px 0; }
  `;

  // ─── Detail-data fixtures ─────────────────────────────────────────
  // Keyed by device id. Devices without an entry fall back to "sparse" mode.

  const DETAIL_DATA = {
    nas: {
      net: {
        ipv4: '192.168.1.10/24', ipv6: 'fe80::cafe:beef:1234/64',
        gateway: '192.168.1.1',  dns: '192.168.1.1, 1.1.1.1',
        dhcp: 'reserved · expires never', vlan: 'default',
        rssi: null
      },
      hw: {
        cpu_full: 'Intel N100 · 4C / 4T @ 3.4 GHz (Alder Lake-N)',
        arch: 'x86_64', mem_full: '16 GB DDR4-3200 SODIMM',
        chassis: 'Custom mini-ITX · 35W TDP · 2× 2.5GbE',
        bios: 'AMI v.6.0.0 (2024-02)',
      },
      metrics: {
        cpu_pct: 18, cpu_series: [12, 16, 14, 18, 22, 17, 14, 16, 20, 24, 19, 18],
        mem_pct: 62, mem_series: [60, 61, 60, 62, 64, 63, 61, 62, 62, 64, 63, 62],
        net_in: 3.2, net_out: 0.4,
        net_in_series: [1.2, 2.1, 8.4, 6.0, 3.1, 2.5, 3.2, 4.0, 2.9, 3.2, 3.5, 3.2],
        temp: 48,
      },
      services: [
        { port: 22,   proto: 'tcp', svc: 'SSH',  banner: 'OpenSSH 9.0 (Debian)' },
        { port: 80,   proto: 'tcp', svc: 'HTTP', banner: 'nginx 1.24 · DSM redirect' },
        { port: 443,  proto: 'tcp', svc: 'HTTPS',banner: 'nginx · self-signed' },
        { port: 445,  proto: 'tcp', svc: 'SMB',  banner: 'Samba 4.17' },
        { port: 548,  proto: 'tcp', svc: 'AFP',  banner: 'Time Machine target' },
        { port: 5000, proto: 'tcp', svc: 'DSM',  banner: 'Synology DSM 7' },
        { port: 32400,proto: 'tcp', svc: 'Plex', banner: 'Plex Media Server' },
      ],
      storage: {
        drives: [
          { nm: 'sda', md: 'WD Red Pro 8TB · WD8003FFBX', size: '8 TB', pct: 65 },
          { nm: 'sdb', md: 'WD Red Pro 8TB · WD8003FFBX', size: '8 TB', pct: 65 },
          { nm: 'sdc', md: 'WD Red Pro 8TB · WD8003FFBX', size: '8 TB', pct: 65 },
          { nm: 'sdd', md: 'WD Red Pro 8TB · WD8003FFBX', size: '8 TB', pct: 65 },
          { nm: 'nvme0', md: 'WD Black SN770 1TB (cache)', size: '1 TB',  pct: 12 },
        ],
        pool: 'raid5 · 24 TB usable · 15.6 TB used',
        health: 'ok · last scrub 2026-05-12'
      },
      hist7: [1.00, 1.00, 0.998, 1.00, 0.992, 1.00, 1.00],
      own: {
        manufacturer: 'Custom build',
        model: 'mini-ITX · ASRock N100M',
        purchased: '2023-08-15',
        price: '¥98,000',
        warranty: 'parts only · n/a',
        location: 'Office shelf, top',
        tags: ['always-on', 'backup', 'media', 'critical'],
      },
      notes:
'Hosts SMB shares (`/Home`, `/Photos`, `/Media`), Time Machine for both Macs,\n' +
'and a Plex backend serving 4K to the living-room AppleTV via direct play.\n' +
'\n' +
'Scheduled jobs:\n' +
' · 02:00 — borg backup to off-site (rsync.net)\n' +
' · 03:30 — Plex library scan\n' +
' · sundays 04:00 — full RAID scrub (~3h)\n' +
'\n' +
'Watch: SMART for sdc shows 2 reallocated sectors as of 2026-04-02. ' +
'Not yet failing but worth replacing within 6 months.',
    },

    pix: {
      net: {
        ipv4: '192.168.1.32/24', ipv6: '—',
        gateway: '192.168.1.1', dns: 'inherited',
        dhcp: 'lease expired 11h ago',
        vlan: 'default',
        rssi: '— (offline)'
      },
      hw: {
        cpu_full: 'Google Tensor G3 · 9C (1× Cortex-X3 / 4× A715 / 4× A510)',
        arch: 'arm64', mem_full: '8 GB LPDDR5X',
        chassis: 'Pixel 8 (shiba) · 6.2" OLED',
        bios: 'bootloader unlocked · GrapheneOS 2025.04.12',
      },
      // Last seen 12h08m ago — metrics are stale by definition
      metrics: null,
      services: null,
      storage: {
        drives: [{ nm: 'ufs0', md: 'UFS 3.1 · 128 GB', size: '128 GB', pct: 41 }],
        pool: 'single volume · 75 GB used',
        health: 'last reported 12h ago'
      },
      hist7: [1.00, 0.91, 1.00, 0.84, 0.62, 0.78, 0.48],
      own: {
        manufacturer: 'Google',
        model: 'Pixel 8 · GA04803',
        purchased: '2024-01-09',
        price: '¥112,800',
        warranty: '2025-01-09 (expired)',
        location: 'Dev/test bench',
        tags: ['dev', 'test-device', 'BYOD'],
      },
      notes:
'Test phone for the Android build of my side-project. Mostly off; powered\n' +
'on every couple of days for QA. No PII on this device.\n' +
'\n' +
'Connection drops on Fri/Sat are expected — taken off-site to test cellular handoff.',
    },
  };

  function sparkPath(values, w, h, pad = 2) {
    if (!values || !values.length) return '';
    const min = Math.min(...values), max = Math.max(...values);
    const range = max - min || 1;
    const step = (w - pad * 2) / Math.max(1, values.length - 1);
    return values.map((v, i) => {
      const x = pad + i * step;
      const y = h - pad - ((v - min) / range) * (h - pad * 2);
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    }).join(' ');
  }
  function sparkArea(values, w, h, pad = 2) {
    const line = sparkPath(values, w, h, pad);
    if (!line) return '';
    return line + ` L ${(w - pad).toFixed(1)} ${(h - pad).toFixed(1)} L ${pad} ${(h - pad).toFixed(1)} Z`;
  }

  // Sparkline mini-chart
  function Spark({ values, color = 'amber', w = 88, h = 24 }) {
    return (
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
        <path className={`spark-area ${color}`} d={sparkArea(values, w, h)} />
        <path className={`spark ${color}`} d={sparkPath(values, w, h)} />
      </svg>
    );
  }

  function DetailView({ deviceId, onBack, tweaks }) {
    const [sel, setSel] = React.useState(deviceId || 'nas');
    React.useEffect(() => { if (deviceId) setSel(deviceId); }, [deviceId]);

    const showOffline = tweaks?.showOffline ?? true;
    const polling = tweaks?.polling ?? '5min';
    const visible = DEVICES.filter(d => showOffline || d.online);
    const device = visible.find(d => d.id === sel) || visible[0];
    if (!device) return null;

    const detail = DETAIL_DATA[device.id] || null;
    const groupedLeft = GROUP_ORDER.map(g => ({
      g, items: visible.filter(d => d.group === g)
    })).filter(x => x.items.length);

    const isLive = polling === 'live' && device.online;

    return (
      <div className="noc">
        <style dangerouslySetInnerHTML={{__html: D_CSS}} />

        <div className="n-head">
          <div className="brand"><span className="dot" /> <b>HOMENET / NOC</b></div>
          <div className="crumbs">
            <button className="d-back" onClick={onBack}>← map</button>
            &nbsp;&nbsp;<span>{device.host}</span>
          </div>
          <div className="right">
            <span>poll · <b style={{ color: 'var(--amber)'}}>{polling}</b></span>
            <span>up {countOnline(DEVICES)}/{DEVICES.length}</span>
            <button className="refresh">⟳ scan now</button>
          </div>
        </div>

        <aside className="n-left">
          {groupedLeft.map(({g, items}) => (
            <React.Fragment key={g}>
              <div className="ltitle">{g} · {items.length}</div>
              {items.map(d => (
                <div key={d.id} className={`lrow ${sel===d.id?'sel':''}`} onClick={() => setSel(d.id)}>
                  <span className={`lstat ${d.online?'on':'off'}`} />
                  <span className="lname">{d.name}</span>
                  <span className="lip">.{d.ip.split('.').pop()}</span>
                </div>
              ))}
            </React.Fragment>
          ))}
        </aside>

        <div className="d-main">
          {/* identity row */}
          <div className="d-id">
            <div>
              <div className="eyebrow">{device.group} · {device.type}</div>
              <div className="name">{device.name}</div>
              <div className="host">
                {device.host}
                <span className="sep">·</span>{device.ip}
                <span className="sep">·</span>{device.mac}
              </div>
            </div>
            <div className="badges">
              <span className={`pill ${device.online?'on':'off'}`}>{device.online?'ONLINE':'OFFLINE'}</span>
              <span className="pill">{device.conn}</span>
              {isLive && <span className="pill live">live agent</span>}
            </div>
          </div>

          {/* stat row */}
          <div className="d-stats">
            <div className="d-stat">
              <div className="l">CPU load</div>
              {detail?.metrics ? (
                <>
                  <div className="v amber">{detail.metrics.cpu_pct}<span className="u">%</span></div>
                  <Spark values={detail.metrics.cpu_series} color="amber" />
                  <div className="sub">avg 17% · peak 24% / 1h</div>
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
              {detail?.metrics ? (
                <>
                  <div className="v ok">{detail.metrics.mem_pct}<span className="u">%</span></div>
                  <Spark values={detail.metrics.mem_series} color="ok" />
                  <div className="sub">used 9.9 / 16 GB</div>
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
              {detail?.metrics ? (
                <>
                  <div className="v">{detail.metrics.net_in}<span className="u"> Mbps ↓</span></div>
                  <Spark values={detail.metrics.net_in_series} color="amber" />
                  <div className="sub">↑ {detail.metrics.net_out} Mbps · peak 8.4</div>
                </>
              ) : (
                <>
                  <div className="v dim">—</div>
                  <div className="sub">offline · last 12h ago</div>
                </>
              )}
            </div>
            <div className="d-stat">
              <div className="l">Uptime</div>
              <div className="v">{device.online ? device.uptime.split(' ')[0] : '—'}</div>
              <div className="sub">
                {device.online
                  ? `boot ${device.uptime.split(' ').slice(1).join(' ')} ago`
                  : `last online ${device.last}`}
              </div>
            </div>
          </div>

          {/* main content grid */}
          <div className="d-grid">
            <div className="d-card" data-title="network">
              <dl>
                <dt>ipv4</dt><dd>{detail?.net?.ipv4 ?? device.ip + '/24'}</dd>
                <dt>ipv6</dt><dd>{detail?.net?.ipv6 ?? '—'}</dd>
                <dt>mac</dt><dd>{device.mac}</dd>
                <dt>link</dt><dd>{device.conn}</dd>
                <dt>gateway</dt><dd>{detail?.net?.gateway ?? '192.168.1.1'}</dd>
                <dt>dns</dt><dd>{detail?.net?.dns ?? 'inherited'}</dd>
                <dt>dhcp</dt><dd>{detail?.net?.dhcp ?? 'lease ok'}</dd>
                <dt>vlan</dt><dd>{detail?.net?.vlan ?? 'default'}</dd>
                {detail?.net?.rssi && (<><dt>rssi</dt><dd>{detail.net.rssi}</dd></>)}
                {(() => {
                  const sw = switchForDevice(device.id);
                  const cbl = cableForDevice(device.id);
                  if (!sw && !cbl) return null;
                  return (
                    <>
                      {sw && (
                        <>
                          <dt>patch</dt>
                          <dd>{sw.sw.name} · port {sw.port}</dd>
                        </>
                      )}
                      {cbl && (
                        <>
                          <dt>cable</dt>
                          <dd style={{ display:'flex', alignItems:'center', gap:6 }}>
                            <span style={{
                              width:9, height:9, borderRadius:'50%',
                              background: ({
                                gray:'#888c95', black:'#202225', white:'#e8e6df',
                                blue:'#4f8ad6', red:'#cf5a4d', yellow:'#d8b34e',
                                green:'#5fa56e', orange:'#d28148'
                              })[cbl.color] || '#5a606b',
                              border: cbl.color === 'white' ? '1px solid var(--rule-2)' : 0,
                            }} />
                            <span>{cbl.id} · {cbl.cat} · {cbl.len}</span>
                          </dd>
                        </>
                      )}
                    </>
                  );
                })()}
              </dl>
            </div>

            <div className="d-card" data-title="hardware">
              <dl>
                <dt>cpu</dt><dd>{detail?.hw?.cpu_full ?? device.cpu}</dd>
                <dt>arch</dt><dd>{detail?.hw?.arch ?? '—'}</dd>
                <dt>memory</dt><dd>{detail?.hw?.mem_full ?? device.mem}</dd>
                <dt>chassis</dt><dd>{detail?.hw?.chassis ?? '—'}</dd>
                <dt>firmware</dt><dd>{detail?.hw?.bios ?? '—'}</dd>
              </dl>
            </div>

            <div className="d-card" data-title="services / open ports">
              {detail?.services ? (
                <table className="d-table">
                  <thead>
                    <tr><th style={{ width: 50 }}>port</th><th style={{ width: 36 }}>p</th>
                      <th>service</th><th>banner</th></tr>
                  </thead>
                  <tbody>
                    {detail.services.map(s => (
                      <tr key={s.port}>
                        <td className="port">{s.port}</td>
                        <td className="proto">{s.proto}</td>
                        <td>{s.svc}</td>
                        <td className="banner">{s.banner}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="d-sparse">no scan data · run port scan to populate</div>
              )}
              {detail?.services && (
                <div className="d-pool"><span>last scan · 2026-05-18 03:14</span><span><b>{detail.services.length}</b> ports open</span></div>
              )}
            </div>

            <div className="d-card" data-title="storage / volumes">
              {detail?.storage ? (
                <>
                  <div className="d-drives">
                    {detail.storage.drives.map(d => (
                      <div key={d.nm} className="d-drive">
                        <span className="nm">{d.nm} · {d.size}</span>
                        <span className="md">{d.md}</span>
                        <span className="meter"><span className={`fill ${d.pct > 85 ? 'hot' : ''}`} style={{ width: d.pct + '%' }} /></span>
                        <span className="pct">{d.pct}%</span>
                      </div>
                    ))}
                  </div>
                  <div className="d-pool">
                    <span>{detail.storage.pool}</span>
                    <span><b>{detail.storage.health}</b></span>
                  </div>
                </>
              ) : (
                <div className="d-sparse">no storage info available</div>
              )}
            </div>

            <div className="d-card" data-title="connection · last 7 days">
              <div className="d-hist">
                {(detail?.hist7 ?? [1,1,1,1,1,1,1]).map((p, i) => {
                  const days = ['M','T','W','T','F','S','S'];
                  const cls = p > 0.95 ? '' : p > 0.7 ? 'partial' : 'poor';
                  return (
                    <div key={i} className="day">
                      <div className="bar"><div className={`fill ${cls}`} style={{ height: (p * 100) + '%' }} /></div>
                      <div className="pct">{Math.round(p * 100)}%</div>
                      <div className="lbl">{days[i]}</div>
                    </div>
                  );
                })}
              </div>
              <div className="d-pool">
                <span>avg uptime · {Math.round(((detail?.hist7 ?? [1,1,1,1,1,1,1]).reduce((a,b)=>a+b,0) / 7) * 100)}%</span>
                <span>this week</span>
              </div>
            </div>

            <div className="d-card" data-title="ownership">
              <dl>
                <dt>maker</dt><dd>{detail?.own?.manufacturer ?? '—'}</dd>
                <dt>model</dt><dd>{detail?.own?.model ?? '—'}</dd>
                <dt>location</dt><dd>{detail?.own?.location ?? '—'}</dd>
                <dt>purchased</dt><dd>{detail?.own?.purchased ?? '—'}</dd>
                <dt>price</dt><dd>{detail?.own?.price ?? '—'}</dd>
                <dt>warranty</dt><dd>{detail?.own?.warranty ?? '—'}</dd>
              </dl>
              <div className="d-tags">
                {(detail?.own?.tags ?? []).map(t => (
                  <span key={t} className="d-tag">{t}</span>
                ))}
                <span className="d-tag add">+ add</span>
              </div>
            </div>

            <div className="d-card full" data-title="notes">
              <div className="d-notes">
                <div className="pen">last edited 2026-04-02 · 312 chars</div>
                {detail?.notes ?? device.notes}
              </div>
            </div>
          </div>
        </div>

        <div className="n-foot">
          <span><b>{countOnline(DEVICES)}</b> up</span>
          <span><b style={{color:'var(--err)'}}>{countOffline(DEVICES)}</b> down</span>
          <span>poll <b>{polling}</b></span>
          <span>view <b>detail</b></span>
          <span className="right">B · NOC · detail / {device.id}</span>
        </div>
      </div>
    );
  }

  window.DetailView = DetailView;
})();
