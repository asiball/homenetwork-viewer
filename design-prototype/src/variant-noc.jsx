// variant-noc.jsx — Variation B · NOC Console
// Dark monitoring panel. Phosphor-amber on near-black. Dense monospaced.
// Now supports 4 layouts (radial / tree / spine / grid) and a polling-aware
// status panel (manual / 5min / 30s / live).

(() => {
  const N_CSS = `
  .noc {
    --bg:        #0b0d10;
    --bg-2:      #11141a;
    --bg-3:      #161a22;
    --fg:        #d9e0e8;
    --fg-soft:   #8a93a0;
    --fg-faint:  #525a66;
    --rule:      #1d222b;
    --rule-2:    #2a313d;
    --ok:        #79ddb0;
    --warn:      #f0b657;
    --err:       #e87a6a;
    --amber:     #f0b657;
    --grid:      rgba(140, 160, 180, 0.04);
    color: var(--fg);
    background:
      linear-gradient(var(--bg) 0 0),
      linear-gradient(var(--grid) 1px, transparent 1px) 0 0/16px 16px,
      linear-gradient(90deg, var(--grid) 1px, transparent 1px) 0 0/16px 16px;
    font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 11px; line-height: 1.5;
    width: 100%; height: 100%;
    display: grid;
    grid-template-columns: 220px 1fr 320px;
    grid-template-rows: auto 1fr auto;
    grid-template-areas:
      "head head head"
      "left map  side"
      "foot foot foot";
  }
  .noc .upper { text-transform: uppercase; letter-spacing: 0.08em; }

  .noc .n-head { grid-area: head; padding: 10px 16px; border-bottom: 1px solid var(--rule);
    background: var(--bg-2); display: flex; align-items: center; gap: 18px; }
  .noc .n-head .brand { display: flex; align-items: center; gap: 10px; font-size: 11px; }
  .noc .n-head .brand b { color: var(--amber); font-weight: 500; letter-spacing: 0.16em; }
  .noc .n-head .brand .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--ok);
    box-shadow: 0 0 8px var(--ok); animation: nblink 2.5s infinite; }
  @keyframes nblink { 0%,80%,100% { opacity:1 } 88% { opacity: 0.3 } }
  .noc .n-head .crumbs { color: var(--fg-faint); font-size: 10.5px; letter-spacing: 0.04em; }
  .noc .n-head .crumbs span { color: var(--fg-soft); }
  .noc .n-head .right { margin-left: auto; display: flex; gap: 16px; align-items: center;
    font-size: 10px; color: var(--fg-soft); letter-spacing: 0.04em; }
  .noc .n-head .clock { color: var(--amber); }
  .noc .n-head .layout-tog { display: flex; gap: 0; border: 1px solid var(--rule-2); border-radius: 2px;
    overflow: hidden; }
  .noc .n-head .layout-tog button { appearance: none; background: transparent; color: var(--fg-soft);
    border: 0; padding: 3px 10px; font: inherit; font-size: 10px; letter-spacing: 0.08em;
    text-transform: uppercase; cursor: pointer; }
  .noc .n-head .layout-tog button.sel { background: var(--bg-3); color: var(--amber); }
  .noc .n-head .layout-tog button:hover:not(.sel) { background: var(--bg-3); color: var(--fg); }
  .noc .n-head .refresh { appearance: none; background: transparent; color: var(--amber);
    border: 1px solid var(--rule-2); padding: 3px 9px; font: inherit; font-size: 10px;
    letter-spacing: 0.08em; text-transform: uppercase; cursor: pointer; border-radius: 2px; }
  .noc .n-head .refresh:hover { background: var(--bg-3); }

  .noc .n-left { grid-area: left; border-right: 1px solid var(--rule); padding: 12px 0;
    overflow-y: auto; display: flex; flex-direction: column; gap: 2px; }
  .noc .n-left .ltitle { padding: 4px 16px 8px; font-size: 9.5px; color: var(--fg-faint);
    letter-spacing: 0.12em; text-transform: uppercase; }
  .noc .n-left .lrow { display: flex; align-items: center; gap: 10px; padding: 4px 16px;
    cursor: pointer; border-left: 2px solid transparent; }
  .noc .n-left .lrow:hover { background: var(--bg-2); }
  .noc .n-left .lrow.sel { background: var(--bg-3); border-left-color: var(--amber); }
  .noc .n-left .lrow .lstat { width: 7px; height: 7px; flex-shrink: 0; }
  .noc .n-left .lrow .lstat.on { background: var(--ok); box-shadow: 0 0 5px var(--ok); }
  .noc .n-left .lrow .lstat.off { background: transparent; border: 1px solid var(--err); }
  .noc .n-left .lrow .lname { flex: 1; font-size: 10.5px; color: var(--fg);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .noc .n-left .lrow.sel .lname { color: var(--amber); }
  .noc .n-left .lrow .lip { font-size: 9.5px; color: var(--fg-faint); }

  .noc .n-map  { grid-area: map; position: relative; overflow: hidden; }
  .noc .n-map svg { display: block; width: 100%; height: 100%; }
  .noc .n-map .map-corner { position: absolute; font-size: 9.5px; color: var(--fg-faint);
    letter-spacing: 0.06em; text-transform: uppercase; padding: 10px 14px; pointer-events: none; }
  .noc .n-map .map-corner.tl { top:0; left:0; }
  .noc .n-map .map-corner.tr { top:0; right:0; text-align: right; }
  .noc .n-map .map-corner.bl { bottom:0; left:0; }
  .noc .n-map .map-corner b { color: var(--amber); }

  .noc .ring { fill: none; stroke: var(--rule-2); stroke-width: 0.5; stroke-dasharray: 1 5; }
  .noc .crosshair { stroke: var(--rule-2); stroke-width: 0.5; stroke-dasharray: 2 4; }
  .noc .bus { stroke: var(--fg-faint); stroke-width: 1.6; }
  .noc .group-box { fill: var(--bg-2); stroke: var(--rule-2); stroke-width: 0.75;
    stroke-dasharray: 2 3; }
  .noc .group-title { font-family: 'JetBrains Mono', monospace; font-size: 9.5px;
    fill: var(--amber); letter-spacing: 0.14em; text-transform: uppercase; }
  .noc .link { stroke: #2c3441; stroke-width: 0.6; fill: none; }
  .noc .link.on { stroke: rgba(121, 221, 176, 0.45); }
  .noc .link.off { stroke: rgba(232, 122, 106, 0.22); stroke-dasharray: 2 3; }
  .noc .link.sel { stroke: var(--amber); stroke-width: 1.4; }
  .noc .node-box { fill: var(--bg-2); stroke: var(--fg-faint); stroke-width: 0.75; }
  .noc .node-box.on { stroke: var(--ok); }
  .noc .node-box.off { stroke: var(--err); }
  .noc .node-box.sel { stroke: var(--amber); fill: #1d1a12; stroke-width: 1.2; }
  .noc .node-box.center { stroke: var(--amber); stroke-width: 1.2; fill: #1d1a12; }
  .noc .node-label { font-family: 'JetBrains Mono', monospace; font-size: 9.5px; fill: var(--fg);
    letter-spacing: 0.04em; }
  .noc .node-label.dim { fill: var(--fg-faint); }
  .noc .node-meta { font-family: 'JetBrains Mono', monospace; font-size: 8.5px; fill: var(--fg-faint); }
  .noc .pulse { fill: var(--amber); opacity: 0.12; }

  .noc .n-side { grid-area: side; border-left: 1px solid var(--rule); padding: 14px;
    background: var(--bg-2); display: flex; flex-direction: column; gap: 14px; overflow-y: auto; }
  .noc .n-side .panel { border: 1px solid var(--rule-2); padding: 10px 12px; position: relative; }
  .noc .n-side .panel::before { content: attr(data-title); position: absolute; top: -7px; left: 10px;
    background: var(--bg-2); padding: 0 6px; font-size: 9px; color: var(--amber);
    letter-spacing: 0.12em; text-transform: uppercase; }
  .noc .n-side .id-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .noc .n-side .id-row .pill { font-size: 9px; padding: 2px 6px; border: 1px solid var(--rule-2);
    letter-spacing: 0.08em; text-transform: uppercase; color: var(--fg-soft); }
  .noc .n-side .id-row .pill.on { color: var(--ok); border-color: rgba(121,221,176,0.4); }
  .noc .n-side .id-row .pill.off { color: var(--err); border-color: rgba(232,122,106,0.4); }
  .noc .n-side .dname { font-size: 15px; color: var(--amber); letter-spacing: 0.02em; margin-top: 6px;
    font-weight: 500; }
  .noc .n-side .dhost { font-size: 10.5px; color: var(--fg-soft); margin-top: 2px; }
  .noc .n-side dl { margin: 0; display: grid; grid-template-columns: 64px 1fr; row-gap: 4px; column-gap: 10px;
    font-size: 10.5px; }
  .noc .n-side dt { color: var(--fg-faint); text-transform: uppercase; letter-spacing: 0.08em; font-size: 9.5px; }
  .noc .n-side dd { margin: 0; color: var(--fg); font-family: 'JetBrains Mono', monospace; }
  .noc .n-side .bar { height: 4px; background: var(--bg-3); margin-top: 4px; position: relative; }
  .noc .n-side .bar .fill { position: absolute; left:0; top:0; bottom:0; background: var(--amber);
    transition: width 0.4s ease-out; }
  .noc .n-side .blob { font-size: 10.5px; color: var(--fg-soft); white-space: pre-wrap; }
  .noc .n-side .blob .cursor { display: inline-block; width: 6px; height: 11px;
    background: var(--amber); vertical-align: -1px; margin-left: 2px; animation: cblink 1s steps(2) infinite; }
  @keyframes cblink { 50% { opacity: 0 } }
  .noc .n-side .stale { font-size: 9.5px; color: var(--fg-faint); margin-top: 6px;
    display: flex; justify-content: space-between; letter-spacing: 0.06em; text-transform: uppercase; }
  .noc .n-side .stale.live { color: var(--ok); }

  .noc .n-foot { grid-area: foot; border-top: 1px solid var(--rule); background: var(--bg-2);
    padding: 7px 16px; display: flex; gap: 18px; font-size: 10px; color: var(--fg-soft);
    letter-spacing: 0.06em; text-transform: uppercase; }
  .noc .n-foot b { color: var(--amber); font-weight: 500; }
  .noc .n-foot .right { margin-left: auto; }
  `;

  // ─── Layout calculators ────────────────────────────────────────────
  // Each returns { positions: {id: {x,y}}, edges: [{from, to, off}],
  //                decorations: <svg fragments to render under nodes> }

  const W = 800, H = 560;

  function computeRadial(visible, compact) {
    const cx = W / 2, cy = H / 2 + 4;
    const r1 = compact ? 90 : 105;
    const r2 = compact ? 215 : 240;
    const leaves = visible.filter(d => d.ring === 2);
    const total = leaves.length;
    const positions = {};
    visible.forEach(d => {
      if (d.ring === 0) positions[d.id] = { x: cx, y: cy };
      else if (d.ring === 1) {
        const a = d.idx === 0 ? 45 : 315;
        positions[d.id] = polar(a, r1, cx, cy);
      } else {
        const idx = leaves.findIndex(x => x.id === d.id);
        const a = (9 + idx * (360 / total)) % 360;
        positions[d.id] = polar(a, r2, cx, cy);
        positions[d.id]._labelOffset = (() => {
          const out = polar(a, r2 + 14, cx, cy);
          let anchor = 'middle';
          if (out.x > cx + 4) anchor = 'start';
          else if (out.x < cx - 4) anchor = 'end';
          return { x: out.x, y: out.y, anchor };
        })();
      }
    });
    const edges = visible.filter(d => d.ring !== 0).map(d => ({
      from: 'gw', to: d.id, off: !d.online
    }));
    const decorations = (
      <>
        <line className="crosshair" x1={cx} y1={20} x2={cx} y2={H-20} />
        <line className="crosshair" x1={20} y1={cy} x2={W-20} y2={cy} />
        <circle className="ring" cx={cx} cy={cy} r={r1} />
        <circle className="ring" cx={cx} cy={cy} r={r2} />
        <circle className="ring" cx={cx} cy={cy} r={(r1+r2)/2} />
      </>
    );
    return { positions, edges, decorations };
  }

  function computeTree(visible, compact) {
    // Gateway top center, infra (AP, NAS) one row down, then category columns
    const positions = {};
    const cx = W / 2;
    const gwY = 60;
    const infraY = 145;

    positions['gw'] = { x: cx, y: gwY };
    const infra = visible.filter(d => d.ring === 1);
    infra.forEach((d, i) => {
      // 2 infra: AP left, NAS right
      const x = cx + (i === 0 ? -120 : 120);
      positions[d.id] = { x, y: infraY };
      positions[d.id]._labelOffset = {
        x: x + 14, y: infraY, anchor: 'start'
      };
    });

    // Category columns
    const cats = GROUP_ORDER.filter(g => g !== 'Infra' && visible.some(d => d.group === g));
    const colY = 235; // header line
    const cellY = 268;
    const cellH = compact ? 26 : 30;
    const colW = (W - 80) / cats.length;
    const startX = 40 + colW / 2;
    const colHeader = {};
    cats.forEach((cat, ci) => {
      const colX = startX + ci * colW;
      colHeader[cat] = { x: colX, y: colY };
      const items = visible.filter(d => d.group === cat);
      items.forEach((d, i) => {
        positions[d.id] = { x: colX, y: cellY + i * cellH };
        positions[d.id]._labelOffset = { x: colX + 14, y: cellY + i * cellH, anchor: 'start' };
      });
    });

    // Edges: gateway → infra, gateway → each category header (visually), infra → wifi leaves
    // Simplify: gateway → each non-gw device (clean lines, no actual hierarchy)
    const edges = visible.filter(d => d.ring !== 0).map(d => ({
      from: 'gw', to: d.id, off: !d.online, style: 'orthogonal'
    }));

    const decorations = (
      <>
        {cats.map(c => (
          <text key={'h'+c} className="group-title" x={colHeader[c].x} y={colHeader[c].y}
            textAnchor="middle">{c}</text>
        ))}
        {/* horizontal rule under category labels */}
        <line x1={20} y1={colY + 8} x2={W - 20} y2={colY + 8}
          stroke="var(--rule-2)" strokeDasharray="2 4" strokeWidth="0.5" />
      </>
    );
    return { positions, edges, decorations };
  }

  function computeSpine(visible, compact) {
    // Horizontal "bus" with the gateway on the left; categories distributed
    // along the bus, devices fan above/below in clusters.
    const positions = {};
    const busY = H / 2;
    const startX = 100;
    const endX = W - 40;

    positions['gw'] = { x: startX, y: busY };

    const infra = visible.filter(d => d.ring === 1);
    // AP above, NAS below the gateway
    infra.forEach((d, i) => {
      positions[d.id] = { x: startX + 60, y: busY + (i === 0 ? -55 : 55) };
      positions[d.id]._labelOffset = {
        x: positions[d.id].x + 14, y: positions[d.id].y, anchor: 'start'
      };
    });

    const cats = GROUP_ORDER.filter(g => g !== 'Infra' && visible.some(d => d.group === g));
    const catStart = startX + 150;
    const catSpacing = (endX - catStart) / cats.length;
    const cellH = compact ? 24 : 28;

    cats.forEach((cat, ci) => {
      const cx = catStart + (ci + 0.5) * catSpacing;
      // alternate above/below to fit
      const above = ci % 2 === 0;
      const items = visible.filter(d => d.group === cat);
      // category label on the bus
      positions['__cat_' + cat] = { x: cx, y: busY };
      items.forEach((d, i) => {
        // vertical stack from bus outward
        const offset = 40 + i * cellH;
        const y = above ? busY - offset : busY + offset;
        positions[d.id] = { x: cx, y };
        positions[d.id]._labelOffset = {
          x: cx + 12, y, anchor: 'start'
        };
      });
    });

    const edges = [];
    // infra to gateway (horizontal-ish)
    infra.forEach(d => {
      edges.push({ from: 'gw', to: d.id, off: !d.online });
    });
    // each leaf to its category tap point on the bus
    cats.forEach(cat => {
      const items = visible.filter(d => d.group === cat);
      items.forEach(d => {
        edges.push({
          from: '__cat_' + cat, to: d.id, off: !d.online, vertical: true
        });
      });
    });

    const decorations = (
      <>
        {/* The bus itself */}
        <line className="bus" x1={startX - 12} y1={busY} x2={endX} y2={busY} />
        <line className="bus" x1={startX - 12} y1={busY - 2} x2={endX} y2={busY - 2}
          style={{ stroke: 'var(--rule-2)', strokeWidth: 0.5 }} />
        <text x={startX - 12} y={busY - 10} textAnchor="start"
          style={{
            fontFamily: 'JetBrains Mono, monospace', fontSize: 9, fill: 'var(--fg-faint)',
            letterSpacing: '0.12em', textTransform: 'uppercase'
          }}>br-lan · 192.168.1.0/24</text>
        {/* category tap markers */}
        {cats.map(cat => {
          const p = positions['__cat_' + cat];
          return (
            <g key={'tap'+cat}>
              <circle cx={p.x} cy={p.y} r={2.5} fill="var(--fg-faint)" />
              <text x={p.x} y={p.y + (cats.indexOf(cat) % 2 === 0 ? 14 : -8)}
                textAnchor="middle" className="group-title">{cat}</text>
            </g>
          );
        })}
      </>
    );
    return { positions, edges, decorations };
  }

  function computeGrid(visible, compact) {
    // Category swimlanes in a 3×2 grid. Devices arrayed in a small grid within
    // each box. No connecting lines — semantic grouping.
    const positions = {};
    const groups = GROUP_ORDER.filter(g => visible.some(d => d.group === g));
    const cols = 3;
    const rows = Math.ceil(groups.length / cols);
    const padX = 24, padY = 18;
    const boxW = (W - padX * (cols + 1)) / cols;
    const boxH = (H - padY * (rows + 1)) / rows;
    const boxes = {};

    groups.forEach((g, gi) => {
      const cx = padX + (gi % cols) * (boxW + padX);
      const cy = padY + Math.floor(gi / cols) * (boxH + padY);
      boxes[g] = { x: cx, y: cy, w: boxW, h: boxH };

      const items = visible.filter(d => d.group === g);
      const innerCols = Math.min(3, items.length);
      const innerRows = Math.ceil(items.length / innerCols);
      const cellW = (boxW - 24) / innerCols;
      const cellH = Math.min(36, (boxH - 40) / Math.max(1, innerRows));
      items.forEach((d, i) => {
        const ix = cx + 12 + (i % innerCols) * cellW + cellW / 2;
        const iy = cy + 32 + Math.floor(i / innerCols) * cellH + cellH / 2;
        positions[d.id] = { x: ix, y: iy };
        positions[d.id]._labelOffset = {
          x: ix, y: iy + 12, anchor: 'middle', _below: true
        };
      });
    });

    const edges = []; // intentionally none — grid is a roster, not a topology
    const decorations = (
      <>
        {groups.map(g => {
          const b = boxes[g];
          return (
            <g key={'b'+g}>
              <rect className="group-box" x={b.x} y={b.y} width={b.w} height={b.h} rx="2" />
              <text className="group-title" x={b.x + 12} y={b.y + 18}>
                {g} · {visible.filter(d => d.group === g).length}
              </text>
            </g>
          );
        })}
      </>
    );
    return { positions, edges, decorations };
  }

  function computeLayout(layout, visible, compact) {
    switch (layout) {
      case 'tree':  return computeTree(visible, compact);
      case 'spine': return computeSpine(visible, compact);
      case 'grid':  return computeGrid(visible, compact);
      default:      return computeRadial(visible, compact);
    }
  }

  // Polling configuration → side-panel status row
  function PollingStatus({ polling, online, tick }) {
    if (!online) return <div className="stale">offline · last seen {tick.last}</div>;
    if (polling === 'live') {
      return <div className="stale live">● live agent · updated 0s ago</div>;
    }
    if (polling === 'manual') {
      return <div className="stale">manual scan · last 11:42 JST</div>;
    }
    const label = polling === '30s' ? 'auto · every 30s' : 'auto · every 5 min';
    return <div className="stale">{label} · next in {polling === '30s' ? '0:14' : '4:32'}</div>;
  }

  function NocVariant({ tweaks, onLayoutChange }) {
    const [sel, setSel] = React.useState('nas');
    const [tick, setTick] = React.useState(0);
    const layout = tweaks?.layout ?? 'radial';
    const polling = tweaks?.polling ?? '5min';
    const showOffline = tweaks?.showOffline ?? true;
    const density = tweaks?.density ?? 'regular';
    const compact = density === 'compact';

    // Animate only when polling === 'live'
    React.useEffect(() => {
      if (polling !== 'live') return;
      const id = setInterval(() => setTick(t => t + 1), 1200);
      return () => clearInterval(id);
    }, [polling]);

    const visible = DEVICES.filter(d => showOffline || d.online);
    const selected = visible.find(d => d.id === sel) || visible[0];
    if (!selected) return null;

    const { positions, edges, decorations } = computeLayout(layout, visible, compact);
    const getPos = (id) => positions[id] || { x: 0, y: 0 };

    // Last-known metrics (frozen, but with subtle drift on live)
    const seed = (s) => s.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    const baseLoad = (selected.cpu === '—') ? 0 : 28 + (seed(selected.id) % 45);
    const baseMem  = (selected.mem === '—') ? 0 : 48 + (seed(selected.id + 'm') % 35);
    const liveLoad = polling === 'live'
      ? Math.max(5, Math.min(95, baseLoad + (Math.sin(tick * 0.6) * 8) | 0))
      : baseLoad;
    const liveMem  = polling === 'live'
      ? Math.max(5, Math.min(95, baseMem + (Math.sin(tick * 0.4 + 1) * 4) | 0))
      : baseMem;

    const groupedLeft = GROUP_ORDER.map(g => ({
      g, items: visible.filter(d => d.group === g)
    })).filter(x => x.items.length);

    const layoutLabel = ({
      radial: 'radial', tree: 'tree', spine: 'spine / bus', grid: 'grid / groups'
    })[layout];

    return (
      <div className="noc">
        <style dangerouslySetInnerHTML={{__html: N_CSS}} />

        <div className="n-head">
          <div className="brand"><span className="dot" /> <b>HOMENET / NOC</b></div>
          <div className="crumbs">
            net <span>192.168.1.0/24</span> &nbsp;·&nbsp; iface <span>br-lan</span> &nbsp;·&nbsp; layout <span>{layoutLabel}</span>
          </div>
          <div className="right">
            {onLayoutChange && (
              <div className="layout-tog" title="レイアウト切替">
                <button className={layout === 'radial' ? 'sel' : ''}
                  onClick={() => onLayoutChange('radial')}>◎ radial</button>
                <button className={layout === 'spine' ? 'sel' : ''}
                  onClick={() => onLayoutChange('spine')}>─ spine</button>
              </div>
            )}
            <span>poll · <b style={{ color: 'var(--amber)'}}>{polling}</b></span>
            <span>up {countOnline(DEVICES)}/{DEVICES.length}</span>
            <button className="refresh">⟳ scan</button>
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

        <div className="n-map">
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">
            {decorations}

            {/* Edges */}
            {edges.map((e, i) => {
              const p1 = getPos(e.from), p2 = getPos(e.to);
              const onSel = e.to === sel || e.from === sel;
              return (
                <line key={'e'+i}
                  className={`link ${e.off ? 'off' : 'on'} ${onSel ? 'sel' : ''}`}
                  x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} />
              );
            })}

            {/* Pulse */}
            {(() => {
              const p = getPos(sel);
              return <circle className="pulse" cx={p.x} cy={p.y} r={18} />;
            })()}

            {/* Nodes */}
            {visible.map(d => {
              const p = getPos(d.id);
              const isSel = d.id === sel;
              const isCenter = d.ring === 0;
              const w = isCenter ? 56 : isSel ? 14 : 10;
              const h = isCenter ? 22 : isSel ? 14 : 10;
              const cls = `node-box ${isCenter?'center':d.online?'on':'off'} ${isSel?'sel':''}`;
              const lo = p._labelOffset;
              const showLabel = !isCenter && (layout !== 'radial' || lo);
              return (
                <g key={d.id} onClick={() => setSel(d.id)} style={{ cursor: 'pointer' }}>
                  <rect className={cls}
                    x={p.x - w/2} y={p.y - h/2} width={w} height={h} />
                  {isCenter && (
                    <text className="node-label" x={p.x} y={p.y+3} textAnchor="middle"
                      style={{ fill: 'var(--amber)', fontSize: 9, letterSpacing: '0.18em' }}>
                      GATEWAY
                    </text>
                  )}
                  {showLabel && lo && (
                    <>
                      <text className={`node-label ${!d.online && !isSel ? 'dim' : ''}`}
                        x={lo.x} y={lo.y} textAnchor={lo.anchor} dy={lo._below ? 4 : 3}
                        style={{ fontWeight: isSel ? 600 : 400 }}>
                        {d.host.split('.')[0]}
                      </text>
                      {!compact && !lo._below && (
                        <text className="node-meta" x={lo.x} y={lo.y} textAnchor={lo.anchor} dy={14}>
                          .{d.ip.split('.').pop()}
                        </text>
                      )}
                    </>
                  )}
                </g>
              );
            })}
          </svg>
          <div className="map-corner tl">map · <b>{layoutLabel}</b></div>
          <div className="map-corner tr">{visible.length} nodes</div>
          <div className="map-corner bl">↳ click node for detail</div>
        </div>

        <aside className="n-side">
          <div className="panel" data-title="identity">
            <div className="id-row">
              <span className={`pill ${selected.online?'on':'off'}`}>{selected.online?'ONLINE':'OFFLINE'}</span>
              <span className="pill">{selected.group}</span>
              <span className="pill">{selected.type}</span>
            </div>
            <div className="dname">{selected.name}</div>
            <div className="dhost">{selected.host}</div>
          </div>

          <div className="panel" data-title="network">
            <dl>
              <dt>ipv4</dt><dd>{selected.ip}</dd>
              <dt>mac</dt><dd>{selected.mac}</dd>
              <dt>link</dt><dd>{selected.conn}</dd>
              <dt>last</dt><dd>{selected.last}</dd>
              <dt>up</dt><dd>{selected.uptime}</dd>
            </dl>
          </div>

          <div className="panel" data-title="hardware">
            <dl>
              <dt>cpu</dt><dd>{selected.cpu}</dd>
              <dt>mem</dt><dd>{selected.mem}</dd>
              <dt>disk</dt><dd>{selected.storage}</dd>
            </dl>
            {selected.online && baseLoad > 0 && (
              <div style={{ marginTop: 10 }}>
                <div style={{ display:'flex', justifyContent:'space-between', fontSize:9.5, color:'var(--fg-faint)', textTransform:'uppercase', letterSpacing:'.08em' }}>
                  <span>cpu</span><span>{liveLoad}%</span>
                </div>
                <div className="bar"><div className="fill" style={{ width: liveLoad+'%' }} /></div>
                <div style={{ display:'flex', justifyContent:'space-between', fontSize:9.5, color:'var(--fg-faint)', textTransform:'uppercase', letterSpacing:'.08em', marginTop: 6 }}>
                  <span>mem</span><span>{liveMem}%</span>
                </div>
                <div className="bar"><div className="fill" style={{ width: liveMem+'%', background: 'var(--ok)' }} /></div>
              </div>
            )}
            <PollingStatus polling={polling} online={selected.online} tick={{ last: selected.last }} />
          </div>

          <div className="panel" data-title="notes">
            <div className="blob">{'> '}{selected.notes}<span className="cursor" /></div>
          </div>
        </aside>

        <div className="n-foot">
          <span><b>{countOnline(DEVICES)}</b> up</span>
          <span><b style={{color:'var(--err)'}}>{countOffline(DEVICES)}</b> down</span>
          <span>poll <b>{polling}</b></span>
          <span>subnet <b>/24</b></span>
          <span className="right">B · NOC · {layoutLabel}</span>
        </div>
      </div>
    );
  }

  window.NocVariant = NocVariant;
})();
