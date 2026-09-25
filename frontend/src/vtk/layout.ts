/* Distribución del visor: un panel principal y una franja de cuatro. Doble
   clic en una celda la sube al principal y el principal baja a su hueco. */

export type PaneId = "scene" | "axial" | "coronal" | "sagital" | "mip";
export interface ViewerLayout { main: PaneId; strip: PaneId[] }

export const ALL_PANES: PaneId[] = ["scene", "axial", "coronal", "sagital", "mip"];
export const DEFAULT_LAYOUT: ViewerLayout = { main: "scene", strip: ["axial", "coronal", "sagital", "mip"] };
const KEY = "ws.viewer.layout";

export function swapPane(layout: ViewerLayout, id: PaneId): ViewerLayout {
  if (layout.main === id) return layout;
  const i = layout.strip.indexOf(id);
  if (i < 0) return layout;
  const strip = [...layout.strip];
  strip[i] = layout.main;
  return { main: id, strip };
}

function valid(l: unknown): l is ViewerLayout {
  if (!l || typeof l !== "object") return false;
  const { main, strip } = l as ViewerLayout;
  if (!Array.isArray(strip) || strip.length !== 4) return false;
  const all = [main, ...strip];
  return ALL_PANES.every((p) => all.filter((x) => x === p).length === 1);
}

export function loadLayout(): ViewerLayout {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return valid(parsed) ? parsed : DEFAULT_LAYOUT;
  } catch {
    return DEFAULT_LAYOUT;
  }
}

export function saveLayout(l: ViewerLayout): void {
  try { localStorage.setItem(KEY, JSON.stringify(l)); } catch { /* almacenamiento bloqueado */ }
}
