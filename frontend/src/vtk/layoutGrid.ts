/* La rejilla CSS que dibuja una distribución, y la aritmética del separador.
   Puro: lo prueba vitest sin DOM. ViewerGrid solo aplica lo que sale de aquí. */
import { FRACTION_MAX, FRACTION_MIN, type LayoutPreset, type PaneId, type ViewerLayout } from "./layout";

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
  slotOf: Record<PaneId, Slot>;
  visible: Record<PaneId, boolean>;
  splitter: "x" | "y" | null;
}

/** En vertical no hay ancho para una columna: «derecha» se dibuja como «abajo».
 *  No se guarda: al girar la pantalla vuelve la columna. */
export function effectivePreset(l: ViewerLayout, portrait: boolean): LayoutPreset {
  return l.preset === "derecha" && portrait ? "abajo" : l.preset;
}

const two = (x: number) => x.toFixed(2);

export function gridFor(l: ViewerLayout, portrait: boolean): GridSpec {
  const preset = effectivePreset(l, portrait);
  const slots: Slot[] = ["s0", "s1", "s2", "s3"];
  const slotOf = { [l.main]: "main" } as Record<PaneId, Slot>;
  l.side.forEach((id, i) => { slotOf[id] = slots[i]; });
  const allVisible = Object.fromEntries([l.main, ...l.side].map((id) => [id, preset !== "sola"])) as Record<PaneId, boolean>;
  allVisible[l.main] = true;
  const f = l.mainFraction, g = 1 - l.mainFraction;
  if (preset === "sola") {
    return { columns: "1fr", rows: "1fr", areas: '"main"', slotOf, visible: allVisible, splitter: null };
  }
  if (preset === "derecha") {
    return {
      columns: `${two(f)}fr ${SPLITTER_PX}px ${two(g)}fr`,
      rows: "repeat(4, minmax(0, 1fr))",
      areas: '"main gap s0" "main gap s1" "main gap s2" "main gap s3"',
      slotOf, visible: allVisible, splitter: "x",
    };
  }
  return {
    columns: "repeat(4, minmax(0, 1fr))",
    rows: `${two(f)}fr ${SPLITTER_PX}px ${two(g)}fr`,
    areas: '"main main main main" "gap gap gap gap" "s0 s1 s2 s3"',
    slotOf, visible: allVisible, splitter: "y",
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
