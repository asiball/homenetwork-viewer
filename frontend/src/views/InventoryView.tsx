// Inventory view: switch port maps and cable ledger (/inventory).

import { useCatalog } from "../App";
import { Shell } from "../components/Shell";
import { RefreshControls } from "../components/RefreshControls";
import { cableSwatch } from "../lib/helpers";

export function InventoryView() {
  const { devices, switches, cables } = useCatalog();

  function deviceName(id: string): string {
    return devices.find(d => d.id === id)?.name ?? id;
  }

  return (
    <Shell
      devices={devices}
      crumbs={<span>inventory</span>}
      right={<RefreshControls />}
      footer={
        <>
          <span><b>{switches.length}</b> switches</span>
          <span><b>{cables.length}</b> cables</span>
        </>
      }
    >
      <div className="inv-main" id="main-content" tabIndex={-1}>
        {/* Switch port maps */}
        <section className="inv-section">
          <div className="inv-section-title">switches &amp; hubs</div>
          {switches.length === 0 ? (
            <div className="d-sparse">no switches in catalog</div>
          ) : (
            switches.map((sw) => {
              const ports = Object.entries(sw.portMap ?? {}).sort(
                ([a], [b]) => Number(a) - Number(b)
              );
              const usedPorts = ports.filter(([, slot]) => slot !== null).length;
              // Never let a portCount that's smaller than the actual port map
              // hide rows or report negative free ports — take the largest of
              // declared count, highest mapped port number, and entry count.
              const maxMapped = ports.reduce((m, [p]) => Math.max(m, Number(p) || 0), 0);
              const totalPorts = Math.max(sw.portCount ?? 0, maxMapped, ports.length);
              const freePorts = totalPorts - usedPorts;

              return (
                <div key={sw.id} className="inv-card">
                  <div className="inv-card-head">
                    <span className="inv-sw-name">{sw.name}</span>
                    <span className="inv-sw-meta">
                      {sw.model && <span>{sw.model}</span>}
                      {sw.speed && <span>{sw.speed}</span>}
                      {sw.managed && <span className="pill">managed</span>}
                      <span className={`pill ${sw.online ? "on" : "off"}`}>{sw.online ? "online" : "offline"}</span>
                    </span>
                    <span className="inv-sw-ports">
                      {usedPorts}/{totalPorts} ports · <b style={{ color: freePorts > 0 ? "var(--ok)" : "var(--warn)" }}>{freePorts} free</b>
                    </span>
                  </div>
                  <table className="d-table inv-port-table">
                    <thead>
                      <tr>
                        <th style={{ width: 40 }}>port</th>
                        <th>device</th>
                        <th style={{ width: 80 }}>role</th>
                        <th style={{ width: 80 }}>cable</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Array.from({ length: totalPorts }, (_, i) => {
                        const port = String(i + 1);
                        const slot = sw.portMap?.[port] ?? null;
                        return (
                          <tr key={port} className={slot ? "" : "inv-port-empty"}>
                            <td className="port">{port}</td>
                            <td>{slot ? deviceName(slot.device) : <span className="dim-note">—</span>}</td>
                            <td>{slot?.role ?? <span className="dim-note">—</span>}</td>
                            <td>{slot?.cable ?? <span className="dim-note">—</span>}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
            })
          )}
        </section>

        {/* Cable ledger */}
        <section className="inv-section">
          <div className="inv-section-title">cables</div>
          {cables.length === 0 ? (
            <div className="d-sparse">no cables in catalog</div>
          ) : (
            <table className="d-table">
              <thead>
                <tr>
                  <th style={{ width: 60 }}>id</th>
                  <th style={{ width: 40 }}>cat</th>
                  <th style={{ width: 60 }}>len</th>
                  <th style={{ width: 20 }}>color</th>
                  <th>from</th>
                  <th>to</th>
                  <th>notes</th>
                </tr>
              </thead>
              <tbody>
                {cables.map((c) => (
                  <tr key={c.id}>
                    <td className="port">{c.id}</td>
                    <td>{c.cat ?? "—"}</td>
                    <td>{c.len ?? "—"}</td>
                    <td>
                      <span
                        className="swatch"
                        style={{
                          background: cableSwatch(c.color),
                          border: c.color === "white" ? "1px solid var(--rule-2)" : "0",
                          display: "inline-block",
                        }}
                      />
                    </td>
                    <td>{deviceName(c.fromDev)}{c.fromPort != null ? ` · p${c.fromPort}` : ""}</td>
                    <td>{deviceName(c.toDev)}{c.toPort != null ? ` · p${c.toPort}` : ""}</td>
                    <td className="banner">{c.notes ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </Shell>
  );
}
