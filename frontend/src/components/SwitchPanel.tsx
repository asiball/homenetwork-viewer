// Side panel for a ledger switch/hub selected on the wiring tree.
// These aren't catalog devices (no detail page), so the panel surfaces the
// ledger: identity, port map with connected devices, free ports, notes.

import { Fragment } from "react";
import { Link } from "react-router-dom";
import { useCatalog } from "../CatalogContext";
import { comparePortKeys } from "../lib/helpers";
import type { Switch } from "../types";

interface Props {
  sw: Switch;
}

export function SwitchPanel({ sw }: Props) {
  const { devices, switches } = useCatalog();
  const nameOf = (id: string) =>
    devices.find((d) => d.id === id)?.name ?? switches.find((s) => s.id === id)?.name ?? id;
  const isDevice = (id: string) => devices.some((d) => d.id === id);

  // Labelled ports (e.g. "sfp1") must sort after the numbered ones, not collapse
  // to NaN under a plain Number() compare (#151).
  const ports = Object.entries(sw.portMap ?? {}).sort((a, b) => comparePortKeys(a[0], b[0]));
  const used = ports.filter(([, slot]) => slot != null).length;

  return (
    <aside className="n-side" aria-label="switch summary">
      <div className="panel" data-title="identity">
        <div className="id-row">
          <span className={`pill ${sw.online ? "on" : "off"}`}>
            {sw.online ? "ONLINE" : "OFFLINE"}
          </span>
          <span className="pill">{sw.type}</span>
          {sw.managed != null && (
            <span className="pill">{sw.managed ? "managed" : "unmanaged"}</span>
          )}
        </div>
        <div className="dname">{sw.name}</div>
        <div className="dhost">{sw.model ?? "—"}</div>
      </div>

      <div className="panel" data-title="info">
        <dl>
          <dt>location</dt>
          <dd>{sw.location ?? "—"}</dd>
          <dt>speed</dt>
          <dd>{sw.speed ?? "—"}</dd>
          <dt>ports</dt>
          <dd>{sw.portCount != null ? `${used} / ${sw.portCount} used` : `${used} used`}</dd>
          {sw.radio && (
            <>
              <dt>radio</dt>
              <dd>{sw.radio}</dd>
            </>
          )}
        </dl>
      </div>

      <div className="panel" data-title="port map">
        {ports.length > 0 ? (
          <dl>
            {ports.map(([port, slot]) => (
              <Fragment key={port}>
                <dt>p{port}</dt>
                <dd>
                  {slot ? (
                    <>
                      {isDevice(slot.device) ? (
                        <Link className="weblink" to={`/d/${slot.device}`}>
                          {nameOf(slot.device)}
                        </Link>
                      ) : (
                        nameOf(slot.device)
                      )}
                      {slot.role === "uplink" && <span className="dim-note"> · uplink</span>}
                      {slot.cable && <span className="dim-note"> · {slot.cable}</span>}
                    </>
                  ) : (
                    <span className="dim-note">— free</span>
                  )}
                </dd>
              </Fragment>
            ))}
          </dl>
        ) : (
          <div className="blob">no wired ports</div>
        )}
      </div>

      {sw.notes && (
        <div className="panel" data-title="notes">
          <div className="blob">&gt; {sw.notes}</div>
        </div>
      )}
    </aside>
  );
}
