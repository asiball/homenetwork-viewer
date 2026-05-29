// variant-atelier.jsx — Variation A · Atelier
// Light, editorial. Off-white paper, fine hairlines, serif accents.

(() => {
  const A_CSS = `
  .atelier {
    --bg:        oklch(0.972 0.005 80);
    --bg-soft:   oklch(0.94 0.008 80);
    --ink:       oklch(0.22 0.008 60);
    --ink-soft:  oklch(0.45 0.01 60);
    --ink-faint: oklch(0.65 0.008 60);
    --rule:      oklch(0.82 0.01 60);
    --accent:    oklch(0.55 0.12 35);
    --offline:   oklch(0.72 0.005 60);
    --warn:      oklch(0.60 0.10 50);
    color: var(--ink);
    background: var(--bg);
    font-family: 'Söhne', 'Helvetica Neue', Helvetica, ui-sans-serif, system-ui, sans-serif;
    font-size: 13px;
    line-height: 1.45;
    width: 100%; height: 100%;
    display: grid;
    grid-template-columns: 1fr 340px;
    grid-template-rows: auto 1fr auto;
    grid-template-areas:
      "head head"
      "map  side"
      "foot foot";
  }
  .atelier .serif { font-family: 'Instrument Serif', 'Iowan Old Style', Georgia, serif; font-weight: 400; }
  .atelier .mono  { font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace; }

  .atelier .a-head { grid-area: head; padding: 22px 32px 14px; border-bottom: 1px solid var(--rule);
    display: flex; align-items: baseline; gap: 28px; }
  .atelier .a-head .title { font-size: 30px; letter-spacing: -0.01em; }
  .atelier .a-head .sub { color: var(--ink-soft); font-size: 11.5px; letter-spacing: 0.04em;
    text-transform: uppercase; }
  .atelier .a-head .stats { margin-left: auto; display: flex; gap: 22px; }
  .atelier .a-head .stat .n { font-size: 22px; font-family: 'Instrument Serif', Georgia, serif;
    font-feature-settings: "tnum"; }
  .atelier .a-head .stat .l { font-size: 10.5px; color: var(--ink-soft); letter-spacing: 0.06em;
    text-transform: uppercase; }

  .atelier .a-map  { grid-area: map; position: relative; overflow: hidden; }
  .atelier .a-map svg { display: block; width: 100%; height: 100%; }

  .atelier .node-label {
    font-size: 11px; fill: var(--ink); letter-spacing: 0.01em;
  }
  .atelier .node-meta {
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 9.5px; fill: var(--ink-faint); letter-spacing: 0.02em;
  }
  .atelier .link { stroke: var(--rule); stroke-width: 0.75; fill: none; }
  .atelier .link.off { stroke-dasharray: 2 3; opacity: 0.6; }
  .atelier .link.active { stroke: var(--accent); stroke-width: 1.2; }
  .atelier .ring { fill: none; stroke: var(--rule); stroke-width: 0.5; stroke-dasharray: 1 4; opacity: 0.7; }
  .atelier .dot  { fill: var(--bg); stroke: var(--ink); stroke-width: 1.1; transition: r 0.15s; }
  .atelier .dot.off { stroke: var(--offline); }
  .atelier .dot.sel { fill: var(--ink); stroke: var(--ink); }
  .atelier .dot.center { fill: var(--ink); stroke: var(--ink); }
  .atelier .pulse { fill: var(--accent); opacity: 0.18; }
  .atelier .group-arc { fill: none; stroke: var(--ink-faint); stroke-width: 0.5; opacity: 0.4; }
  .atelier .group-tag { font-family: 'Instrument Serif', Georgia, serif; font-size: 11px;
    fill: var(--ink-faint); letter-spacing: 0.06em; text-transform: uppercase; }
  .atelier .hit { fill: transparent; cursor: pointer; }
  .atelier .hit:hover + .dot { stroke-width: 1.8; }

  .atelier .a-side { grid-area: side; border-left: 1px solid var(--rule);
    padding: 24px 28px 18px; display: flex; flex-direction: column; gap: 18px;
    overflow-y: auto; }
  .atelier .a-side .eyebrow { font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase;
    color: var(--ink-soft); }
  .atelier .a-side .dname { font-size: 26px; line-height: 1.05; letter-spacing: -0.01em;
    font-family: 'Instrument Serif', Georgia, serif; }
  .atelier .a-side .dhost { font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 11px; color: var(--ink-soft); margin-top: 4px; }
  .atelier .a-side .badge { display: inline-flex; align-items: center; gap: 6px;
    font-size: 10.5px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink-soft); }
  .atelier .a-side .badge::before { content:''; width:6px; height:6px; border-radius:50%;
    background: var(--accent); }
  .atelier .a-side .badge.off::before { background: var(--offline); }
  .atelier .a-side .dl { display: grid; grid-template-columns: 92px 1fr; row-gap: 7px; column-gap: 14px;
    font-size: 12px; align-items: baseline; }
  .atelier .a-side .dl dt { color: var(--ink-soft); font-size: 10.5px; letter-spacing: 0.06em;
    text-transform: uppercase; padding-top: 2px; }
  .atelier .a-side .dl dd { margin: 0; font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 11.5px; color: var(--ink); }
  .atelier .a-side hr { border: 0; border-top: 1px solid var(--rule); margin: 4px 0; }
  .atelier .a-side .notes { font-family: 'Instrument Serif', Georgia, serif; font-size: 16px;
    line-height: 1.4; color: var(--ink); font-style: italic; }
  .atelier .a-side .quote-mark { font-family: 'Instrument Serif', Georgia, serif; font-size: 38px;
    line-height: 0.4; color: var(--accent); margin-right: 4px; vertical-align: -8px; }

  .atelier .a-foot { grid-area: foot; border-top: 1px solid var(--rule); padding: 10px 32px;
    display: flex; align-items: center; justify-content: space-between;
    font-family: 'JetBrains Mono', ui-monospace, monospace; font-size: 10px;
    color: var(--ink-soft); letter-spacing: 0.04em; }
  .atelier .a-foot .legend { display: flex; gap: 18px; align-items: center; }
  .atelier .a-foot .legend .sw { display: inline-flex; align-items: center; gap: 6px; }
  .atelier .a-foot .legend .sw i { width: 7px; height: 7px; border-radius: 50%; background: var(--ink); display: inline-block; }
  .atelier .a-foot .legend .sw.off i { background: transparent; border: 1px solid var(--offline); }
  .atelier .a-foot .legend .sw.wire i { width: 12px; height: 1px; border-radius: 0; background: var(--ink); }
  .atelier .a-foot .legend .sw.wifi i { width: 12px; height: 1px; border-radius: 0; background:
    repeating-linear-gradient(90deg, var(--ink) 0 2px, transparent 2px 4px); }
  `;

  function AtelierVariant({ tweaks }) {
    const [sel, setSel] = React.useState('mini');
    const showOffline = tweaks?.showOffline ?? true;
    const density = tweaks?.density ?? 'regular';
    const compact = density === 'compact';

    const devices = DEVICES.filter(d => showOffline || d.online);
    const selected = devices.find(d => d.id === sel) || devices[0];

    const W = 800, H = 560;
    const cx = W/2 - 20, cy = H/2 + 6;
    const r1 = compact ? 95 : 110;
    const r2 = compact ? 215 : 240;
    const totalLeaves = devices.filter(d => d.ring === 2).length;
    const cfg = { cx, cy, r1, r2, leafStart: 9, totalLeaves };

    const placed = devices.map(d => {
      // re-index leaves so positions stay even when offline filtered
      let dd = d;
      if (d.ring === 2) {
        const visibleLeaves = devices.filter(x => x.ring === 2);
        const newIdx = visibleLeaves.findIndex(x => x.id === d.id);
        dd = { ...d, idx: newIdx };
      }
      return { ...d, pos: layoutOf(dd, { ...cfg, totalLeaves }) };
    });

    const center = placed.find(d => d.ring === 0);
    const links = placed.filter(d => d.ring !== 0).map(d => {
      const from = d.ring === 2
        ? (placed.find(x => x.id === (d.group === 'Computer' || d.group === 'Mobile' || d.group === 'Misc' ? 'ap' : 'gw')) || center)
        : center;
      // Actually keep it simple: every leaf connects to center (gateway).
      return { from: center, to: d, off: !d.online };
    });

    return (
      <div className="atelier">
        <style dangerouslySetInnerHTML={{__html: A_CSS}} />

        <div className="a-head">
          <div>
            <div className="serif title">homenet · atelier</div>
            <div className="sub">192.168.1.0 / 24 · scanned 2026·05·18 · 11:42 JST</div>
          </div>
          <div className="stats">
            <div className="stat"><div className="n">{DEVICES.length}</div><div className="l">devices</div></div>
            <div className="stat"><div className="n">{countOnline(DEVICES)}</div><div className="l">online</div></div>
            <div className="stat"><div className="n">{countOffline(DEVICES)}</div><div className="l">offline</div></div>
          </div>
        </div>

        <div className="a-map">
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">
            {/* concentric rings */}
            <circle className="ring" cx={cx} cy={cy} r={r1} />
            <circle className="ring" cx={cx} cy={cy} r={r2} />

            {/* group sector labels */}
            {[
              { g:'IoT',      a: 35 },
              { g:'Media',    a: 110 },
              { g:'Mobile',   a: 195 },
              { g:'Computer', a: 275 },
              { g:'Misc',     a: 340 },
            ].map(({g,a}) => {
              const p = polar(a, r2 + 32, cx, cy);
              return <text key={g} className="group-tag" x={p.x} y={p.y} textAnchor="middle">{g}</text>;
            })}

            {/* links */}
            {links.map((l, i) => (
              <line key={i}
                className={`link ${l.off ? 'off' : ''} ${l.to.id === sel ? 'active' : ''}`}
                x1={l.from.pos.x} y1={l.from.pos.y} x2={l.to.pos.x} y2={l.to.pos.y} />
            ))}

            {/* selected pulse */}
            {selected && (() => {
              const p = placed.find(x => x.id === selected.id);
              if (!p) return null;
              return <circle className="pulse" cx={p.pos.x} cy={p.pos.y} r={14} />;
            })()}

            {/* nodes */}
            {placed.map(d => {
              const isSel = d.id === sel;
              const isCenter = d.ring === 0;
              const r = isCenter ? 9 : isSel ? 6.5 : d.ring === 1 ? 5.5 : 4;
              // label placement: outside the circle for leaves
              let lx = d.pos.x, ly = d.pos.y, anchor='middle', dy=-r-8;
              if (d.ring === 2) {
                const out = polar((d.idx * (360/totalLeaves) + 9) % 360, r2 + 14, cx, cy);
                lx = out.x; ly = out.y;
                if (d.pos.x > cx + 4) anchor = 'start';
                else if (d.pos.x < cx - 4) anchor = 'end';
                dy = 3;
              }
              return (
                <g key={d.id}>
                  <circle className="hit" cx={d.pos.x} cy={d.pos.y} r={16}
                    onClick={() => setSel(d.id)} />
                  <circle className={`dot ${!d.online?'off':''} ${isSel?'sel':''} ${isCenter?'center':''}`}
                    cx={d.pos.x} cy={d.pos.y} r={r} />
                  {!isCenter && (
                    <>
                      <text className="node-label" x={lx} y={ly} textAnchor={anchor} dy={dy}
                        style={{ fontWeight: isSel ? 600 : 400 }}>
                        {d.name}
                      </text>
                      {!compact && (
                        <text className="node-meta" x={lx} y={ly} textAnchor={anchor} dy={dy + 12}>
                          {d.ip.split('.').slice(-2).join('.')}
                        </text>
                      )}
                    </>
                  )}
                  {isCenter && (
                    <text className="node-label" x={d.pos.x} y={d.pos.y} textAnchor="middle" dy={4}
                      style={{ fill: 'var(--bg)', fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                      gw
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        </div>

        <aside className="a-side">
          <div>
            <div className="eyebrow">{selected.group}</div>
            <div className="dname">{selected.name}</div>
            <div className="dhost">{selected.host}</div>
            <div className="badge" style={{ marginTop: 10 }}>
              <span>{selected.online ? 'Online' : 'Offline'}</span>
              <span style={{ color: 'var(--ink-faint)' }}>· {selected.last}</span>
            </div>
          </div>

          <hr />

          <dl className="dl">
            <dt>IP</dt><dd>{selected.ip}</dd>
            <dt>MAC</dt><dd>{selected.mac}</dd>
            <dt>Link</dt><dd>{selected.conn}</dd>
            <dt>Uptime</dt><dd>{selected.uptime}</dd>
          </dl>

          <hr />

          <dl className="dl">
            <dt>CPU</dt><dd>{selected.cpu}</dd>
            <dt>Memory</dt><dd>{selected.mem}</dd>
            <dt>Storage</dt><dd>{selected.storage}</dd>
          </dl>

          <hr />

          <div className="notes">
            <span className="quote-mark">“</span>{selected.notes}
          </div>
        </aside>

        <div className="a-foot">
          <div className="legend">
            <span className="sw"><i /> online</span>
            <span className="sw off"><i /> offline</span>
            <span className="sw wire"><i /> wired</span>
            <span className="sw wifi"><i /> wireless</span>
          </div>
          <div>A · Atelier</div>
        </div>
      </div>
    );
  }

  window.AtelierVariant = AtelierVariant;
})();
