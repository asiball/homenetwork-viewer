// Home screen: topology map + summary (spec §5).

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useCatalog } from "../CatalogContext";
import { api } from "../api";
import { Shell } from "../components/Shell";
import { TopologyMap } from "../components/TopologyMap";
import { SummaryPanel } from "../components/SummaryPanel";
import { SwitchPanel } from "../components/SwitchPanel";
import { RefreshControls } from "../components/RefreshControls";
import { ConfirmModal } from "../components/ConfirmModal";
import { countOnline, gatewayInfo, matchesQuery, orderedByGroup } from "../lib/helpers";
import { computeLayout } from "../lib/topology";
import { analyzeBottlenecks, linkIndexByPair } from "../lib/bottleneck";
import { prefs, type ViewMode } from "../lib/prefs";
import { isTypingTarget, useGlobalKeydown } from "../lib/useGlobalKeydown";
import { useIsNarrow } from "../lib/useIsNarrow";
import { APP_VERSION } from "../version";

function initialView(urlLayout: string | null): ViewMode {
  if (urlLayout === "radial" || urlLayout === "tree" || urlLayout === "compare") {
    return urlLayout;
  }
  return prefs.layout.get();
}

export function HomeView() {
  const { devices, switches, cables, refresh, notify } = useCatalog();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  // Network header info (subnet + iface) derived once from the gateway device.
  const gw = useMemo(() => gatewayInfo(devices), [devices]);

  const [view, setView] = useState<ViewMode>(() => initialView(params.get("layout")));
  // The URL can change out from under `view` without HomeView remounting —
  // browser back/forward, or clicking the brand link back to "/" (which drops
  // the query string but keeps the same route element). Re-derive from the
  // URL whenever it changes so the map never shows a layout the address bar
  // no longer names; changeView() below always writes the URL first, so this
  // is a no-op on the normal click path.
  useEffect(() => {
    const next = initialView(params.get("layout"));
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setView((v) => (v === next ? v : next));
  }, [params]);
  const [showOffline, setShowOffline] = useState(() => prefs.showOffline.get());
  // Wiring-tree link-speed overlay (off by default; only meaningful on the tree).
  const [showSpeeds, setShowSpeeds] = useState(() => prefs.showSpeeds.get());

  // "compare" shows radial + tree stacked; both are "tree-active" for the
  // wiring-tree affordances (switch selection, the ⚡ speed overlay).
  const isCompare = view === "compare";
  const treeActive = view === "tree" || isCompare;
  const [selId, setSelId] = useState<string>(() => {
    // Reopen the most recently viewed device that still exists, else the first.
    const recent = prefs.recent.get().find((id) => devices.some((d) => d.id === id));
    return recent ?? devices[0]?.id ?? "";
  });
  // Ledger switch selected on the wiring tree (side panel shows its ports).
  const [selSwId, setSelSwId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  // Import is a destructive full-catalog replace — confirm via the in-app
  // ConfirmModal (matching delete / leave guards) instead of native confirm().
  const [pendingImport, setPendingImport] = useState<File | null>(null);

  // On phones the right summary panel is hidden (theme.css ≤560px), so tapping
  // a node could update nothing visible. There, route straight to the full
  // detail page (which is mobile-friendly); otherwise drive the side panel (#100).
  const isNarrow = useIsNarrow();

  // Selecting a device always takes the side panel back from a switch.
  function selectDevice(id: string) {
    setSelId(id);
    setSelSwId(null);
  }

  function handleSelect(id: string) {
    if (isNarrow) navigate(`/d/${id}`);
    else selectDevice(id);
  }

  const visible = useMemo(
    () => devices.filter((d) => showOffline || d.online),
    [devices, showOffline]
  );

  const mapVisible = useMemo(
    () => visible.filter((d) => matchesQuery(d, searchQuery)),
    [visible, searchQuery]
  );

  // Compute the geometric layouts once and share them with TopologyMap, instead
  // of the map recomputing them (#166). Both are cheap for a home-size catalog,
  // and compare needs both at once; radial is drawn compact in compare.
  const radialLayout = useMemo(
    () => computeLayout("radial", mapVisible, isCompare, switches),
    [mapVisible, switches, isCompare]
  );
  const treeLayout = useMemo(
    () => computeLayout("tree", mapVisible, false, switches),
    [mapVisible, switches]
  );

  // Link-speed overlay for the wiring tree: derive each cable's speed and index
  // it by endpoint pair so TopologyMap can colour edges + flag bottlenecks.
  // Computed only when a tree is shown with the overlay on (cheap, but skip the
  // work otherwise), and built from the full catalog so a link's far end is
  // resolved even when one endpoint is filtered out of `mapVisible`.
  const linkIndex = useMemo(() => {
    if (!treeActive || !showSpeeds) return undefined;
    return linkIndexByPair(analyzeBottlenecks(devices, switches, cables).links);
  }, [treeActive, showSpeeds, devices, switches, cables]);

  // Keyboard-nav order matches what's actually on the map (mapVisible, i.e.
  // search-filtered) — otherwise ↑/↓ would jump to devices hidden by the search
  // and the side panel could show a node that isn't drawn. When a tree is shown
  // (incl. compare), follow the tree's row order; else group order.
  const ordered = useMemo(() => {
    if (treeActive) {
      const { positions } = treeLayout;
      return [...mapVisible].sort((a, b) => (positions[a.id]?.y ?? 0) - (positions[b.id]?.y ?? 0));
    }
    return orderedByGroup(mapVisible);
  }, [treeActive, mapVisible, treeLayout]);

  // `selId` holds the user's last explicit device pick; `selected` resolves it
  // against what's actually on the map, falling back to the first visible device
  // when that pick is filtered out. We read `selected` everywhere (never write it
  // back into selId), so there's no derive-then-store feedback loop — a stale
  // selId is simply re-resolved each render (#164).
  const selected = mapVisible.find((d) => d.id === selId) ?? mapVisible[0];
  // Switch selection is a second, optional axis overlaid on the wiring tree (the
  // map highlights the selected device *and* switch at once). Switch nodes only
  // exist on the tree, so the panel falls back to the device summary elsewhere;
  // gating on the layout stops a stale panel after a layout change (#153).
  const selSw = treeActive && selSwId ? (switches.find((s) => s.id === selSwId) ?? null) : null;

  // The tree's switch set depends on which devices are visible, so a search /
  // offline-toggle change can hide the selected switch's node while its side
  // panel lingers. Drop the switch selection whenever the visible set changes so
  // the panel falls back to the device summary instead of going stale (#153).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelSwId(null);
  }, [searchQuery, showOffline]);

  function changeView(next: ViewMode) {
    setView(next);
    setSelSwId(null);
    prefs.layout.set(next);
    const p = new URLSearchParams(params);
    p.set("layout", next);
    setParams(p, { replace: true });
  }

  function toggleOffline() {
    setShowOffline((v) => {
      prefs.showOffline.set(!v);
      return !v;
    });
  }

  function toggleSpeeds() {
    setShowSpeeds((v) => {
      prefs.showSpeeds.set(!v);
      return !v;
    });
  }

  // ↑↓ move selection, Enter opens detail (spec §5.6).
  useGlobalKeydown(
    useCallback(
      (e: KeyboardEvent) => {
        if (isTypingTarget(e)) return;
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          // Navigate from the *resolved* selection, so a stale/filtered selId
          // never leaves findIndex at -1 (the old write-back effect existed only
          // to keep selId in sync — now unnecessary, #164).
          const i = ordered.findIndex((d) => d.id === selected?.id);
          if (i === -1) return;
          const next = e.key === "ArrowDown" ? i + 1 : i - 1;
          const wrapped = (next + ordered.length) % ordered.length;
          // selectDevice() inlined so the handler needs no extra deps.
          setSelId(ordered[wrapped].id);
          setSelSwId(null);
        } else if (e.key === "Enter" && selected) {
          // Let a focused interactive element handle its own Enter (don't
          // double-fire). The old check only matched tagName BUTTON/A, but the
          // map's SVG node/switch hit areas are rect/circle with role="button"
          // (lowercase tagName) — so a focused tree row's Enter fired *both*
          // its own onKeyDown (select) *and* this handler (navigate using the
          // stale render-time `selected`), misnavigating away from what was
          // just selected.
          if ((e.target as HTMLElement)?.closest?.('button, a, [role="button"]')) return;
          navigate(`/d/${selected.id}`);
        }
      },
      [ordered, selected, navigate]
    )
  );

  const layoutLabel = view === "compare" ? "compare" : view === "tree" ? "wiring tree" : "radial";

  async function handleExport() {
    let url: string | null = null;
    try {
      const blob = await api.export();
      url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `homenet-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      notify(err instanceof Error ? err.message : "export failed", "err");
    } finally {
      // Always release the object URL, even if click()/append threw, so the blob
      // isn't pinned in memory (#166).
      if (url) URL.revokeObjectURL(url);
    }
  }

  function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setPendingImport(file); // open the confirm modal; actual import on confirm
  }

  async function confirmImport() {
    const file = pendingImport;
    setPendingImport(null);
    if (!file) return;
    try {
      const result = await api.importCatalog(file);
      await refresh();
      notify(
        `imported: ${result.devices} devices, ${result.switches} switches, ${result.cables} cables`
      );
    } catch (err) {
      notify(err instanceof Error ? err.message : "import failed", "err");
    }
  }

  return (
    <Shell
      devices={visible}
      selectedId={selected?.id}
      onSelect={handleSelect}
      searchQuery={searchQuery}
      onSearchChange={setSearchQuery}
      crumbs={
        <>
          net <span>{gw.subnet}</span>
          <span className="hide-sm">
            {" "}
            &nbsp;·&nbsp; iface <span>{gw.iface}</span>
          </span>
          <span className="hide-md">
            {" "}
            &nbsp;·&nbsp; layout <span>{layoutLabel}</span>
          </span>
        </>
      }
      right={
        <>
          {/* .tog-txt labels collapse to icon-only under 820px (DoD #8) — the
              aria-labels keep the buttons named when the text is hidden. */}
          <div className="layout-tog" title="switch layout (radial / tree / compare)">
            <button
              className={view === "radial" ? "sel" : ""}
              onClick={() => changeView("radial")}
              aria-label="radial layout"
            >
              ◎ <span className="tog-txt">radial</span>
            </button>
            <button
              className={view === "tree" ? "sel" : ""}
              onClick={() => changeView("tree")}
              aria-label="tree layout"
            >
              ⑂ <span className="tog-txt">tree</span>
            </button>
            <button
              className={view === "compare" ? "sel" : ""}
              onClick={() => changeView("compare")}
              title="radial + tree side by side"
              aria-label="compare layouts"
            >
              ⊟ <span className="tog-txt">compare</span>
            </button>
          </div>
          {treeActive && (
            <button
              className={`btn ${showSpeeds ? "" : "ghost"}`}
              onClick={toggleSpeeds}
              aria-pressed={showSpeeds}
              aria-label="link-speed overlay"
              title="colour wiring-tree links by speed & flag cable bottlenecks"
            >
              ⚡ <span className="tog-txt">speeds</span>
            </button>
          )}
          <RefreshControls />
          <Link className="btn" to="/add">
            + add
          </Link>
        </>
      }
      footer={
        <>
          <span>
            <b>{countOnline(devices)}</b> up
          </span>
          <span>
            <b style={{ color: "var(--err)" }}>{devices.length - countOnline(devices)}</b> down
          </span>
          <span>
            subnet <b>/24</b>
          </span>
          <button className={`tg ${showOffline ? "on" : ""}`} onClick={toggleOffline}>
            show offline · <b>{showOffline ? "on" : "off"}</b>
          </button>
          <span className="right" style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <button className="tg" onClick={handleExport} title="download catalog backup">
              &#x21E9; export
            </button>
            <label className="tg" style={{ cursor: "pointer" }} title="restore catalog from backup">
              &#x21E7; import
              <input
                type="file"
                accept=".json"
                style={{ display: "none" }}
                onChange={handleImport}
              />
            </label>
            <span>
              homenet {APP_VERSION} · {layoutLabel}
            </span>
          </span>
        </>
      }
    >
      {selected ? (
        <>
          {isCompare ? (
            <div className="map-compare" id="main-content" tabIndex={-1}>
              <TopologyMap
                devices={mapVisible}
                layout="radial"
                layoutResult={radialLayout}
                compact
                selectedId={selected.id}
                onSelect={handleSelect}
                containerId=""
              />
              <TopologyMap
                devices={mapVisible}
                layout="tree"
                layoutResult={treeLayout}
                selectedId={selected.id}
                onSelect={handleSelect}
                selectedSwitchId={selSwId}
                onSelectSwitch={setSelSwId}
                linkIndex={linkIndex}
                containerId=""
              />
            </div>
          ) : (
            <TopologyMap
              devices={mapVisible}
              layout={view === "tree" ? "tree" : "radial"}
              layoutResult={view === "tree" ? treeLayout : radialLayout}
              selectedId={selected.id}
              onSelect={handleSelect}
              selectedSwitchId={selSwId}
              onSelectSwitch={setSelSwId}
              linkIndex={linkIndex}
            />
          )}
          {selSw ? <SwitchPanel sw={selSw} /> : <SummaryPanel device={selected} />}
        </>
      ) : (
        <div className="n-map">
          <div className="center-screen">no devices · add one to begin</div>
        </div>
      )}
      <ConfirmModal
        open={pendingImport != null}
        danger
        title="Replace all catalog data?"
        message={
          pendingImport
            ? `Import "${pendingImport.name}" and replace ALL devices, switches and cables. This cannot be undone (a backup is saved server-side).`
            : ""
        }
        confirmLabel="Replace"
        cancelLabel="Cancel"
        onConfirm={confirmImport}
        onCancel={() => setPendingImport(null)}
      />
    </Shell>
  );
}
