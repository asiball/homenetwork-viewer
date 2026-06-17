// Cable jacket colour swatch. Shared by the detail view and the inventory
// cable ledger so the colour→swatch rendering (incl. the white-border special
// case) lives in one place.

import type { CSSProperties } from "react";
import { cableSwatch } from "../lib/helpers";

interface Props {
  color?: string | null;
  style?: CSSProperties;
}

export function CableSwatch({ color, style }: Props) {
  return (
    <span
      className="swatch"
      style={{
        background: cableSwatch(color),
        border: color === "white" ? "1px solid var(--rule-2)" : "0",
        ...style,
      }}
    />
  );
}
