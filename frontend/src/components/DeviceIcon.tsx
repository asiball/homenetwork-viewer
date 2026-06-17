// Inline SVG icon per device `type` (spec §3.1 "type → icon"; issue #120).
//
// Icons are simple 24×24 stroke shapes so they read at small sizes and inherit
// the surrounding text colour (`stroke: currentColor`). `type` is a free-text
// field, so unknown values fall back to a generic device glyph rather than
// rendering nothing.

import type { CSSProperties, ReactElement } from "react";

// Each entry is the inner geometry of a 24×24 viewBox. Grouped where types
// share a natural glyph (switch/hub, tablet/reader, speaker/media).
const SHAPES: Record<string, ReactElement> = {
  router: (
    <>
      <rect x="3" y="13" width="18" height="7" rx="1.5" />
      <line x1="7" y1="16.5" x2="7" y2="16.5" />
      <path d="M9 13l3-5M15 13l-3-5" />
      <path d="M9.5 6.5a3.5 3.5 0 0 1 5 0" />
    </>
  ),
  ap: (
    <>
      <path d="M5 10a9 9 0 0 1 14 0" />
      <path d="M8 13a5 5 0 0 1 8 0" />
      <circle cx="12" cy="17" r="1.4" />
    </>
  ),
  nas: (
    <>
      <rect x="5" y="3" width="14" height="18" rx="1.5" />
      <line x1="8" y1="7" x2="16" y2="7" />
      <line x1="8" y1="11" x2="16" y2="11" />
      <circle cx="9" cy="16.5" r="1" />
    </>
  ),
  switch: (
    <>
      <rect x="3" y="8" width="18" height="8" rx="1.5" />
      <line x1="7" y1="16" x2="7" y2="19" />
      <line x1="12" y1="16" x2="12" y2="19" />
      <line x1="17" y1="16" x2="17" y2="19" />
    </>
  ),
  desktop: (
    <>
      <rect x="3" y="4" width="18" height="12" rx="1.5" />
      <line x1="9" y1="20" x2="15" y2="20" />
      <line x1="12" y1="16" x2="12" y2="20" />
    </>
  ),
  laptop: (
    <>
      <path d="M6 5h12v10H6z" />
      <line x1="3" y1="19" x2="21" y2="19" />
    </>
  ),
  phone: (
    <>
      <rect x="7" y="3" width="10" height="18" rx="2" />
      <line x1="11" y1="18" x2="13" y2="18" />
    </>
  ),
  tablet: (
    <>
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <line x1="11" y1="18" x2="13" y2="18" />
    </>
  ),
  wearable: (
    <>
      <rect x="8" y="8" width="8" height="8" rx="2" />
      <path d="M10 8l.5-4h3l.5 4M10 16l.5 4h3l.5-4" />
    </>
  ),
  tv: (
    <>
      <rect x="3" y="5" width="18" height="12" rx="1.5" />
      <line x1="8" y1="20" x2="16" y2="20" />
    </>
  ),
  media: (
    <>
      <rect x="3" y="6" width="18" height="12" rx="1.5" />
      <path d="M10 10l5 2-5 2z" />
    </>
  ),
  console: (
    <>
      <rect x="2" y="8" width="20" height="9" rx="4.5" />
      <line x1="6.5" y1="11" x2="6.5" y2="14" />
      <line x1="5" y1="12.5" x2="8" y2="12.5" />
      <circle cx="16" cy="11.5" r="1" />
      <circle cx="18" cy="13.5" r="1" />
    </>
  ),
  speaker: (
    <>
      <rect x="6" y="3" width="12" height="18" rx="2" />
      <circle cx="12" cy="15" r="3" />
      <circle cx="12" cy="7" r="1" />
    </>
  ),
  camera: (
    <>
      <rect x="3" y="7" width="18" height="12" rx="2" />
      <circle cx="12" cy="13" r="3" />
      <path d="M8 7l1.5-2h5L16 7" />
    </>
  ),
  printer: (
    <>
      <path d="M7 9V4h10v5" />
      <rect x="4" y="9" width="16" height="7" rx="1.5" />
      <rect x="7" y="14" width="10" height="6" rx="1" />
    </>
  ),
  reader: (
    <>
      <rect x="6" y="3" width="12" height="18" rx="1.5" />
      <line x1="9" y1="7" x2="15" y2="7" />
      <line x1="9" y1="11" x2="15" y2="11" />
    </>
  ),
  robot: (
    <>
      <rect x="5" y="8" width="14" height="11" rx="2" />
      <line x1="12" y1="4" x2="12" y2="8" />
      <circle cx="12" cy="4" r="1" />
      <circle cx="9.5" cy="13" r="1" />
      <circle cx="14.5" cy="13" r="1" />
    </>
  ),
};
// Aliases for types that share a glyph.
SHAPES.hub = SHAPES.switch;

const FALLBACK: ReactElement = (
  <>
    <rect x="4" y="4" width="16" height="16" rx="3" />
    <circle cx="12" cy="12" r="2" />
  </>
);

function iconShape(type: string): ReactElement {
  return SHAPES[type?.toLowerCase().trim()] ?? FALLBACK;
}

interface Props {
  type: string;
  size?: number;
  className?: string;
  style?: CSSProperties;
}

/** A standalone type icon for HTML contexts (list rows, headers). */
export function DeviceIcon({ type, size = 14, className, style }: Props): ReactElement {
  return (
    <svg
      className={`dev-icon ${className ?? ""}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
      aria-hidden="true"
      focusable="false"
    >
      {iconShape(type)}
    </svg>
  );
}
