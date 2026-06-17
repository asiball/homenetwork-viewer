// Home screen: topology map + summary (spec §5).

import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useCatalog } from "../CatalogContext";
import { api } from "../api";
import { Shell } from "../components/Shell";
import { TopologyMap } from "../components/TopologyMap";
import { SummaryPanel } from "../components/SummaryPanel";
import { SwitchPanel } from "../components/SwitchPanel";
import { RefreshControls } from "../components/RefreshControls";
import { ConfirmModal } from "../components/ConfirmModal";
import { countOnline, matchesQuery, orderedByGroup } from "../lib/helpers";
import { computeLayout, type LayoutKind } from "../lib/topology";
import { prefs } from "../lib/prefs";
import { APP_VERSION } from "../version";

function initialLayout(urlLayout: string | null): LayoutKind {
  if (urlLayout === "spine" || urlLayout === "radial" || urlLayout === "tree") {
    return urlLayout;
  }
  return prefs.layout.get();
}

export function HomeView() {
  const { devices, switches, refresh, notify } = useCatalog();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  const [layout, setLayout] = useState<LayoutKind>(() => initialLayout(params.get("layout")));
  const [showOffline, setShowOffline] = useState(() => prefs.showOffline.get());
  const [selId, setSelId] = useState<string>(
    () => devices[0]?.id ?? "",
  );
  // Ledger switch selected on the wiring tree (side panel shows its ports).
  const [selSwId, setSelSwId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  // Import is a destructive full-catalog replace — confirm via the in-app
  // ConfirmModal (matching delete / leave guards) instead of native confirm().
  const [pendingImport, setPendingImport] = useState<File | null>(null);

  // Selecting a device always takes the side panel back from a switch.
  function selectDevice(id: string) {
    setSelId(id);
    setSelSwId(null);
  }

  const visible = useMemo(
    () => devices.filter((d) => showOffline || d.online),
    [devices, showOffline],
  );

  const mapVisible = useMemo(
    () => visible.filter((d) => matchesQuery(d, searchQuery)),
    [visible, searchQuery],
  );

  // Keyboard-nav order matches what's actually on the map (mapVisible, i.e.
  // search-filtered) — otherwise ↑/↓ would jump to devices hidden by the search
  // and the side panel could show a node that isn't drawn.
  const ordered = useMemo(() => {
    if (layout === "tree") {
      const { positions } = computeLayout("tree", mapVisible, false, switches);
      return [...mapVisible].sort(
        (a, b) => (positions[a.id]?.y ?? 0) - (positions[b.id]?.y ?? 0),
      );
    }
    return orderedByGroup(mapVisible);
  }, [layout, mapVisible, switches]);

  const selected = mapVisible.find((d) => d.id === selId) ?? mapVisible[0];
  const selSw = selSwId ? (switches.find((s) => s.id === selSwId) ?? null) : null;

  // Keep selection valid as visibility changes.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (selected && selected.id !== selId) setSelId(selected.id);
  }, [selected, selId]);

  function changeLayout(next: LayoutKind) {
    setLayout(next);
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

  // ↑↓ move selection, Enter opens detail (spec §5.6).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag && /^(INPUT|TEXTAREA|SELECT)$/.test(tag)) return;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const i = ordered.findIndex((d) => d.id === selId);
        if (i === -1) return;
        const next = e.key === "ArrowDown" ? i + 1 : i - 1;
        const wrapped = (next + ordered.length) % ordered.length;
        selectDevice(ordered[wrapped].id);
      } else if (e.key === "Enter" && selected) {
        // Let a focused button/link handle its own Enter (don't double-fire).
        if (tag === "BUTTON" || tag === "A") return;
        navigate(`/d/${selected.id}`);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ordered, selId, selected, navigate]);

  const layoutLabel =
    layout === "spine" ? "spine / bus" : layout === "tree" ? "wiring tree" : "radial";

  async function handleExport() {
    try {
      const blob = await api.export();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `homenet-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      notify(err instanceof Error ? err.message : "export failed", "err");
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
      notify(`imported: ${result.devices} devices, ${result.switches} switches, ${result.cables} cables`);
    } catch (err) {
      notify(err instanceof Error ? err.message : "import failed", "err");
    }
  }

  return (
    <Shell
      devices={visible}
      selectedId={selected?.id}
      onSelect={selectDevice}
      searchQuery={searchQuery}
      onSearchChange={setSearchQuery}
      crumbs={
        <>
          net <span>{devices.find(d => d.type === "router" || d.ring === 0)?.detail?.net?.ipv4?.replace(/\.\d+\/\d+$/, ".0/24") || "192.168.1.0/24"}</span>
          <span className="hide-sm">
            {" "}
            &nbsp;·&nbsp; iface <span>{devices.find(d => d.type === "router" || d.ring === 0)?.host?.split(".")[0] || "br-lan"}</span>
          </span>
          <span className="hide-md">
            {" "}
            &nbsp;·&nbsp; layout <span>{layoutLabel}</span>
          </span>
        </>
      }
      right={
        <>
          <div className="layout-tog" title="switch layout (radial / spine / tree)">
            <button className={layout === "radial" ? "sel" : ""} onClick={() => changeLayout("radial")}>
              ◎ radial
            </button>
            <button className={layout === "spine" ? "sel" : ""} onClick={() => changeLayout("spine")}>
              ─ spine
            </button>
            <button className={layout === "tree" ? "sel" : ""} onClick={() => changeLayout("tree")}>
              ⑂ tree
            </button>
          </div>
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
          <span>subnet <b>/24</b></span>
          <button className={`tg ${showOffline ? "on" : ""}`} onClick={toggleOffline}>
            show offline · <b>{showOffline ? "on" : "off"}</b>
          </button>
          <span className="right" style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <button className="tg" onClick={handleExport} title="download catalog backup">&#x21E9; export</button>
            <label className="tg" style={{ cursor: "pointer" }} title="restore catalog from backup">
              &#x21E7; import
              <input type="file" accept=".json" style={{ display: "none" }} onChange={handleImport} />
            </label>
            <span>homenet {APP_VERSION} · {layoutLabel}</span>
          </span>
        </>
      }
    >
      {selected ? (
        <>
          <TopologyMap
            devices={mapVisible}
            layout={layout}
            selectedId={selected.id}
            onSelect={selectDevice}
            selectedSwitchId={selSwId}
            onSelectSwitch={setSelSwId}
          />
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
