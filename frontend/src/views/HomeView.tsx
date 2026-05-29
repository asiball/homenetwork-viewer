// Home screen: topology map + summary (spec §5).

import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useCatalog } from "../App";
import { Shell } from "../components/Shell";
import { TopologyMap } from "../components/TopologyMap";
import { SummaryPanel } from "../components/SummaryPanel";
import { RefreshControls } from "../components/RefreshControls";
import { GROUP_ORDER } from "../types";
import type { LayoutKind } from "../lib/topology";

const LAYOUT_KEY = "homenet.layout";
const OFFLINE_KEY = "homenet.showOffline";

function initialLayout(urlLayout: string | null): LayoutKind {
  if (urlLayout === "spine" || urlLayout === "radial") return urlLayout;
  const stored = localStorage.getItem(LAYOUT_KEY);
  return stored === "spine" ? "spine" : "radial";
}

export function HomeView() {
  const { devices } = useCatalog();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  const [layout, setLayout] = useState<LayoutKind>(() => initialLayout(params.get("layout")));
  const [showOffline, setShowOffline] = useState(
    () => localStorage.getItem(OFFLINE_KEY) !== "false",
  );
  const [selId, setSelId] = useState<string>(
    () => (devices.some((d) => d.id === "nas") ? "nas" : devices[0]?.id) ?? "",
  );

  const visible = useMemo(
    () => devices.filter((d) => showOffline || d.online),
    [devices, showOffline],
  );

  // Display order matches the grouped sidebar — used for keyboard nav.
  const ordered = useMemo(
    () => GROUP_ORDER.flatMap((g) => visible.filter((d) => d.group === g)),
    [visible],
  );

  const selected = visible.find((d) => d.id === selId) ?? visible[0];

  // Keep selection valid as visibility changes.
  useEffect(() => {
    if (selected && selected.id !== selId) setSelId(selected.id);
  }, [selected, selId]);

  function changeLayout(next: LayoutKind) {
    setLayout(next);
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
      const t = e.target as HTMLElement;
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const i = ordered.findIndex((d) => d.id === selId);
        if (i === -1) return;
        const next = e.key === "ArrowDown" ? i + 1 : i - 1;
        const wrapped = (next + ordered.length) % ordered.length;
        setSelId(ordered[wrapped].id);
      } else if (e.key === "Enter" && selected) {
        navigate(`/d/${selected.id}`);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ordered, selId, selected, navigate]);

  const layoutLabel = layout === "spine" ? "spine / bus" : "radial";

  return (
    <Shell
      devices={visible}
      selectedId={selected?.id}
      onSelect={setSelId}
      crumbs={
        <>
          net <span>192.168.1.0/24</span>
          <span className="hide-sm">
            {" "}
            &nbsp;·&nbsp; iface <span>br-lan</span> &nbsp;·&nbsp; layout{" "}
            <span>{layoutLabel}</span>
          </span>
        </>
      }
      right={
        <>
          <div className="layout-tog" title="レイアウト切替 (radial / spine)">
            <button className={layout === "radial" ? "sel" : ""} onClick={() => changeLayout("radial")}>
              ◎ radial
            </button>
            <button className={layout === "spine" ? "sel" : ""} onClick={() => changeLayout("spine")}>
              ─ spine
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
            <b>{visible.filter((d) => d.online).length}</b> up
          </span>
          <span>
            <b style={{ color: "var(--err)" }}>{visible.filter((d) => !d.online).length}</b> down
          </span>
          <span>subnet <b>/24</b></span>
          <button className={`tg ${showOffline ? "on" : ""}`} onClick={toggleOffline}>
            show offline · <b>{showOffline ? "on" : "off"}</b>
          </button>
          <span className="right">homenet v1.0 · {layoutLabel}</span>
        </>
      }
    >
      {selected ? (
        <>
          <TopologyMap
            devices={visible}
            layout={layout}
            selectedId={selected.id}
            onSelect={setSelId}
          />
          <SummaryPanel device={selected} />
        </>
      ) : (
        <div className="n-map">
          <div className="center-screen">no devices · add one to begin</div>
        </div>
      )}
    </Shell>
  );
}
