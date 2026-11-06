/* La rejilla CSS que dibuja una distribución, y la aritmética del separador.
   Puro: lo prueba vitest sin DOM. ViewerGrid solo aplica lo que sale de aquí. */
import { ALL_PANES, FRACTION_MAX, FRACTION_MIN, visiblePanes, type LayoutPreset, type PaneId, type ViewerLayout } from "./layout";

export type Slot = "main" | "s0" | "s1" | "s2" | "s3";
export const SPLITTER_PX = 6;
/** Por debajo de este ancho la celda no tiene sitio para la cinta de rumbo ni
 *  los conmutadores: el HUD pasa a compacto. */
export const COMPACT_MAX_WIDTH_PX = 420;
/** Ni por debajo de esta altura: una celda ancha pero baja (columna lateral
 *  ensanchada con el separador) apilaba barra de herramientas, lecturas y
 *  recuadro de orientación unos encima de otros. */
export const COMPACT_MIN_HEIGHT_PX = 260;

export interface GridSpec {
  columns: string; rows: string; areas: string;
  /** Solo las vistas que se ven tienen hueco. */
  slotOf: Partial<Record<PaneId, Slot>>;
  visible: Record<PaneId, boolean>;
  splitter: "x" | "y" | null;
}

/** En vertical no hay ancho para una columna: la grande va arriba. No se guarda:
 *  al girar la pantalla vuelve la columna. */
export function effectivePreset(l: ViewerLayout, portrait: boolean): LayoutPreset {
  return l.preset === "derecha" && portrait ? "abajo" : l.preset;
}

const two = (x: number) => x.toFixed(2);
const pistas = (n: number) => (n === 1 ? "minmax(0, 1fr)" : `repeat(${n}, minmax(0, 1fr))`);

/** Sobre qué celda actúan espacio, C y +/−: la enfocada si sigue a la vista o, si
 *  no, la principal. Con una minimizada el espacio arrancaría el cine a ciegas. */
export function shortcutPane(focused: PaneId | null, l: ViewerLayout): PaneId {
  return focused && !l.hidden.includes(focused) ? focused : l.main;
}

/** El hueco de la rejilla que queda en la esquina de abajo a la izquierda: la
 *  única celda que el dock flotante puede tapar. Sale de `areas` (primera
 *  palabra de la última fila) y vale para todas las distribuciones. */
export function dockCornerSlot(areas: string): Slot {
  const rows = areas.match(/"[^"]*"/g) ?? [];
  const last = rows[rows.length - 1]?.replace(/"/g, "").trim().split(" ")[0];
  return (last || "main") as Slot;
}

/** Todas iguales. Con cinco no hay rejilla exacta: tres arriba y dos abajo. Apiladas
 *  solo si se pide: con tres en un visor apaisado saldrían tiras sin alto. */
function equalGrid(n: number, apiladas: boolean, huecos: Slot[]): Pick<GridSpec, "columns" | "rows" | "areas"> {
  const [a, b, c, d, e] = huecos;
  if (n === 4) return { columns: pistas(2), rows: pistas(2), areas: `"${a} ${b}" "${c} ${d}"` };
  if (n === 5) {
    return { columns: pistas(6), rows: pistas(2), areas: `"${a} ${a} ${b} ${b} ${c} ${c}" "${d} ${d} ${d} ${e} ${e} ${e}"` };
  }
  return apiladas
    ? { columns: pistas(1), rows: pistas(n), areas: huecos.map((s) => `"${s}"`).join(" ") }
    : { columns: pistas(n), rows: pistas(1), areas: `"${huecos.join(" ")}"` };
}

export function gridFor(l: ViewerLayout, portrait: boolean): GridSpec {
  const shown = visiblePanes(l);
  const n = shown.length;
  const preset = effectivePreset(l, portrait);
  const huecos = (["main", "s0", "s1", "s2", "s3"] as Slot[]).slice(0, n);
  const slotOf: GridSpec["slotOf"] = {};
  shown.forEach((id, i) => { slotOf[id] = huecos[i]; });
  const visible = Object.fromEntries(ALL_PANES.map((id) => [id, shown.includes(id)])) as Record<PaneId, boolean>;
  const base = { slotOf, visible };
  if (n === 1) return { ...base, columns: "1fr", rows: "1fr", areas: '"main"', splitter: null };
  if (l.equal) return { ...base, ...equalGrid(n, n === 2 ? preset === "abajo" : portrait, huecos), splitter: null };
  const pequenas = huecos.slice(1);
  const f = l.mainFraction, g = 1 - l.mainFraction;
  if (preset === "derecha") {
    return {
      ...base,
      columns: `${two(f)}fr ${SPLITTER_PX}px ${two(g)}fr`,
      rows: pistas(n - 1),
      areas: pequenas.map((s) => `"main gap ${s}"`).join(" "),
      splitter: "x",
    };
  }
  const fila = (s: string) => `"${pequenas.map(() => s).join(" ")}"`;
  return {
    ...base,
    columns: pistas(n - 1),
    rows: `${two(f)}fr ${SPLITTER_PX}px ${two(g)}fr`,
    areas: `${fila("main")} ${fila("gap")} "${pequenas.join(" ")}"`,
    splitter: "y",
  };
}

export function fractionFromPointer(
  rect: { left: number; top: number; width: number; height: number },
  clientX: number, clientY: number, splitter: "x" | "y",
): number {
  const raw = splitter === "x" ? (clientX - rect.left) / rect.width : (clientY - rect.top) / rect.height;
  return Math.min(FRACTION_MAX, Math.max(FRACTION_MIN, raw));
}

export function isCompact(cellWidthPx: number, cellHeightPx: number): boolean {
  return cellWidthPx < COMPACT_MAX_WIDTH_PX || cellHeightPx < COMPACT_MIN_HEIGHT_PX;
}
