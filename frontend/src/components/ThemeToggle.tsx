// Dark / light theme toggle (#101). The theme is a `data-theme` attribute on
// <html> (applied before first paint in main.tsx); flipping it swaps the CSS
// variable palette in theme.css. The choice is persisted via prefs.

import { useState } from "react";
import { prefs, type Theme } from "../lib/prefs";

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => prefs.theme.get());

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    prefs.theme.set(next);
    document.documentElement.dataset.theme = next;
    document.documentElement.style.colorScheme = next;
  }

  const goingTo = theme === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      className="iconbtn"
      onClick={toggle}
      aria-label={`switch to ${goingTo} theme`}
      title={`switch to ${goingTo} theme`}
    >
      {theme === "dark" ? "☀" : "☾"}
    </button>
  );
}
