// True on phone-width viewports, where the home screen's right summary panel
// is hidden (theme.css ≤560px). Components use it to route a device tap to the
// full detail page instead of a panel the user can't see (#100).

import { useEffect, useState } from "react";

const QUERY = "(max-width: 560px)";

export function useIsNarrow(): boolean {
  const [narrow, setNarrow] = useState(
    () => typeof window !== "undefined" && window.matchMedia(QUERY).matches,
  );

  useEffect(() => {
    const mq = window.matchMedia(QUERY);
    const onChange = (e: MediaQueryListEvent) => setNarrow(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return narrow;
}
