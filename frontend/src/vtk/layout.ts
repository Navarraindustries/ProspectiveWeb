/* Distribución del visor: un preset (principal + columna a la derecha, principal
   + franja abajo, o la principal sola), qué vista ocupa cada hueco y qué fracción
   del eje repartido se lleva la principal. Las vistas no se remontan al cambiar
   de distribución: el modelo solo dice DÓNDE va cada una.

   Se guarda por usuario en el navegador. La v1 ({main, strip}) y la bandera
   «franja oculta» se migran una vez y se borran. */

export type PaneId = "scene" | "axial" | "coronal" | "sagital" | "mip";
export type LayoutPreset = "derecha" | "abajo" | "sola";
export type SidePanes = [PaneId, PaneId, PaneId, PaneId];
export interface ViewerLayout { preset: LayoutPreset; main: PaneId; side: SidePanes; mainFraction: number }

export const ALL_PANES: PaneId[] = ["scene", "axial", "coronal", "sagital", "mip"];
const PRESETS: LayoutPreset[] = ["derecha", "abajo", "sola"];
export const LAYOUT_KEY_V2 = "ws.viewer.layout.v2";
export const LAYOUT_KEY_V1 = "ws.viewer.layout";
export const STRIP_HIDDEN_KEY_V1 = "viewer.stripHidden";
export const FRACTION_MIN = 0.5;
export const FRACTION_MAX = 0.85;

/** 0,74 en «abajo» equivale a la franja de 26 vh que había antes; 0,72 en
 *  «derecha» deja la principal casi cuadrada en 16:9. */
export function defaultFraction(p: LayoutPreset): number { return p === "abajo" ? 0.74 : 0.72; }

export const DEFAULT_LAYOUT: ViewerLayout = {
  preset: "derecha", main: "scene", side: ["axial", "coronal", "sagital", "mip"], mainFraction: defaultFraction("derecha"),
};

const clampFraction = (f: number, fallback: number) =>
  Number.isFinite(f) ? Math.min(FRACTION_MAX, Math.max(FRACTION_MIN, f)) : fallback;

export function swapPanes(l: ViewerLayout, a: PaneId, b: PaneId): ViewerLayout {
  if (a === b) return l;
  if (l.main === a) return promote(l, b);
  if (l.main === b) return promote(l, a);
  const ia = l.side.indexOf(a), ib = l.side.indexOf(b);
  if (ia < 0 || ib < 0) return l;
  const side = [...l.side] as SidePanes;
  side[ia] = b; side[ib] = a;
  return { ...l, side };
}

export function promote(l: ViewerLayout, id: PaneId): ViewerLayout {
  if (l.main === id) return l;
  const i = l.side.indexOf(id);
  if (i < 0) return l;
  const side = [...l.side] as SidePanes;
  side[i] = l.main;
  return { ...l, main: id, side };
}

/** Al cambiar de preset la fracción vuelve al defecto de ese preset: la de
 *  «derecha» es un ancho y en «abajo» sería un alto, no significa lo mismo. */
export function setPreset(l: ViewerLayout, p: LayoutPreset): ViewerLayout {
  return l.preset === p ? l : { ...l, preset: p, mainFraction: defaultFraction(p) };
}

export function setMainFraction(l: ViewerLayout, f: number): ViewerLayout {
  const v = clampFraction(f, defaultFraction(l.preset));
  return v === l.mainFraction ? l : { ...l, mainFraction: v };
}

export function isValidLayout(x: unknown): x is ViewerLayout {
  if (!x || typeof x !== "object") return false;
  const { preset, main, side, mainFraction } = x as ViewerLayout;
  if (!PRESETS.includes(preset)) return false;
  if (!Array.isArray(side) || side.length !== 4) return false;
  const all = [main, ...side];
  if (!ALL_PANES.every((p) => all.filter((q) => q === p).length === 1)) return false;
  return typeof mainFraction === "number" && mainFraction >= FRACTION_MIN && mainFraction <= FRACTION_MAX;
}

export function migrateV1(rawV1: unknown, stripHidden: boolean): ViewerLayout | null {
  if (!rawV1 || typeof rawV1 !== "object") return null;
  const { main, strip } = rawV1 as { main?: PaneId; strip?: PaneId[] };
  if (!main || !Array.isArray(strip) || strip.length !== 4) return null;
  const l: ViewerLayout = { preset: stripHidden ? "sola" : "abajo", main, side: strip as SidePanes, mainFraction: defaultFraction("abajo") };
  return isValidLayout(l) ? l : null;
}

export function loadLayout(): ViewerLayout {
  try {
    const v2 = localStorage.getItem(LAYOUT_KEY_V2);
    if (v2 !== null) {
      const parsed: unknown = JSON.parse(v2);
      return isValidLayout(parsed) ? parsed : DEFAULT_LAYOUT;
    }
    const v1 = localStorage.getItem(LAYOUT_KEY_V1);
    const stripHidden = localStorage.getItem(STRIP_HIDDEN_KEY_V1) === "1";
    let migrated = v1 !== null ? migrateV1(JSON.parse(v1), stripHidden) : null;
    // Con la franja oculta y sin distribución guardada, la intención del usuario
    // (ver solo la principal) se conserva sobre el defecto.
    if (!migrated && stripHidden) migrated = { ...DEFAULT_LAYOUT, preset: "sola" };
    // Primero se escribe la nueva y luego se borran las viejas: si la escritura
    // falla no se pierde el estado anterior. Las viejas se van para que un
    // navegador con las dos no resucite la distribución antigua al borrar la nueva.
    if (migrated) localStorage.setItem(LAYOUT_KEY_V2, JSON.stringify(migrated));
    localStorage.removeItem(LAYOUT_KEY_V1);
    localStorage.removeItem(STRIP_HIDDEN_KEY_V1);
    if (migrated) return migrated;
    return DEFAULT_LAYOUT;
  } catch {
    return DEFAULT_LAYOUT;
  }
}

export function saveLayout(l: ViewerLayout): void {
  try { localStorage.setItem(LAYOUT_KEY_V2, JSON.stringify(l)); } catch { /* almacenamiento bloqueado: queda en memoria */ }
}

/** PUENTE TEMPORAL hasta que ViewerGrid sustituya a la franja (Task 5). */
export const swapPane = promote;
