// Topology map SVG (radial / spine / wiring tree). Ported from
// variant-noc.jsx render. The tree renders at fixed scale inside a
// scroll/pan pane; radial & spine scale to fit as before.

import { useRef, useMemo } from "react";
import { useCatalog } from "../CatalogContext";
import type { Device } from "../types";
import { gatewayInfo, lastOctet } from "../lib/helpers";
import {
  computeLayout,
  type LayoutKind,
  MAP_H,
  MAP_W,
  type Pos,
} from "../lib/topology";

interface Props {
  devices: Device[]; // already filtered to "visible"
  layout: LayoutKind;
  selectedId: string;
  onSelect: (id: string) => void;
  /** Wiring-tree only: ledger switches are selectable too. */
  selectedSwitchId?: string | null;
  onSelectSwitch?: (id: string) => void;
  compact?: boolean;
}

const LAYOUT_LABEL: Record<LayoutKind, string> = {
  radial: "radial",
  spine: "spine / bus",
  tree: "wiring tree",
};

export function TopologyMap({
  devices,
  layout,
  selectedId,
  onSelect,
  selectedSwitchId = null,
  onSelectSwitch,
  compact = false,
}: Props) {
  const { devices: allDevices, switches, selfId } = useCatalog();
  // Spine bus label reflects the real gateway, not a hardcoded address (#124).
  const net = useMemo(() => gatewayInfo(allDevices), [allDevices]);
  const { positions, edges, deco, pseudo } = useMemo(
    () => computeLayout(layout, devices, compact, switches),
    [layout, devices, compact, switches]
  );
  const getPos = (id: string): Pos => positions[id] ?? { x: 0, y: 0 };
  const selPos = getPos(selectedId);
  const selfPos = selfId && positions[selfId] ? positions[selfId] : null;

  const vbW = deco.kind === "tree" ? deco.width : MAP_W;
  const vbH = deco.kind === "tree" ? deco.height : MAP_H;
  const isTree = deco.kind === "tree";

  // Drag-to-pan for the fixed-scale tree (background only — rows keep their
  // click). Wheel / trackpad scrolling works natively via overflow: auto.
  const scrollRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; sl: number; st: number } | null>(null);
  function onPanDown(e: React.PointerEvent) {
    const el = scrollRef.current;
    if (!el) return;
    if ((e.target as Element).closest?.(".node-hit")) return;
    drag.current = { x: e.clientX, y: e.clientY, sl: el.scrollLeft, st: el.scrollTop };
    el.setPointerCapture?.(e.pointerId);
  }
  function onPanMove(e: React.PointerEvent) {
    const el = scrollRef.current;
    if (!el || !drag.current) return;
    el.scrollLeft = drag.current.sl - (e.clientX - drag.current.x);
    el.scrollTop = drag.current.st - (e.clientY - drag.current.y);
  }
  function onPanEnd() {
    drag.current = null;
  }

  const svgEl = (
    <svg
      viewBox={`0 0 ${vbW} ${vbH}`}
      preserveAspectRatio="xMidYMid meet"
      style={isTree ? { width: vbW, height: vbH } : undefined}
    >
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
            <line className="bus" x1={deco.startX - 12} y1={deco.busY} x2={deco.endX} y2={deco.busY} />
            <line
              x1={deco.startX - 12}
              y1={deco.busY - 2}
              x2={deco.endX}
              y2={deco.busY - 2}
              style={{ stroke: "var(--rule-2)", strokeWidth: 0.5 }}
            />
            <text
              x={deco.startX - 12}
              y={deco.busY - 18}
              textAnchor="start"
              style={{
                fontFamily: "var(--mono)",
                fontSize: 9,
                fill: "var(--fg-faint)",
                letterSpacing: "0.12em",
                textTransform: "uppercase",
              }}
            >
              {net.iface} · {net.subnet}
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

        {/* edges — straight for radial/spine, right-angled for the tree */}
        {(() => {
          const selDevice = devices.find(d => d.id === selectedId);
          const selIsGateway = selDevice?.ring === 0;
          return edges.map((e, i) => {
          const p1 = getPos(e.from);
          const p2 = getPos(e.to);
          const onSel = !selIsGateway && (e.to === selectedId || e.from === selectedId);
          const cls = `link ${e.off ? "off" : "on"} ${onSel ? "sel" : ""}`;
          return e.bendX != null ? (
            <path
              key={`e${i}`}
              className={cls}
              d={`M ${p1.x} ${p1.y} H ${e.bendX} V ${p2.y} H ${p2.x}`}
            />
          ) : (
            <line key={`e${i}`} className={cls} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} />
          );
        });})()}

        {/* selection pulse — only when the selected device is visible in this layout */}
        {positions[selectedId] && <circle className="pulse" cx={selPos.x} cy={selPos.y} r={18} />}

        {/* dashed ring around the device this browser is running on */}
        {selfPos && <circle className="self-ring" cx={selfPos.x} cy={selfPos.y} r={11} />}

        {/* infrastructure pseudo nodes (switch/hub ledger, wiring tree only).
            Clicking one shows the ledger info in the side panel. */}
        {(pseudo ?? []).map((p) => (
          <g key={p.id}>
            <rect
              className={`node-box sw ${p.id === selectedSwitchId ? "sel" : ""}`}
              x={p.x - 6}
              y={p.y - 6}
              width={12}
              height={12}
            />
            <text
              className={`node-label ${p.id === selectedSwitchId ? "" : "dim"}`}
              x={p.x + 14}
              y={p.y}
              textAnchor="start"
              dy={3}
            >
              {p.label}
            </text>
            {deco.kind === "tree" && onSelectSwitch && (
              <rect
                className="node-hit"
                x={p.x - 14}
                y={p.y - deco.rowH / 2}
                width={230}
                height={deco.rowH}
                onClick={() => onSelectSwitch(p.id)}
                role="button"
                tabIndex={0}
                aria-label={p.label}
                aria-pressed={p.id === selectedSwitchId}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelectSwitch(p.id);
                  }
                }}
              >
                <title>{p.label}</title>
              </rect>
            )}
          </g>
        ))}

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
                    {d.name}
                  </text>
                  {!compact && !lo.below && (
                    <text className="node-meta" x={lo.x} y={lo.y} textAnchor={lo.anchor} dy={14}>
                      .{lastOctet(d.ip)}
                    </text>
                  )}
                </>
              )}
              {/* generous transparent hit target + hover tooltip; the tree
                  makes the whole row (node + label) clickable */}
              {deco.kind === "tree" ? (
                <rect
                  className="node-hit"
                  x={p.x - (isCenter ? 30 : 14)}
                  y={p.y - deco.rowH / 2}
                  width={230}
                  height={deco.rowH}
                  onClick={() => onSelect(d.id)}
                  role="button"
                  tabIndex={0}
                  aria-label={`${d.name} ${d.ip}`}
                  aria-pressed={isSel}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelect(d.id);
                    }
                  }}
                >
                  <title>
                    {d.name} · {d.ip}
                  </title>
                </rect>
              ) : (
                <circle
                  className="node-hit"
                  cx={p.x}
                  cy={p.y}
                  r={isCenter ? 20 : 13}
                  onClick={() => onSelect(d.id)}
                  role="button"
                  tabIndex={0}
                  aria-label={`${d.name} ${d.ip}`}
                  aria-pressed={isSel}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelect(d.id);
                    }
                  }}
                >
                  <title>
                    {d.name} · {d.ip}
                  </title>
                </circle>
              )}
            </g>
          );
        })}
    </svg>
  );

  return (
    <div className="n-map" id="main-content" tabIndex={-1}>
      {isTree ? (
        <div
          className="map-scroll"
          ref={scrollRef}
          onPointerDown={onPanDown}
          onPointerMove={onPanMove}
          onPointerUp={onPanEnd}
          onPointerCancel={onPanEnd}
        >
          {svgEl}
        </div>
      ) : (
        svgEl
      )}
      <div className="map-corner tl">
        map · <b>{LAYOUT_LABEL[layout]}</b>
      </div>
      <div className="map-corner tr">{devices.length} nodes</div>
      <div className="map-corner bl">
        {isTree ? "↳ click row to select · drag to pan" : "↳ click node for detail"}
      </div>
    </div>
  );
}
