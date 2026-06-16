// Click-to-copy inline value (IP / MAC / host) with toast feedback.
// navigator.clipboard needs a secure context, which a plain-HTTP LAN origin
// (http://192.168.x.x:8080) is not — so fall back to a hidden textarea +
// execCommand("copy") there.

import type { ReactNode } from "react";
import { useCatalog } from "../App";

async function copyText(text: string): Promise<boolean> {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      /* fall through to the legacy path */
    }
  }
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    // ok remains false on failure
  }
  document.body.removeChild(ta);
  return ok;
}

interface Props {
  text: string;
  className?: string;
  children?: ReactNode;
}

export function Copyable({ text, className, children }: Props) {
  const { notify } = useCatalog();
  return (
    <button
      type="button"
      className={`copyable ${className ?? ""}`}
      title={`クリックでコピー · ${text}`}
      onClick={async (e) => {
        e.stopPropagation();
        const ok = await copyText(text);
        notify(ok ? `copied · ${text}` : "コピーできませんでした", ok ? "ok" : "err");
      }}
    >
      {children ?? text}
    </button>
  );
}
