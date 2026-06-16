// NOC shell: persistent header / left list / footer around a body slot
// (spec §5.1, §6.1). The body fills the map (+side) grid areas.

import { type ReactNode, useState } from "react";
import { Link } from "react-router-dom";
import type { Device } from "../types";
import { DeviceList } from "./DeviceList";

interface Props {
  devices: Device[];
  selectedId?: string;
  onSelect?: (id: string) => void;
  searchQuery?: string;
  onSearchChange?: (q: string) => void;
  crumbs: ReactNode;
  right: ReactNode;
  footer: ReactNode;
  children: ReactNode;
}

export function Shell({
  devices,
  selectedId,
  onSelect,
  searchQuery,
  onSearchChange,
  crumbs,
  right,
  footer,
  children,
}: Props) {
  // Wide screens start with the list open; iPad-portrait starts collapsed.
  const [leftOpen, setLeftOpen] = useState(
    () => typeof window === "undefined" || window.innerWidth > 820,
  );

  return (
    <div className={`noc ${leftOpen ? "left-open" : "left-collapsed"}`}>
      <a href="#main-content" className="skip-link">メインコンテンツへ</a>
      <header className="n-head">
        <button
          type="button"
          className="iconbtn"
          aria-label="toggle device list"
          aria-pressed={leftOpen}
          onClick={() => setLeftOpen((v) => !v)}
        >
          ≡
        </button>
        <Link className="brand" to="/" title="home">
          <span className="dot" /> <b>HOMENET / NOC</b>
        </Link>
        <div className="crumbs">{crumbs}</div>
        <div className="right">{right}</div>
      </header>

      <DeviceList
        devices={devices}
        selectedId={selectedId}
        onSelect={onSelect}
        searchQuery={searchQuery}
        onSearchChange={onSearchChange}
      />

      {children}

      <footer className="n-foot">{footer}</footer>
    </div>
  );
}
