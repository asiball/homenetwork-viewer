// variant-card.jsx — Variation C · Index Card / Catalog
// Library-catalog metaphor. Each device is a numbered specimen. Details
// surface as a 3×5 index card pinned at the bottom of the canvas.

(() => {
  const C_CSS = `
  .catalog {
    --paper:    oklch(0.95 0.012 88);
    --paper-2:  oklch(0.91 0.018 86);
    --rule:     oklch(0.78 0.025 80);
    --rule-2:   oklch(0.65 0.03 80);
    --ink:      oklch(0.24 0.018 60);
    --ink-soft: oklch(0.42 0.02 60);
    --ink-faint:oklch(0.62 0.02 60);
    --stamp:    oklch(0.52 0.18 28);
    --stamp-blue: oklch(0.42 0.10 250);
    color: var(--ink);
    background:
      radial-gradient(ellipse at top, oklch(0.96 0.014 88) 0%, var(--paper) 70%),
      var(--paper);
    background-image:
      repeating-linear-gradient(0deg, transparent 0 23px, oklch(0.78 0.025 80 / 0.18) 23px 24px);
    font-family: 'iA Writer Quattro', 'Söhne', 'Helvetica Neue', system-ui, sans-serif;
    font-size: 12px; line-height: 1.5;
    width: 100%; height: 100%;
    display: grid;
    grid-template-rows: auto 1fr auto;
    position: relative;
    overflow: hidden;
  }
  .catalog .serif { font-family: 'DM Serif Display', 'Iowan Old Style', Georgia, serif; font-weight: 400; }
  .catalog .typew { font-family: 'JetBrains Mono', 'Courier Prime', ui-monospace, monospace; }

  /* slight torn-edge feel */
  .catalog::before {
    content: ''; position: absolute; inset: 0;
    background-image:
      radial-gradient(circle at 12% 18%, oklch(0.85 0.04 60 / 0.18), transparent 8%),
      radial-gradient(circle at 85% 75%, oklch(0.85 0.04 70 / 0.12), transparent 9%);
    pointer-events: none;
  }

  .catalog .c-head { padding: 18px 32px 12px; border-bottom: 1.5px double var(--rule);
    display: flex; align-items: baseline; gap: 24px; position: relative; z-index: 1; }
  .catalog .c-head .mast { font-size: 30px; line-height: 1; letter-spacing: 0.01em; }
  .catalog .c-head .mast .amp { color: var(--stamp); font-style: italic; }
  .catalog .c-head .est { font-family: 'JetBrains Mono', monospace; font-size: 10px;
    color: var(--ink-soft); letter-spacing: 0.08em; text-transform: uppercase; }
  .catalog .c-head .right { margin-left: auto; text-align: right; font-family: 'JetBrains Mono', monospace;
    font-size: 10px; color: var(--ink-soft); letter-spacing: 0.04em; }
  .catalog .c-head .stamp {
    position: absolute; right: 32px; top: 14px;
    border: 1.5px solid var(--stamp); color: var(--stamp);
    padding: 4px 9px; font-family: 'JetBrains Mono', monospace; font-size: 10.5px;
    letter-spacing: 0.16em; text-transform: uppercase;
    transform: rotate(-4deg); opacity: 0.78;
    border-radius: 2px;
  }

  .catalog .c-main { display: grid; grid-template-columns: 1fr 380px;
    position: relative; z-index: 1; }
  .catalog .c-map { position: relative; padding: 16px 24px 16px 32px; }
  .catalog .c-map svg { display: block; width: 100%; height: auto; max-height: 100%; }

  .catalog .ring { fill: none; stroke: var(--rule); stroke-width: 0.6; }
  .catalog .ring.outer { stroke-dasharray: 1 5; opacity: 0.6; }
  .catalog .link { stroke: var(--ink-soft); stroke-width: 0.6; fill: none; opacity: 0.5; }
  .catalog .link.off { stroke-dasharray: 2 3; opacity: 0.3; }
  .catalog .link.sel { stroke: var(--stamp); stroke-width: 1.5; opacity: 1; }
  .catalog .num-circle { fill: var(--paper); stroke: var(--ink); stroke-width: 1.1; }
  .catalog .num-circle.off { stroke: var(--ink-faint); }
  .catalog .num-circle.sel { fill: var(--stamp); stroke: var(--stamp); }
  .catalog .num-circle.center { fill: var(--ink); stroke: var(--ink); }
  .catalog .num-text { font-family: 'JetBrains Mono', monospace; font-size: 9px;
    fill: var(--ink); font-feature-settings: "tnum"; }
  .catalog .num-text.sel { fill: var(--paper); }
  .catalog .num-text.center { fill: var(--paper); font-size: 8px; letter-spacing: 0.14em; }
  .catalog .leaf-label { font-family: 'JetBrains Mono', monospace; font-size: 9px;
    fill: var(--ink-soft); letter-spacing: 0.02em; }
  .catalog .leaf-label.sel { fill: var(--stamp); font-weight: 600; }
  .catalog .leaf-cat { font-family: 'DM Serif Display', Georgia, serif; font-size: 13px;
    fill: var(--ink-faint); letter-spacing: 0.04em; font-style: italic; }
  .catalog .hit { fill: transparent; cursor: pointer; }
  .catalog .pulse { fill: var(--stamp); opacity: 0.15; }

  /* Right-side roster (alphabetical catalog) */
  .catalog .c-roster { border-left: 1.5px double var(--rule); padding: 18px 26px 18px 26px;
    background: linear-gradient(90deg, oklch(0.88 0.025 80 / 0.18) 0 4px, transparent 4px);
    overflow-y: auto; max-height: 100%; }
  .catalog .c-roster h3 { font-family: 'DM Serif Display', Georgia, serif; font-size: 16px;
    margin: 0 0 4px; font-weight: 400; }
  .catalog .c-roster .sub { font-family: 'JetBrains Mono', monospace; font-size: 9.5px;
    color: var(--ink-soft); letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 14px; }
  .catalog .c-roster table { width: 100%; border-collapse: collapse; }
  .catalog .c-roster th { text-align: left; padding: 4px 6px 6px; font-family: 'JetBrains Mono', monospace;
    font-size: 9px; color: var(--ink-faint); letter-spacing: 0.1em; text-transform: uppercase;
    border-bottom: 1px solid var(--rule); font-weight: 400; }
  .catalog .c-roster td { padding: 4px 6px; font-family: 'JetBrains Mono', monospace; font-size: 10.5px;
    border-bottom: 1px dotted var(--rule); cursor: pointer; }
  .catalog .c-roster tr:hover td { background: oklch(0.93 0.018 80); }
  .catalog .c-roster tr.sel td { background: oklch(0.91 0.04 60); }
  .catalog .c-roster tr.sel td:first-child { box-shadow: inset 3px 0 0 var(--stamp); }
  .catalog .c-roster td.num { color: var(--ink-faint); width: 26px; font-variant-numeric: tabular-nums; }
  .catalog .c-roster td.nm { font-family: 'iA Writer Quattro', system-ui, sans-serif; }
  .catalog .c-roster td.s { width: 18px; text-align: center; }
  .catalog .c-roster .dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%;
    background: var(--ink); }
  .catalog .c-roster .dot.off { background: transparent; border: 1px solid var(--ink-faint); }
  .catalog .c-roster .dot.on { background: oklch(0.62 0.14 145); }

  /* Bottom index card */
  .catalog .c-card-zone { padding: 18px 32px 22px; position: relative; z-index: 1;
    border-top: 1.5px double var(--rule);
    background: repeating-linear-gradient(0deg, transparent 0 23px, oklch(0.78 0.025 80 / 0.18) 23px 24px); }
  .catalog .index-card {
    background: oklch(0.99 0.005 88);
    border: 1px solid var(--rule-2);
    box-shadow: 0 1px 0 oklch(0.85 0.02 80), 0 8px 24px oklch(0.5 0.02 60 / 0.12),
                inset 0 0 0 6px var(--paper-2), inset 0 0 0 7px var(--rule);
    border-radius: 4px;
    padding: 22px 28px 18px 100px;
    min-height: 180px;
    position: relative;
    transform: rotate(-0.3deg);
    background-image:
      linear-gradient(90deg, oklch(0.85 0.04 28 / 0.55) 0 1px, transparent 1px 100%),
      repeating-linear-gradient(0deg, transparent 0 22px, oklch(0.78 0.04 240 / 0.35) 22px 23px);
    background-position: 84px 0, 0 26px;
    background-repeat: no-repeat, repeat;
  }
  .catalog .index-card .punch { position: absolute; left: 50px; top: 50%;
    width: 14px; height: 14px; border-radius: 50%;
    background: var(--paper); box-shadow: inset 0 1px 2px oklch(0.45 0.02 60 / 0.35);
    transform: translateY(-50%); }
  .catalog .index-card .corner-no {
    position: absolute; left: 12px; top: 10px; font-family: 'JetBrains Mono', monospace;
    font-size: 10px; color: var(--ink-soft); letter-spacing: 0.08em; }
  .catalog .index-card .stamp-no {
    position: absolute; right: 18px; top: 10px;
    border: 1.5px solid var(--stamp-blue); color: var(--stamp-blue);
    padding: 3px 8px; font-family: 'JetBrains Mono', monospace; font-size: 10px;
    letter-spacing: 0.14em; transform: rotate(2deg); opacity: 0.78;
  }
  .catalog .index-card .cat-name {
    font-family: 'DM Serif Display', Georgia, serif; font-size: 22px; line-height: 1.1;
    letter-spacing: -0.005em;
  }
  .catalog .index-card .cat-host {
    font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--ink-soft);
    margin-top: 2px;
  }
  .catalog .index-card .cat-grid {
    margin-top: 12px;
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 10px 28px;
  }
  .catalog .index-card .field { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
  .catalog .index-card .field label {
    font-family: 'JetBrains Mono', monospace; font-size: 8.5px; color: var(--ink-faint);
    letter-spacing: 0.14em; text-transform: uppercase;
  }
  .catalog .index-card .field .v {
    font-family: 'JetBrains Mono', monospace; font-size: 11.5px; color: var(--ink);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .catalog .index-card .field .v.large {
    font-family: 'DM Serif Display', Georgia, serif; font-size: 16px;
    white-space: normal;
  }
  .catalog .index-card .cat-notes {
    margin-top: 12px;
    font-family: 'iA Writer Quattro', 'Söhne', system-ui, sans-serif;
    font-size: 12px; color: var(--ink);
    font-style: italic;
    border-top: 1px dotted var(--rule);
    padding-top: 8px;
  }
  .catalog .index-card .cat-notes::before {
    content: 'note —'; font-style: normal; color: var(--ink-faint);
    font-family: 'JetBrains Mono', monospace; font-size: 9px; letter-spacing: 0.12em;
    text-transform: uppercase; margin-right: 6px;
  }
  `;

  function CatalogVariant({ tweaks }) {
    const [sel, setSel] = React.useState('atv');
    const showOffline = tweaks?.showOffline ?? true;
    const density = tweaks?.density ?? 'regular';
    const compact = density === 'compact';

    const visible = DEVICES.filter(d => showOffline || d.online);
    const selected = visible.find(d => d.id === sel) || visible[0];

    const W = 760, H = 420;
    const cx = W/2 - 40, cy = H/2;
    const r1 = compact ? 70 : 80;
    const r2 = compact ? 165 : 180;
    const leaves = visible.filter(d => d.ring === 2);
    const totalLeaves = leaves.length;

    const placed = visible.map(d => {
      let dd = d;
      if (d.ring === 2) {
        const newIdx = leaves.findIndex(x => x.id === d.id);
        dd = { ...d, idx: newIdx };
      }
      return { ...d, pos: layoutOf(dd, { cx, cy, r1, r2, leafStart: 9, totalLeaves }) };
    });
    const center = placed.find(d => d.ring === 0);

    // Catalog numbering: 001..NNN in DEVICES order, padded.
    const numFor = (id) => {
      const i = DEVICES.findIndex(d => d.id === id);
      return String(i + 1).padStart(3, '0');
    };

    const selNum = numFor(selected.id);

    // Sort roster: by group then name
    const roster = [...visible].sort((a, b) => {
      const ga = GROUP_ORDER.indexOf(a.group), gb = GROUP_ORDER.indexOf(b.group);
      if (ga !== gb) return ga - gb;
      return a.name.localeCompare(b.name);
    });

    return (
      <div className="catalog">
        <style dangerouslySetInnerHTML={{__html: C_CSS}} />

        <div className="c-head">
          <div>
            <div className="serif mast">Catalog <span className="amp">&amp;</span> Roster</div>
            <div className="est">est. 2024 · home archive · vol. iii</div>
          </div>
          <div className="right">
            shelf · 192.168.1.0/24<br/>
            entries · {DEVICES.length} &nbsp; updated · 2026·05·18
          </div>
          <div className="stamp">scanned · {DEVICES.length}</div>
        </div>

        <div className="c-main">
          <div className="c-map">
            <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">
              <circle className="ring" cx={cx} cy={cy} r={r1} />
              <circle className="ring outer" cx={cx} cy={cy} r={r2} />

              {/* category labels in italic serif around the outside */}
              {[
                { g:'IoT',      a: 35 },
                { g:'Media',    a: 110 },
                { g:'Mobile',   a: 195 },
                { g:'Computer', a: 275 },
                { g:'Misc',     a: 340 },
              ].map(({g,a}) => {
                const p = polar(a, r2 + 26, cx, cy);
                return <text key={g} className="leaf-cat" x={p.x} y={p.y} textAnchor="middle">{g.toLowerCase()}</text>;
              })}

              {/* links */}
              {placed.filter(d => d.ring !== 0).map(d => (
                <line key={'l'+d.id}
                  className={`link ${!d.online?'off':''} ${d.id===sel?'sel':''}`}
                  x1={center.pos.x} y1={center.pos.y} x2={d.pos.x} y2={d.pos.y} />
              ))}

              {/* selected pulse */}
              {(() => {
                const p = placed.find(x => x.id === sel);
                if (!p) return null;
                return <circle className="pulse" cx={p.pos.x} cy={p.pos.y} r={16} />;
              })()}

              {/* nodes */}
              {placed.map(d => {
                const isSel = d.id === sel;
                const isCenter = d.ring === 0;
                const r = isCenter ? 13 : isSel ? 11 : d.ring === 1 ? 10 : 9;
                let lx = d.pos.x, ly = d.pos.y, anchor='middle';
                if (d.ring === 2) {
                  const a = (d.idx * (360/totalLeaves) + 9) % 360;
                  const out = polar(a, r2 + 12, cx, cy);
                  lx = out.x; ly = out.y;
                  if (d.pos.x > cx + 4) anchor = 'start';
                  else if (d.pos.x < cx - 4) anchor = 'end';
                }
                const cls = `num-circle ${!d.online?'off':''} ${isSel?'sel':''} ${isCenter?'center':''}`;
                const tcls = `num-text ${isSel?'sel':''} ${isCenter?'center':''}`;
                return (
                  <g key={d.id} onClick={() => setSel(d.id)} style={{ cursor: 'pointer' }}>
                    <circle className="hit" cx={d.pos.x} cy={d.pos.y} r={16} />
                    <circle className={cls} cx={d.pos.x} cy={d.pos.y} r={r} />
                    <text className={tcls} x={d.pos.x} y={d.pos.y+3} textAnchor="middle">
                      {isCenter ? 'GW' : numFor(d.id)}
                    </text>
                    {!isCenter && (
                      <text className={`leaf-label ${isSel?'sel':''}`}
                        x={lx} y={ly} textAnchor={anchor} dy={3}>
                        {d.name.length > 16 ? d.name.slice(0, 14) + '…' : d.name}
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
          </div>

          <div className="c-roster">
            <h3>Roster</h3>
            <div className="sub">by category · {visible.length} entries</div>
            <table>
              <thead>
                <tr>
                  <th></th>
                  <th>№</th>
                  <th>name</th>
                  <th>ip</th>
                </tr>
              </thead>
              <tbody>
                {roster.map(d => (
                  <tr key={d.id} className={d.id===sel?'sel':''} onClick={() => setSel(d.id)}>
                    <td className="s"><span className={`dot ${d.online?'on':'off'}`} /></td>
                    <td className="num">{numFor(d.id)}</td>
                    <td className="nm">{d.name}</td>
                    <td>.{d.ip.split('.').pop()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="c-card-zone">
          <div className="index-card">
            <div className="punch" />
            <div className="corner-no">№ {selNum} · {selected.group.toUpperCase()}</div>
            <div className="stamp-no">{selected.online ? 'ONLINE' : 'OFFLINE'} · {selected.last}</div>

            <div className="cat-name">{selected.name}</div>
            <div className="cat-host">{selected.host} &nbsp;·&nbsp; {selected.ip}</div>

            <div className="cat-grid">
              <div className="field">
                <label>processor</label>
                <div className="v" title={selected.cpu}>{selected.cpu}</div>
              </div>
              <div className="field">
                <label>memory</label>
                <div className="v">{selected.mem}</div>
              </div>
              <div className="field">
                <label>storage</label>
                <div className="v" title={selected.storage}>{selected.storage}</div>
              </div>
              <div className="field">
                <label>mac</label>
                <div className="v">{selected.mac}</div>
              </div>
              <div className="field">
                <label>link</label>
                <div className="v">{selected.conn}</div>
              </div>
              <div className="field">
                <label>uptime</label>
                <div className="v">{selected.uptime}</div>
              </div>
            </div>

            <div className="cat-notes">{selected.notes}</div>
          </div>
        </div>
      </div>
    );
  }

  window.CatalogVariant = CatalogVariant;
})();
