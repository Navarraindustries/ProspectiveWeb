/* Theme state — stamps data-theme on <html>, persists to localStorage. */

import { useCallback, useEffect, useState } from "react";

const KEY = "prospective.theme";
type Theme = "light" | "dark";

function initialTheme(): Theme {
  const saved = localStorage.getItem(KEY);
  if (saved === "light" || saved === "dark") return saved;
  // Oscuro por defecto aunque el sistema pida claro: la identidad A se diseñó
  // oscura y solo una elección guardada de la persona puede cambiarlo.
  return "dark";
}

export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(initialTheme);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(KEY, theme);
  }, [theme]);

  const toggle = useCallback(() => setTheme((t) => (t === "light" ? "dark" : "light")), []);
  return [theme, toggle];
}
