// Home screen: topology map + summary (spec §5).

import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useCatalog } from "../App";
import { Shell } from "../components/Shell";
import { TopologyMap } from "../components/TopologyMap";
import { SummaryPanel } from "../components/SummaryPanel";
import { SwitchPanel } from "../components/SwitchPanel";
import { RefreshControls } from "../components/RefreshControls";
import { countOnline, orderedByGroup } from "../lib/helpers";
import { computeLayout, type LayoutKind } from "../lib/topology";
import { APP_VERSION } from "../version";

const LAYOUT_KEY = "homenet.layout";
const OFFLINE_KEY = "homenet.showOffline";

function initialLayout(urlLayout: string | null): LayoutKind {
  if (urlLayout === "spine" || urlLayout === "radial" || urlLayout === "tree") {
    return urlLayout;
  }
  const stored = localStorage.getItem(LAYOUT_KEY);
  return stored === "spine" || stored === "tree" ? stored : "radial";
}

export function HomeView() {
  const { devices, switches } = useCatalog();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  const [layout, setLayout] = useState<LayoutKind>(() => initialLayout(params.get("layout")));
  const [showOffline, setShowOffline] = useState(
    () => localStorage.getItem(OFFLINE_KEY) !== "false",
  );
  const [selId, setSelId] = useState<string>(
    () => devices[0]?.id ?? "",
  );
  // Ledger switch selected on the wiring tree (side panel shows its ports).
  const [selSwId, setSelSwId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Selecting a device always takes the side panel back from a switch.
  function selectDevice(id: string) {
    setSelId(id);
    setSelSwId(null);
  }

  const visible = useMemo(
    () => devices.filter((d) => showOffline || d.online),
    [devices, showOffline],
  );

  const mapVisible = useMemo(() => {
    if (!searchQuery.trim()) return visible;
    const needle = searchQuery.trim().toLowerCase();
    return visible.filter((d) =>
      [d.name, d.host, d.ip, d.type, d.group, d.id].some((v) =>
        v.toLowerCase().includes(needle),
      ),
    );
  }, [visible, searchQuery]);

  // Keyboard-nav order matches what's on screen: grouped-sidebar order for
  // radial/spine, top-to-bottom row order for the wiring tree.
  const ordered = useMemo(() => {
    if (layout === "tree") {
      const { positions } = computeLayout("tree", visible, false, switches);
      return [...visible].sort(
        (a, b) => (positions[a.id]?.y ?? 0) - (positions[b.id]?.y ?? 0),
      );
    }
    return orderedByGroup(visible);
  }, [layout, visible, switches]);

  const selected = visible.find((d) => d.id === selId) ?? visible[0];
  const selSw = selSwId ? (switches.find((s) => s.id === selSwId) ?? null) : null;

  // Keep selection valid as visibility changes.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (selected && selected.id !== selId) setSelId(selected.id);
  }, [selected, selId]);

  function changeLayout(next: LayoutKind) {
    setLayout(next);
    setSelSwId(null);
    localStorage.setItem(LAYOUT_KEY, next);
    const p = new URLSearchParams(params);
    p.set("layout", next);
    setParams(p, { replace: true });
  }

  function toggleOffline() {
    setShowOffline((v) => {
      localStorage.setItem(OFFLINE_KEY, String(!v));
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
          <span className="right">homenet {APP_VERSION} · {layoutLabel}</span>
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
    </Shell>
  );
}
