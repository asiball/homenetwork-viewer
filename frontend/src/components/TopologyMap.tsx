// Topology map SVG (radial / wiring tree). Ported from variant-noc.jsx render.
// The tree renders at fixed scale inside a scroll/pan pane; radial scales to fit.

import { useRef, useMemo } from "react";
import { useCatalog } from "../CatalogContext";
import type { Device } from "../types";
import { groupColor, lastOctet } from "../lib/helpers";
import {
  computeLayout,
  type Layout,
  type LayoutKind,
  MAP_H,
  MAP_W,
  type Pos,
} from "../lib/topology";
import { fmtMbps, type LinkAnalysis, pairKey, speedTier } from "../lib/bottleneck";

interface Props {
  devices: Device[]; // already filtered to "visible"
  layout: LayoutKind;
  selectedId: string;
  onSelect: (id: string) => void;
  /** Wiring-tree only: ledger switches are selectable too. */
  selectedSwitchId?: string | null;
  onSelectSwitch?: (id: string) => void;
  compact?: boolean;
  /** Precomputed layout from the parent, to avoid computing it twice (#166).
   *  Falls back to computing here when omitted. */
  layoutResult?: Layout;
  /** Wiring-tree only: when provided, edges are colour-coded by derived link
   *  speed and cable bottlenecks are flagged. Keyed by pairKey(from, to). */
  linkIndex?: Map<string, LinkAnalysis>;
  /** DOM id for the map container (the skip-link target). Pass "" when several
   *  maps share a screen (compare) so the id stays unique on its wrapper. */
  containerId?: string;
}

const LAYOUT_LABEL: Record<LayoutKind, string> = {
  radial: "radial",
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
  layoutResult,
  linkIndex,
  containerId = "main-content",
}: Props) {
  const { switches, selfId } = useCatalog();
  // Reuse the parent's layout when given (HomeView already computes it for its
  // keyboard-nav ordering), else compute it here (#166).
  const { positions, edges, deco, pseudo } = useMemo(
    () => layoutResult ?? computeLayout(layout, devices, compact, switches),
    [layoutResult, layout, devices, compact, switches]
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
      {/* edges — straight for radial, right-angled for the tree */}
      {(() => {
        const selDevice = devices.find((d) => d.id === selectedId);
        const selIsGateway = selDevice?.ring === 0;
        return edges.map((e, i) => {
          const p1 = getPos(e.from);
          const p2 = getPos(e.to);
          const onSel = !selIsGateway && (e.to === selectedId || e.from === selectedId);
          // Link-speed overlay (wiring tree only): colour the edge by its derived
          // speed tier and flag a cable that's the actionable bottleneck. Guarded
          // by isTree so a future radial/other reuse can't mis-colour logical
          // edges. Only online edges — an offline link keeps its dashed styling.
          const link = isTree && !e.off ? linkIndex?.get(pairKey(e.from, e.to)) : undefined;
          const bn = link
            ? ` bn bn-${speedTier(link.linkMbps)}${link.actionable ? " bn-act" : ""}`
            : "";
          const cls = `link ${e.off ? "off" : "on"} ${onSel ? "sel" : ""}${bn}`;
          const edgeShape =
            e.bendX != null ? (
              <path className={cls} d={`M ${p1.x} ${p1.y} H ${e.bendX} V ${p2.y} H ${p2.x}`} />
            ) : (
              <line className={cls} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} />
            );
          // Declutter: every edge is colour-coded, but only label the ones worth
          // acting on — a sub-1G link or a cable bottleneck. The rest stay clean.
          const showLabel = !!link && (link.actionable || speedTier(link.linkMbps) === "slow");
          if (!showLabel || !link) return <g key={`e${i}`}>{edgeShape}</g>;
          // Label the horizontal run into the child (tree) or the line midpoint.
          const lx = e.bendX != null ? (e.bendX + p2.x) / 2 : (p1.x + p2.x) / 2;
          const ly = (e.bendX != null ? p2.y : (p1.y + p2.y) / 2) - 3;
          return (
            <g key={`e${i}`}>
              {edgeShape}
              <text
                className={`link-speed${link.actionable ? " act" : ""}`}
                x={lx}
                y={ly}
                textAnchor="middle"
              >
                {fmtMbps(link.linkMbps)}
              </text>
            </g>
          );
        });
      })()}

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
        // Fill the node with its group colour so the map differentiates devices
        // by category at a glance (#120); status stays in the stroke (on/off/
        // selected). The gateway and the selected node keep their amber accent.
        const tint = !isCenter && !isSel ? { fill: groupColor(d.group) } : undefined;
        const lo = p.labelOffset;
        const showLabel = !isCenter && !!lo;
        return (
          <g key={d.id}>
            <rect
              className={cls}
              style={tint}
              x={p.x - w / 2}
              y={p.y - h / 2}
              width={w}
              height={h}
            />
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
    <div className="n-map" id={containerId || undefined} tabIndex={containerId ? -1 : undefined}>
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
      {isTree && linkIndex && linkIndex.size > 0 && (
        <div className="map-corner br map-legend" aria-hidden="true">
          <span className="lg fast">2.5G+</span>
          <span className="lg med">1G</span>
          <span className="lg slow">&lt;1G</span>
          <span className="lg act">cable ↑</span>
        </div>
      )}
    </div>
  );
}
