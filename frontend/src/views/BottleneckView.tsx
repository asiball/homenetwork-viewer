// Bottleneck analysis (/analysis): derive each wired link's rated speed from the
// catalog (cable cat + NIC conn + switch speed) and surface where the LAN is
// capped, so an upgrade can target the real choke point. Computed on demand from
// the "解析を実行" button — nothing runs until you ask for it.

import { useState } from "react";
import { useCatalog } from "../CatalogContext";
import { Shell } from "../components/Shell";
import { RefreshControls } from "../components/RefreshControls";
import {
  analyzeBottlenecks,
  fmtMbps,
  type BottleneckReport,
  type LimitedBy,
} from "../lib/bottleneck";

const LIMIT_LABEL: Record<LimitedBy, string> = {
  cable: "cable",
  from: "endpoint",
  to: "endpoint",
  balanced: "balanced",
  unknown: "unknown",
};

function limitPill(limitedBy: LimitedBy, actionable: boolean) {
  if (actionable) return <span className="pill warn">cable ↑</span>;
  if (limitedBy === "unknown") return <span className="pill">unknown</span>;
  if (limitedBy === "balanced") return <span className="pill on">balanced</span>;
  return <span className="pill">{LIMIT_LABEL[limitedBy]}</span>;
}

export function BottleneckView() {
  const { devices, switches, cables } = useCatalog();
  const [report, setReport] = useState<BottleneckReport | null>(null);
  const [ranAt, setRanAt] = useState<string | null>(null);
  // The catalog identity (array references) the current report was computed
  // from. useCatalog() hands out fresh arrays on every refetch/import/edit, so
  // comparing references — rather than re-diffing the data — is enough to
  // detect "the report you're looking at is no longer what's in the catalog"
  // (#review item 13).
  const [ranSnapshot, setRanSnapshot] = useState<{
    devices: typeof devices;
    switches: typeof switches;
    cables: typeof cables;
  } | null>(null);

  function run() {
    setReport(analyzeBottlenecks(devices, switches, cables));
    setRanAt(new Date().toLocaleTimeString());
    setRanSnapshot({ devices, switches, cables });
  }

  const stale =
    report != null &&
    ranSnapshot != null &&
    (ranSnapshot.devices !== devices ||
      ranSnapshot.switches !== switches ||
      ranSnapshot.cables !== cables);

  return (
    <Shell
      devices={devices}
      crumbs={<span>bottleneck analysis</span>}
      right={<RefreshControls />}
      footer={
        <>
          <span>
            <b>{cables.length}</b> cables
          </span>
          {report && (
            <span>
              worst link <b>{fmtMbps(report.worstLinkMbps)}</b>
            </span>
          )}
          {report && (
            <span>
              <b style={{ color: report.actionableCount ? "var(--warn)" : "var(--ok)" }}>
                {report.actionableCount}
              </b>{" "}
              cable-limited
            </span>
          )}
          {ranAt && <span className="right">ran {ranAt}</span>}
        </>
      }
    >
      <div className="inv-main" id="main-content" tabIndex={-1}>
        <section className="inv-section">
          <div className="inv-section-title">
            link-speed bottlenecks
            <button className="btn" style={{ marginLeft: 12 }} onClick={run}>
              {report ? "↻ 再計算" : "▶ 解析を実行"}
            </button>
            {stale && (
              <span
                className="pill warn"
                style={{ marginLeft: 8 }}
                title="catalog changed since this report ran — results below may be out of date"
              >
                stale · 再計算
              </span>
            )}
          </div>

          <p className="d-sparse" style={{ maxWidth: 760 }}>
            ケーブルの規格（cat）・機器のNIC（conn）・スイッチの速度から各リンクの上限速度を推定し、
            遅い順に並べます。<b>cable ↑</b> は「ケーブルを上位規格に替えれば速くなる」リンク、
            <b> endpoint</b> は機器/スイッチ側が上限、<b> unknown</b>{" "}
            は速度を判定できない要素を含むリンクです。
            <br />
            前提: Cat5e=1G, Cat6/6a=10G, Wired 1G/2.5G=NIC速度。Wi-Fi 接続は有線経路に含めません。
          </p>

          {!report ? (
            <div className="d-sparse">「解析を実行」を押すと計算します。</div>
          ) : report.links.length === 0 ? (
            <div className="d-sparse">no cables in catalog to analyse</div>
          ) : (
            <table className="d-table">
              <thead>
                <tr>
                  <th style={{ width: 60 }}>cable</th>
                  <th style={{ width: 50 }}>cat</th>
                  <th>from</th>
                  <th>to</th>
                  <th style={{ width: 60 }}>link</th>
                  <th style={{ width: 90 }}>limited by</th>
                </tr>
              </thead>
              <tbody>
                {report.links.map((l) => (
                  <tr key={l.cableId} className={l.actionable ? "bn-actionable" : ""}>
                    <td className="port">{l.cableId}</td>
                    <td>{l.cat ?? <span className="dim-note">—</span>}</td>
                    <td>
                      {l.fromLabel} <span className="dim-note">({fmtMbps(l.fromMbps)})</span>
                    </td>
                    <td>
                      {l.toLabel} <span className="dim-note">({fmtMbps(l.toMbps)})</span>
                    </td>
                    <td>
                      <b>{fmtMbps(l.linkMbps)}</b>
                    </td>
                    <td>{limitPill(l.limitedBy, l.actionable)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {report && report.paths.length > 0 && (
          <section className="inv-section">
            <div className="inv-section-title">per-device ceiling (path to gateway)</div>
            <table className="d-table">
              <thead>
                <tr>
                  <th>device</th>
                  <th style={{ width: 60 }}>hops</th>
                  <th style={{ width: 70 }}>ceiling</th>
                  <th style={{ width: 90 }}>bottleneck</th>
                </tr>
              </thead>
              <tbody>
                {report.paths.map((p) => (
                  <tr key={p.deviceId}>
                    <td>{p.deviceLabel}</td>
                    <td>{p.hops.length}</td>
                    <td>
                      <b>{fmtMbps(p.effectiveMbps)}</b>
                      {p.hasUnknown && <span className="dim-note"> ?</span>}
                    </td>
                    <td className="port">
                      {p.bottleneckCableId ?? <span className="dim-note">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
      </div>
    </Shell>
  );
}
