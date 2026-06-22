// Sparkline mini-chart (88×24, spec §7.4). Ported from view-detail.jsx.

interface SparkProps {
  values: number[];
  color?: "amber" | "ok" | "dim";
  w?: number;
  h?: number;
}

function sparkPath(values: number[], w: number, h: number, pad = 2): string {
  if (!values || !values.length) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const step = (w - pad * 2) / Math.max(1, values.length - 1);
  return values
    .map((v, i) => {
      const x = pad + i * step;
      const y = h - pad - ((v - min) / range) * (h - pad * 2);
      return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
}

function sparkArea(values: number[], w: number, h: number, pad = 2): string {
  const line = sparkPath(values, w, h, pad);
  if (!line) return "";
  return (
    line + ` L ${(w - pad).toFixed(1)} ${(h - pad).toFixed(1)} L ${pad} ${(h - pad).toFixed(1)} Z`
  );
}

export function Sparkline({ values, color = "amber", w = 88, h = 24 }: SparkProps) {
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <path className={`spark-area ${color}`} d={sparkArea(values, w, h)} />
      <path className={`spark ${color}`} d={sparkPath(values, w, h)} />
    </svg>
  );
}
