// Topology map SVG (radial / spine). Ported from variant-noc.jsx render.

import type { Device } from "../types";
import { lastOctet, shortHost } from "../lib/helpers";
import { computeLayout, type LayoutKind, MAP_H, MAP_W, type Pos } from "../lib/topology";

interface Props {
  devices: Device[]; // already filtered to "visible"
  layout: LayoutKind;
  selectedId: string;
  onSelect: (id: string) => void;
  compact?: boolean;
}

const LAYOUT_LABEL: Record<LayoutKind, string> = {
  radial: "radial",
  spine: "spine / bus",
};

export function TopologyMap({ devices, layout, selectedId, onSelect, compact = false }: Props) {
  const { positions, edges, deco } = computeLayout(layout, devices, compact);
  const getPos = (id: string): Pos => positions[id] ?? { x: 0, y: 0 };
  const selPos = getPos(selectedId);

  return (
    <div className="n-map">
      <svg viewBox={`0 0 ${MAP_W} ${MAP_H}`} preserveAspectRatio="xMidYMid meet">
        {/* decorations */}
        {deco.kind === "radial" && (
          <>
            <line className="crosshair" x1={deco.cx} y1={20} x2={deco.cx} y2={MAP_H - 20} />
            <line className="crosshair" x1={20} y1={deco.cy} x2={MAP_W - 20} y2={deco.cy} />
            <circle className="ring" cx={deco.cx} cy={deco.cy} r={deco.r1} />
            <circle className="ring" cx={deco.cx} cy={deco.cy} r={deco.r2} />
            <circle className="ring" cx={deco.cx} cy={deco.cy} r={(deco.r1 + deco.r2) / 2} />
          </>
        )}
        {deco.kind === "spine" && (
          <>
            <line
              className="bus"
              x1={deco.startX - 12}
              y1={deco.busY}
              x2={deco.endX}
              y2={deco.busY}
            />
            <line
              x1={deco.startX - 12}
              y1={deco.busY - 2}
              x2={deco.endX}
              y2={deco.busY - 2}
              style={{ stroke: "var(--rule-2)", strokeWidth: 0.5 }}
            />
            <text
              x={deco.startX - 12}
              y={deco.busY - 10}
              textAnchor="start"
              style={{
                fontFamily: "var(--mono)",
                fontSize: 9,
                fill: "var(--fg-faint)",
                letterSpacing: "0.12em",
                textTransform: "uppercase",
              }}
            >
              br-lan · 192.168.1.0/24
            </text>
            {deco.taps.map((t) => (
              <g key={t.cat}>
                <circle cx={t.x} cy={t.y} r={2.5} fill="var(--fg-faint)" />
                <text
                  x={t.x}
                  y={t.y + (t.labelBelow ? 14 : -8)}
                  textAnchor="middle"
                  className="group-title"
                >
                  {t.cat}
                </text>
              </g>
            ))}
          </>
        )}

        {/* edges */}
        {edges.map((e, i) => {
          const p1 = getPos(e.from);
          const p2 = getPos(e.to);
          const onSel = e.to === selectedId || e.from === selectedId;
          return (
            <line
              key={`e${i}`}
              className={`link ${e.off ? "off" : "on"} ${onSel ? "sel" : ""}`}
              x1={p1.x}
              y1={p1.y}
              x2={p2.x}
              y2={p2.y}
            />
          );
        })}

        {/* selection pulse */}
        <circle className="pulse" cx={selPos.x} cy={selPos.y} r={18} />

        {/* nodes */}
        {devices.map((d) => {
          const p = getPos(d.id);
          const isSel = d.id === selectedId;
          const isCenter = d.ring === 0;
          const w = isCenter ? 56 : isSel ? 14 : 10;
          const h = isCenter ? 22 : isSel ? 14 : 10;
          const cls = `node-box ${isCenter ? "center" : d.online ? "on" : "off"} ${
            isSel ? "sel" : ""
          }`;
          const lo = p.labelOffset;
          const showLabel = !isCenter && !!lo;
          return (
            <g key={d.id}>
              <rect className={cls} x={p.x - w / 2} y={p.y - h / 2} width={w} height={h} />
              {isCenter && (
                <text
                  className="node-label"
                  x={p.x}
                  y={p.y + 3}
                  textAnchor="middle"
                  style={{ fill: "var(--amber)", fontSize: 9, letterSpacing: "0.18em" }}
                >
                  GATEWAY
                </text>
              )}
              {showLabel && lo && (
                <>
                  <text
                    className={`node-label ${!d.online && !isSel ? "dim" : ""}`}
                    x={lo.x}
                    y={lo.y}
                    textAnchor={lo.anchor}
                    dy={lo.below ? 4 : 3}
                    style={{ fontWeight: isSel ? 600 : 400 }}
                  >
                    {shortHost(d.host)}
                  </text>
                  {!compact && !lo.below && (
                    <text className="node-meta" x={lo.x} y={lo.y} textAnchor={lo.anchor} dy={14}>
                      .{lastOctet(d.ip)}
                    </text>
                  )}
                </>
              )}
              {/* generous transparent hit target + hover tooltip */}
              <circle
                className="node-hit"
                cx={p.x}
                cy={p.y}
                r={isCenter ? 20 : 13}
                onClick={() => onSelect(d.id)}
              >
                <title>
                  {d.name} · {d.ip}
                </title>
              </circle>
            </g>
          );
        })}
      </svg>
      <div className="map-corner tl">
        map · <b>{LAYOUT_LABEL[layout]}</b>
      </div>
      <div className="map-corner tr">{devices.length} nodes</div>
      <div className="map-corner bl">↳ click node for detail</div>
    </div>
  );
}
