/* Distribución del visor: qué vistas se ven, cuál va grande y hacia qué lado. Con
   las que queden encendidas la rejilla se reparte sola (layoutGrid). Las vistas no
   se remontan al cambiar de distribución: el modelo solo dice DÓNDE va cada una.

   Se guarda por usuario en el navegador. La v1 ({main, strip}), la bandera «franja
   oculta» y la v2 (con los presets SOLA y CUATRO) se migran una vez y se borran. */

export type PaneId = "scene" | "axial" | "coronal" | "sagital" | "mip";
/** Hacia dónde va la vista grande: a la izquierda o arriba. */
export type LayoutPreset = "derecha" | "abajo";
export type SidePanes = [PaneId, PaneId, PaneId, PaneId];
export interface ViewerLayout {
  preset: LayoutPreset;
  main: PaneId;
  side: SidePanes;
  mainFraction: number;
  /** Las vistas minimizadas. Nunca la principal: siempre se ve alguna. */
  hidden: PaneId[];
  /** Todas del mismo tamaño, sin vista grande. */
  equal: boolean;
  /** Lo que estaba minimizado antes del doble clic que dejó una sola vista. */
  soloFrom: PaneId[] | null;
}

export const ALL_PANES: PaneId[] = ["scene", "axial", "coronal", "sagital", "mip"];
/** El orden en que se leen las vistas pequeñas, siempre el mismo (F1-111). */
export const CANONICAL_ORDER: PaneId[] = ALL_PANES;
const PRESETS: LayoutPreset[] = ["derecha", "abajo"];
export const LAYOUT_KEY = "ws.viewer.layout.v3";
export const LAYOUT_KEY_V2 = "ws.viewer.layout.v2";
export const LAYOUT_KEY_V1 = "ws.viewer.layout";
export const STRIP_HIDDEN_KEY_V1 = "viewer.stripHidden";
export const FRACTION_MIN = 0.5;
export const FRACTION_MAX = 0.85;

/** 0,74 arriba equivale a la franja de 26 vh que había antes; 0,72 a la izquierda
 *  deja la grande casi cuadrada en 16:9. */
export function defaultFraction(p: LayoutPreset): number { return p === "abajo" ? 0.74 : 0.72; }

export const DEFAULT_LAYOUT: ViewerLayout = {
  preset: "derecha", main: "scene", side: ["axial", "coronal", "sagital", "mip"], mainFraction: defaultFraction("derecha"),
  hidden: [], equal: false, soloFrom: null,
};

const clampFraction = (f: number, fallback: number) =>
  Number.isFinite(f) ? Math.min(FRACTION_MAX, Math.max(FRACTION_MIN, f)) : fallback;

/** Las vistas que se ven, en su orden: la principal y las pequeñas encendidas. */
export function visiblePanes(l: ViewerLayout): PaneId[] {
  return [l.main, ...l.side.filter((id) => !l.hidden.includes(id))];
}

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

/** Sube `id` a principal; si estaba minimizada, vuelve. Las pequeñas quedan en el
 *  orden fijo 3D, AX, COR, SAG, VOLUMEN (sin la nueva principal): antes la
 *  principal vieja caía en el hueco de la nueva y, tras dos o tres cambios, la
 *  columna salía en un orden distinto cada vez y había que leer los rótulos para
 *  encontrar el axial. Un arrastre entre dos pequeñas (swapPanes) sí cambia el
 *  orden: es lo que pidió quien arrastra, y dura hasta la próxima principal. */
export function promote(l: ViewerLayout, id: PaneId): ViewerLayout {
  if (l.main === id) return l;
  if (!l.side.includes(id)) return l;
  const side = CANONICAL_ORDER.filter((p) => p !== id) as SidePanes;
  return { ...l, main: id, side, hidden: l.hidden.filter((p) => p !== id), soloFrom: null };
}

/** La grande de verdad: agranda `id` y deshace «Igualar», que no tiene grande. */
export function enlarge(l: ViewerLayout, id: PaneId): ViewerLayout {
  const next = promote(l, id);
  return next.equal ? { ...next, equal: false } : next;
}

/** Enciende o minimiza una vista. La última que queda no se minimiza; si se
 *  minimiza la grande, la siguiente encendida ocupa su sitio. */
export function togglePane(l: ViewerLayout, id: PaneId): ViewerLayout {
  if (l.hidden.includes(id)) return { ...l, hidden: l.hidden.filter((p) => p !== id), soloFrom: null };
  const shown = visiblePanes(l);
  if (shown.length === 1) return l;
  if (id !== l.main) return { ...l, hidden: [...l.hidden, id], soloFrom: null };
  const next = promote(l, shown[1]);
  return { ...next, hidden: [...next.hidden, id] };
}

/** La siguiente vista pasa al sitio grande. Con una sola encendida, esa cede el
 *  sitio a la siguiente de las cinco: es ir pasando las vistas de una en una. */
export function rotate(l: ViewerLayout): ViewerLayout {
  const shown = visiblePanes(l);
  const next = (pool: PaneId[]) => {
    const i = CANONICAL_ORDER.indexOf(l.main);
    return [...CANONICAL_ORDER.slice(i + 1), ...CANONICAL_ORDER.slice(0, i)].find((id) => pool.includes(id));
  };
  if (shown.length > 1) return promote(l, next(shown)!);
  const id = next(ALL_PANES)!;
  return { ...promote(l, id), hidden: ALL_PANES.filter((p) => p !== id), soloFrom: l.soloFrom };
}

/** Doble clic: deja solo esa vista; otro doble clic devuelve las que había. */
export function toggleSolo(l: ViewerLayout, id: PaneId): ViewerLayout {
  if (visiblePanes(l).length === 1 && l.main === id) return { ...l, hidden: l.soloFrom ?? [], soloFrom: null };
  const before = l.hidden;
  return { ...promote(l, id), hidden: ALL_PANES.filter((p) => p !== id), soloFrom: before };
}

export function showAll(l: ViewerLayout): ViewerLayout {
  return l.hidden.length === 0 ? l : { ...l, hidden: [], soloFrom: null };
}

export function toggleEqual(l: ViewerLayout): ViewerLayout {
  return { ...l, equal: !l.equal };
}

/** Al cambiar de lado la fracción vuelve al defecto de ese lado: la de la
 *  izquierda es un ancho y arriba sería un alto, no significa lo mismo. */
export function setPreset(l: ViewerLayout, p: LayoutPreset): ViewerLayout {
  if (l.preset === p) return l.equal ? { ...l, equal: false } : l;
  return { ...l, preset: p, equal: false, mainFraction: defaultFraction(p) };
}

export function flipSide(l: ViewerLayout): ViewerLayout {
  const preset: LayoutPreset = l.preset === "derecha" ? "abajo" : "derecha";
  return { ...l, preset, mainFraction: defaultFraction(preset) };
}

export function setMainFraction(l: ViewerLayout, f: number): ViewerLayout {
  const v = clampFraction(f, defaultFraction(l.preset));
  return v === l.mainFraction ? l : { ...l, mainFraction: v };
}

export function isValidLayout(x: unknown): x is ViewerLayout {
  if (!x || typeof x !== "object") return false;
  const { preset, main, side, mainFraction, hidden, equal, soloFrom } = x as ViewerLayout;
  if (!PRESETS.includes(preset)) return false;
  if (!Array.isArray(side) || side.length !== 4) return false;
  const all = [main, ...side];
  if (!ALL_PANES.every((p) => all.filter((q) => q === p).length === 1)) return false;
  const panes = (v: unknown) => Array.isArray(v) && v.every((p) => ALL_PANES.includes(p) && p !== main);
  if (!panes(hidden) || typeof equal !== "boolean") return false;
  if (soloFrom !== null && !Array.isArray(soloFrom)) return false;
  return typeof mainFraction === "number" && mainFraction >= FRACTION_MIN && mainFraction <= FRACTION_MAX;
}

/** La v2: SOLA es minimizar el resto; CUATRO, iguales sin VOLUMEN. */
export function migrateV2(raw: unknown): ViewerLayout | null {
  if (!raw || typeof raw !== "object") return null;
  const { preset, main, side, mainFraction } = raw as { preset?: string; main?: PaneId; side?: SidePanes; mainFraction?: number };
  if (!main || !Array.isArray(side) || side.length !== 4) return null;
  const lado: LayoutPreset = preset === "abajo" ? "abajo" : "derecha";
  const base: ViewerLayout = {
    ...DEFAULT_LAYOUT, preset: lado, main, side,
    mainFraction: clampFraction(mainFraction ?? Number.NaN, defaultFraction(lado)),
  };
  if (!isValidLayout(base)) return null;
  if (preset === "sola") return { ...base, hidden: [...side] };
  if (preset === "cuatro") {
    const sinVolumen = main === "mip" ? promote(base, "scene") : base;
    return { ...sinVolumen, equal: true, hidden: ["mip"] };
  }
  return base;
}

export function migrateV1(rawV1: unknown, stripHidden: boolean): ViewerLayout | null {
  if (!rawV1 || typeof rawV1 !== "object") return null;
  const { main, strip } = rawV1 as { main?: PaneId; strip?: PaneId[] };
  if (!main || !Array.isArray(strip) || strip.length !== 4) return null;
  return migrateV2({ preset: stripHidden ? "sola" : "abajo", main, side: strip, mainFraction: defaultFraction("abajo") });
}

function parse(raw: string | null): unknown {
  if (raw === null) return null;
  // Una clave corrupta se trata como ausente, en su propio try: si el error
  // llegara al catch de fuera, las claves viejas no se borrarían nunca.
  try { return JSON.parse(raw); } catch { return null; }
}

export function loadLayout(): ViewerLayout {
  try {
    const v3 = localStorage.getItem(LAYOUT_KEY);
    if (v3 !== null) {
      const parsed = parse(v3);
      return isValidLayout(parsed) ? parsed : DEFAULT_LAYOUT;
    }
    const stripHidden = localStorage.getItem(STRIP_HIDDEN_KEY_V1) === "1";
    let migrated = migrateV2(parse(localStorage.getItem(LAYOUT_KEY_V2)))
      ?? migrateV1(parse(localStorage.getItem(LAYOUT_KEY_V1)), stripHidden);
    // Con la franja oculta y sin distribución guardada, la intención del usuario
    // (ver solo la principal) se conserva sobre el defecto.
    if (!migrated && stripHidden) migrated = { ...DEFAULT_LAYOUT, hidden: [...DEFAULT_LAYOUT.side] };
    // Primero se escribe la nueva y luego se borran las viejas: si la escritura
    // falla no se pierde el estado anterior. Las viejas se van para que un
    // navegador con las dos no resucite la distribución antigua al borrar la nueva.
    if (migrated) localStorage.setItem(LAYOUT_KEY, JSON.stringify(migrated));
    localStorage.removeItem(LAYOUT_KEY_V2);
    localStorage.removeItem(LAYOUT_KEY_V1);
    localStorage.removeItem(STRIP_HIDDEN_KEY_V1);
    return migrated ?? DEFAULT_LAYOUT;
  } catch {
    return DEFAULT_LAYOUT;
  }
}

export function saveLayout(l: ViewerLayout): void {
  try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(l)); } catch { /* almacenamiento bloqueado: queda en memoria */ }
}
