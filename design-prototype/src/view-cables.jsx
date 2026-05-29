// view-cables.jsx — Physical-layer inventory view.
// Lists every switch / hub as a rack-style port panel + every cable in a table.
// Includes an "+ Add cable" form so the user can register new patch cords.

(() => {
  const C_CSS = `
  .noc .cv-main { grid-area: map / map / side / side; padding: 20px 28px 24px;
    overflow-y: auto; display: flex; flex-direction: column; gap: 22px; }

  .noc .cv-head {
    display: flex; align-items: flex-end; justify-content: space-between;
    padding-bottom: 12px; border-bottom: 1px solid var(--rule);
  }
  .noc .cv-head .ttl {
    font-size: 20px; color: var(--amber); letter-spacing: 0.04em;
    font-family: 'JetBrains Mono', monospace; font-weight: 500;
  }
  .noc .cv-head .eyebrow {
    font-size: 9.5px; color: var(--fg-faint); letter-spacing: 0.16em;
    text-transform: uppercase; margin-bottom: 6px;
  }
  .noc .cv-head .summary {
    display: flex; gap: 22px; font-size: 10px; color: var(--fg-soft);
    letter-spacing: 0.08em; text-transform: uppercase;
  }
  .noc .cv-head .summary b { color: var(--amber); font-weight: 500;
    font-size: 14px; margin-right: 4px; letter-spacing: 0; }

  /* Section heading */
  .noc .cv-sec { margin-top: 4px; font-size: 10px; color: var(--fg-faint);
    letter-spacing: 0.18em; text-transform: uppercase;
    display: flex; align-items: center; gap: 10px; }
  .noc .cv-sec::after { content:''; flex:1; height:1px; background: var(--rule); }

  /* Switch / hub panel */
  .noc .cv-switches { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  .noc .cv-switch {
    border: 1px solid var(--rule-2); background: var(--bg-2);
    padding: 14px 16px 16px; position: relative;
  }
  .noc .cv-switch.full { grid-column: 1 / -1; }
  .noc .cv-switch .meta {
    display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; margin-bottom: 4px;
  }
  .noc .cv-switch .nm {
    font-size: 14px; color: var(--amber);
    font-family: 'JetBrains Mono', monospace; letter-spacing: 0.02em;
  }
  .noc .cv-switch .id {
    font-size: 9.5px; color: var(--fg-faint); letter-spacing: 0.14em;
    text-transform: uppercase;
  }
  .noc .cv-switch .kind {
    margin-left: auto; font-size: 9px; padding: 2px 7px;
    border: 1px solid var(--rule-2); color: var(--fg-soft);
    letter-spacing: 0.1em; text-transform: uppercase;
  }
  .noc .cv-switch .kind.on  { color: var(--ok); border-color: rgba(121,221,176,0.4); }
  .noc .cv-switch .kind.off { color: var(--err); border-color: rgba(232,122,106,0.4); }
  .noc .cv-switch .model {
    font-size: 10.5px; color: var(--fg-soft);
    font-family: 'JetBrains Mono', monospace; margin-bottom: 10px;
  }
  .noc .cv-switch .model .sep { color: var(--fg-faint); margin: 0 8px; }

  /* Rack-style port strip */
  .noc .cv-ports {
    display: grid; gap: 8px; margin-top: 8px;
  }
  .noc .cv-port {
    border: 1px solid var(--rule); background: #0e1116;
    padding: 7px 8px 8px;
    display: flex; flex-direction: column; gap: 3px;
    position: relative; min-height: 70px;
  }
  .noc .cv-port .pn {
    font-size: 9px; color: var(--fg-faint); letter-spacing: 0.1em;
    display: flex; justify-content: space-between; align-items: center;
  }
  .noc .cv-port .led {
    width: 6px; height: 6px; border-radius: 50%;
    background: transparent; border: 1px solid var(--rule-2);
  }
  .noc .cv-port .led.on  { background: var(--ok); border-color: var(--ok);
    box-shadow: 0 0 6px var(--ok); }
  .noc .cv-port .led.up  { background: var(--amber); border-color: var(--amber);
    box-shadow: 0 0 6px var(--amber); }
  .noc .cv-port .led.off { background: transparent; border: 1px solid var(--err); }
  .noc .cv-port .dev {
    font-size: 10.5px; color: var(--fg); font-family: 'JetBrains Mono', monospace;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .noc .cv-port .cbl {
    font-size: 9px; color: var(--fg-faint); letter-spacing: 0.06em;
    font-family: 'JetBrains Mono', monospace;
  }
  .noc .cv-port.empty .dev { color: var(--fg-faint); font-style: italic; }
  .noc .cv-port.empty .cbl { color: transparent; }
  .noc .cv-port.uplink { border-color: rgba(240,182,87,0.4); background: #161208; }
  .noc .cv-port.uplink .pn { color: var(--amber); }
  .noc .cv-port:hover:not(.empty) { border-color: var(--amber); cursor: pointer; }
  .noc .cv-port.sel { border-color: var(--amber); background: #1d1a12; }

  .noc .cv-switch .footline {
    display: flex; justify-content: space-between; align-items: center;
    margin-top: 10px; padding-top: 8px; border-top: 1px dotted var(--rule);
    font-size: 9.5px; color: var(--fg-faint);
    letter-spacing: 0.08em; text-transform: uppercase;
  }
  .noc .cv-switch .footline b { color: var(--ok); font-weight: 500; }

  /* No-LAN hubs (radio only) */
  .noc .cv-switch.radio .cv-ports { display: none; }
  .noc .cv-switch.radio .radio-line {
    font-size: 10.5px; color: var(--fg-soft);
    font-family: 'JetBrains Mono', monospace;
    padding: 16px 0; border: 1px dashed var(--rule-2);
    text-align: center; letter-spacing: 0.08em;
  }
  .noc .cv-switch.radio .radio-line b { color: var(--amber); }

  /* Cable table */
  .noc .cv-table-wrap {
    border: 1px solid var(--rule-2); background: var(--bg-2);
    overflow: hidden;
  }
  .noc .cv-cables {
    width: 100%; border-collapse: collapse;
    font-family: 'JetBrains Mono', monospace; font-size: 11px;
  }
  .noc .cv-cables th {
    text-align: left; padding: 8px 12px; background: #0e1116;
    color: var(--fg-faint); font-size: 9.5px; letter-spacing: 0.12em;
    text-transform: uppercase; font-weight: 400;
    border-bottom: 1px solid var(--rule);
  }
  .noc .cv-cables td {
    padding: 7px 12px; border-bottom: 1px dotted var(--rule);
    vertical-align: middle; color: var(--fg);
  }
  .noc .cv-cables tr:last-child td { border-bottom: 0; }
  .noc .cv-cables tr:hover td { background: rgba(240, 182, 87, 0.04); }
  .noc .cv-cables .cid { color: var(--amber); }
  .noc .cv-cables .cat-pill {
    display: inline-block; padding: 1px 6px; font-size: 9.5px;
    border: 1px solid var(--rule-2); letter-spacing: 0.06em;
    color: var(--fg-soft);
  }
  .noc .cv-cables .cat-pill.c6  { color: #79ddb0; border-color: rgba(121,221,176,0.4); }
  .noc .cv-cables .cat-pill.c6a { color: #6ec3ff; border-color: rgba(110,195,255,0.4); }
  .noc .cv-cables .cat-pill.c5e { color: var(--fg-soft); }
  .noc .cv-cables .swatch {
    display: inline-flex; align-items: center; gap: 6px;
    font-size: 10.5px; color: var(--fg);
  }
  .noc .cv-cables .swatch .dot {
    width: 10px; height: 10px; border-radius: 50%;
    border: 1px solid var(--rule-2);
  }
  .noc .cv-cables .endpoint {
    color: var(--fg); font-size: 10.5px;
  }
  .noc .cv-cables .endpoint .port {
    color: var(--fg-faint); font-size: 9.5px; margin-left: 4px;
  }
  .noc .cv-cables .endpoint .arrow {
    color: var(--fg-faint); margin: 0 6px;
  }
  .noc .cv-cables .nt {
    color: var(--fg-soft); font-size: 10px;
  }

  /* Add-cable form */
  .noc .cv-add {
    border: 1px solid var(--amber); background: var(--bg-2);
    padding: 14px 16px 16px; position: relative;
  }
  .noc .cv-add::before {
    content: '+ ADD CABLE'; position: absolute; top: -7px; left: 12px;
    background: var(--bg-2); padding: 0 6px; font-size: 9.5px; color: var(--amber);
    letter-spacing: 0.14em;
  }
  .noc .cv-add-grid {
    display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px 12px;
    margin-top: 4px;
  }
  .noc .cv-field { display: flex; flex-direction: column; gap: 3px; }
  .noc .cv-field label {
    font-size: 9px; color: var(--fg-faint); letter-spacing: 0.12em;
    text-transform: uppercase;
  }
  .noc .cv-field input, .noc .cv-field select, .noc .cv-field textarea {
    appearance: none; -webkit-appearance: none;
    background: #0e1116; border: 1px solid var(--rule-2);
    color: var(--fg); font: inherit;
    font-family: 'JetBrains Mono', monospace; font-size: 11px;
    padding: 6px 9px; border-radius: 2px;
    outline: none;
  }
  .noc .cv-field input:focus, .noc .cv-field select:focus, .noc .cv-field textarea:focus {
    border-color: var(--amber);
  }
  .noc .cv-field select {
    background-image: linear-gradient(45deg, transparent 50%, var(--fg-faint) 50%),
                      linear-gradient(135deg, var(--fg-faint) 50%, transparent 50%);
    background-position: calc(100% - 14px) 50%, calc(100% - 10px) 50%;
    background-size: 4px 4px, 4px 4px;
    background-repeat: no-repeat; padding-right: 24px;
  }
  .noc .cv-field.full { grid-column: 1 / -1; }
  .noc .cv-add .actions {
    display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px;
    padding-top: 10px; border-top: 1px dotted var(--rule);
  }
  .noc .cv-btn {
    appearance: none; background: transparent; color: var(--fg-soft);
    border: 1px solid var(--rule-2); padding: 5px 14px; font: inherit;
    font-family: 'JetBrains Mono', monospace; font-size: 10.5px;
    letter-spacing: 0.08em; text-transform: uppercase; cursor: pointer;
    border-radius: 2px;
  }
  .noc .cv-btn:hover { background: var(--bg-3); color: var(--fg); }
  .noc .cv-btn.primary { background: var(--amber); color: #1a1206;
    border-color: var(--amber); font-weight: 500; }
  .noc .cv-btn.primary:hover { background: #ffc972; }
  .noc .cv-back {
    appearance: none; background: transparent; color: var(--fg-soft);
    border: 1px solid var(--rule-2); padding: 3px 10px; font: inherit;
    font-family: 'JetBrains Mono', monospace; font-size: 10px;
    letter-spacing: 0.08em; text-transform: uppercase; cursor: pointer;
    border-radius: 2px;
  }
  .noc .cv-back:hover { background: var(--bg-3); color: var(--amber); }

  /* Inline cable-row "just added" pulse */
  @keyframes flashRow {
    0% { background: rgba(240,182,87,0.30); }
    100% { background: transparent; }
  }
  .noc .cv-cables tr.fresh td { animation: flashRow 2.2s ease-out; }
  `;

  const CAT_OPTIONS = ['Cat5e', 'Cat6', 'Cat6a', 'Cat7', 'Cat8'];
  const COLOR_OPTIONS = [
    { v:'gray',   hex:'#888c95' },
    { v:'black',  hex:'#202225' },
    { v:'white',  hex:'#e8e6df' },
    { v:'blue',   hex:'#4f8ad6' },
    { v:'red',    hex:'#cf5a4d' },
    { v:'yellow', hex:'#d8b34e' },
    { v:'green',  hex:'#5fa56e' },
    { v:'orange', hex:'#d28148' },
  ];
  const colorHex = (name) =>
    (COLOR_OPTIONS.find(c => c.v === name) || { hex:'#5a606b' }).hex;

  // Build the union endpoint list (every device + every switch/hub)
  // Dedupe by id — when a device and a switch share an id (e.g. Hue/Aqara
  // appear in both DEVICES and SWITCHES), prefer the SWITCHES entry since
  // it represents the physical patch point.
  function allEndpoints() {
    const seen = new Set();
    const out = [];
    SWITCHES.forEach(s => {
      seen.add(s.id);
      out.push({ id:s.id, name:s.name, kind:'switch', online:s.online });
    });
    DEVICES.forEach(d => {
      if (seen.has(d.id)) return;
      out.push({ id:d.id, name:d.name, kind:'device', online:d.online });
    });
    return out.sort((x, y) => x.name.localeCompare(y.name));
  }

  function CablesView({ tweaks, onBack }) {
    const [cables, setCables] = React.useState(CABLES);
    const [freshId, setFreshId] = React.useState(null);
    const [form, setForm] = React.useState({
      fromDev:'sw-main', fromPort:'', toDev:'', toPort:'',
      cat:'Cat6', len:'', color:'gray', jacket:'UTP', notes:''
    });

    const endpoints = React.useMemo(() => allEndpoints(), []);
    const polling = tweaks?.polling ?? '5min';

    // ─ Totals ─
    const totalLen = cables
      .map(c => parseFloat(c.len) || 0)
      .reduce((a, b) => a + b, 0);

    function setF(k, v) { setForm(f => ({ ...f, [k]: v })); }

    function handleAdd() {
      if (!form.fromDev || !form.toDev) return;
      const nextNum = cables.length + 1;
      const id = 'CBL-' + String(nextNum).padStart(2, '0');
      const cable = {
        id, ...form,
        fromPort: form.fromPort || '—',
        toPort:   form.toPort   || '—',
        len:      form.len      || '— m',
      };
      setCables(cs => [...cs, cable]);
      setFreshId(id);
      setForm(f => ({
        ...f, fromPort:'', toDev:'', toPort:'', len:'', notes:''
      }));
      setTimeout(() => setFreshId(null), 2400);
    }

    // ─ Layout: derive switch port slots in order ─
    function portSlots(sw) {
      const out = [];
      for (let p = 1; p <= sw.portCount; p++) {
        const slot = sw.portMap?.[p] || null;
        const cable = slot ? cables.find(c => c.id === slot.cable) : null;
        out.push({ p, slot, cable });
      }
      return out;
    }

    return (
      <div className="noc">
        <style dangerouslySetInnerHTML={{__html: C_CSS}} />

        {/* re-use NOC header / sidebar / footer chrome */}
        <div className="n-head">
          <div className="brand"><span className="dot" /> <b>HOMENET / NOC</b></div>
          <div className="crumbs">
            {onBack && <button className="cv-back" onClick={onBack}>← map</button>}
            &nbsp;&nbsp;<span>cables &amp; switches</span>
          </div>
          <div className="right">
            <span>poll · <b style={{color:'var(--amber)'}}>{polling}</b></span>
            <span>switches <b style={{color:'var(--amber)'}}>{SWITCHES.length}</b></span>
            <span>cables <b style={{color:'var(--amber)'}}>{cables.length}</b></span>
          </div>
        </div>

        <aside className="n-left">
          <div className="ltitle">Switches &amp; Hubs · {SWITCHES.length}</div>
          {SWITCHES.map(sw => (
            <div key={sw.id} className="lrow">
              <span className={`lstat ${sw.online?'on':'off'}`} />
              <span className="lname">{sw.name}</span>
              <span className="lip">{sw.portCount > 0 ? sw.portCount + 'p' : 'rf'}</span>
            </div>
          ))}
          <div className="ltitle" style={{marginTop:10}}>Cables · {cables.length}</div>
          {cables.map(c => (
            <div key={c.id} className="lrow">
              <span className="lstat" style={{
                background: colorHex(c.color),
                border: c.color === 'white' ? '1px solid var(--rule-2)' : 0,
                boxShadow: 'none'
              }} />
              <span className="lname">{c.id}</span>
              <span className="lip">{c.cat}</span>
            </div>
          ))}
        </aside>

        <div className="cv-main">
          <div className="cv-head">
            <div>
              <div className="eyebrow">physical · l1 / l2</div>
              <div className="ttl">CABLES &amp; SWITCHES</div>
            </div>
            <div className="summary">
              <span><b>{SWITCHES.filter(s => s.portCount > 0).length}</b> switch</span>
              <span><b>{SWITCHES.filter(s => s.portCount === 0).length}</b> wireless hub</span>
              <span><b>{cables.length}</b> cables</span>
              <span><b>{totalLen.toFixed(1)}</b> m total</span>
            </div>
          </div>

          {/* ─── Switches & hubs ─── */}
          <div className="cv-sec">switches &amp; hubs</div>
          <div className="cv-switches">
            {SWITCHES.map(sw => {
              const isRadio = sw.portCount === 0;
              const used = Object.values(sw.portMap || {}).filter(Boolean).length;
              return (
                <div key={sw.id}
                  className={`cv-switch ${isRadio ? 'radio' : ''} ${sw.portCount > 5 ? 'full' : ''}`}>
                  <div className="meta">
                    <span className="nm">{sw.name}</span>
                    <span className="id">{sw.id}</span>
                    <span className={`kind ${sw.online?'on':'off'}`}>
                      {sw.type} · {sw.speed}
                    </span>
                  </div>
                  <div className="model">
                    {sw.model}<span className="sep">·</span>{sw.location}
                    {sw.managed
                      ? <><span className="sep">·</span>managed</>
                      : <><span className="sep">·</span>unmanaged</>}
                  </div>

                  {isRadio ? (
                    <div className="radio-line">
                      no LAN ports <span style={{color:'var(--fg-faint)'}}>·</span>{' '}
                      <b>{sw.radio}</b>
                    </div>
                  ) : (
                    <div className="cv-ports" style={{
                      gridTemplateColumns: `repeat(${sw.portCount}, 1fr)`
                    }}>
                      {portSlots(sw).map(({p, slot, cable}) => {
                        const dev = slot
                          ? DEVICES.find(d => d.id === slot.device)
                            || SWITCHES.find(s => s.id === slot.device)
                          : null;
                        const isUplink = slot?.role === 'uplink';
                        const isEmpty = !slot;
                        const onOff = dev ? (dev.online ? 'on' : 'off') : '';
                        return (
                          <div key={p}
                            className={`cv-port ${isEmpty ? 'empty' : ''} ${isUplink ? 'uplink' : ''}`}>
                            <div className="pn">
                              <span>P{String(p).padStart(2,'0')}</span>
                              <span className={`led ${isEmpty ? '' : (isUplink ? 'up' : onOff)}`} />
                            </div>
                            <div className="dev">
                              {dev ? dev.name : '— empty —'}
                            </div>
                            <div className="cbl">
                              {cable
                                ? `${cable.id} · ${cable.cat} · ${cable.len}`
                                : ''}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div className="footline">
                    <span>
                      {isRadio
                        ? <>{sw.notes}</>
                        : <>ports {used}/{sw.portCount} in use</>}
                    </span>
                    <span><b>{sw.online ? 'online' : 'offline'}</b></span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* ─── Cable inventory ─── */}
          <div className="cv-sec">cable inventory · {cables.length}</div>
          <div className="cv-table-wrap">
            <table className="cv-cables">
              <thead>
                <tr>
                  <th style={{width:70}}>id</th>
                  <th style={{width:70}}>category</th>
                  <th style={{width:60}}>length</th>
                  <th style={{width:90}}>color</th>
                  <th>from</th>
                  <th>to</th>
                  <th style={{width:60}}>jacket</th>
                  <th>notes</th>
                </tr>
              </thead>
              <tbody>
                {cables.map(c => {
                  const catCls = c.cat === 'Cat6' ? 'c6'
                    : c.cat === 'Cat6a' ? 'c6a'
                    : c.cat === 'Cat5e' ? 'c5e' : '';
                  return (
                    <tr key={c.id} className={freshId === c.id ? 'fresh' : ''}>
                      <td className="cid">{c.id}</td>
                      <td><span className={`cat-pill ${catCls}`}>{c.cat}</span></td>
                      <td>{c.len}</td>
                      <td>
                        <span className="swatch">
                          <span className="dot" style={{background: colorHex(c.color)}} />
                          {c.color}
                        </span>
                      </td>
                      <td className="endpoint">
                        {deviceName(c.fromDev)}
                        <span className="port">:{c.fromPort}</span>
                      </td>
                      <td className="endpoint">
                        {deviceName(c.toDev)}
                        <span className="port">:{c.toPort}</span>
                      </td>
                      <td>{c.jacket}</td>
                      <td className="nt">{c.notes}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* ─── Add cable form ─── */}
          <div className="cv-add">
            <div className="cv-add-grid">
              <div className="cv-field">
                <label>from device</label>
                <select value={form.fromDev} onChange={e => setF('fromDev', e.target.value)}>
                  <option value="">— choose —</option>
                  {endpoints.map(e => (
                    <option key={'f:'+e.kind+':'+e.id} value={e.id}>{e.name}</option>
                  ))}
                </select>
              </div>
              <div className="cv-field">
                <label>from port</label>
                <input type="text" placeholder="e.g. 4 / eth0 / lan1"
                  value={form.fromPort}
                  onChange={e => setF('fromPort', e.target.value)} />
              </div>
              <div className="cv-field">
                <label>to device</label>
                <select value={form.toDev} onChange={e => setF('toDev', e.target.value)}>
                  <option value="">— choose —</option>
                  {endpoints.map(e => (
                    <option key={'t:'+e.kind+':'+e.id} value={e.id}>{e.name}</option>
                  ))}
                </select>
              </div>
              <div className="cv-field">
                <label>to port</label>
                <input type="text" placeholder="e.g. eth0 / lan"
                  value={form.toPort}
                  onChange={e => setF('toPort', e.target.value)} />
              </div>

              <div className="cv-field">
                <label>category</label>
                <select value={form.cat} onChange={e => setF('cat', e.target.value)}>
                  {CAT_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="cv-field">
                <label>length (m)</label>
                <input type="text" placeholder="e.g. 2 m"
                  value={form.len}
                  onChange={e => setF('len', e.target.value)} />
              </div>
              <div className="cv-field">
                <label>color</label>
                <select value={form.color} onChange={e => setF('color', e.target.value)}>
                  {COLOR_OPTIONS.map(c => <option key={c.v} value={c.v}>{c.v}</option>)}
                </select>
              </div>
              <div className="cv-field">
                <label>jacket</label>
                <select value={form.jacket} onChange={e => setF('jacket', e.target.value)}>
                  <option value="UTP">UTP</option>
                  <option value="STP">STP</option>
                  <option value="SFTP">SFTP</option>
                </select>
              </div>

              <div className="cv-field full">
                <label>notes</label>
                <input type="text"
                  placeholder="e.g. In-wall run from rack to desk"
                  value={form.notes}
                  onChange={e => setF('notes', e.target.value)} />
              </div>
            </div>
            <div className="actions">
              <button className="cv-btn" onClick={() => setForm({
                fromDev:'sw-main', fromPort:'', toDev:'', toPort:'',
                cat:'Cat6', len:'', color:'gray', jacket:'UTP', notes:''
              })}>clear</button>
              <button className="cv-btn primary" onClick={handleAdd}>
                + register cable
              </button>
            </div>
          </div>
        </div>

        <div className="n-foot">
          <span><b>{SWITCHES.filter(s => s.portCount > 0).length}</b> switch</span>
          <span><b>{SWITCHES.filter(s => s.portCount === 0).length}</b> wireless hub</span>
          <span><b>{cables.length}</b> cables</span>
          <span><b>{totalLen.toFixed(1)} m</b> total</span>
          <span className="right">B · NOC · cables &amp; switches</span>
        </div>
      </div>
    );
  }

  window.CablesView = CablesView;
})();
