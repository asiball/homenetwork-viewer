import { useEffect } from "react";

// True when a keyboard event targets a text-entry control, so window-level
// shortcuts let it through instead of hijacking what the user is typing. Shared
// by every global key handler so the rule can't drift between them (#165).
export function isTypingTarget(e: KeyboardEvent): boolean {
  const tag = (e.target as HTMLElement | null)?.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

// Subscribe a window keydown listener for the component's lifetime. Pass a
// stable (useCallback'd) handler so it doesn't re-subscribe on every render.
export function useGlobalKeydown(handler: (e: KeyboardEvent) => void): void {
  useEffect(() => {
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handler]);
}
