/* Todos los candidatos a la vez en el 3D (paso Detección).
 *
 * El visor pintaba solo la zona del candidato elegido y el panel listaba los
 * demás: para ver dónde había mirado el detector había que recorrerlos uno a
 * uno. Ahora la zona detectada de CADA candidato (su malla «dónde mirar») se
 * pinta a la vez: la del elegido en el azul de siempre, las demás en un gris
 * neutro, y las de los descartados por los vetos más tenues aún (son justo
 * los sitios donde podría esconderse una lesión que nadie contempló). Un
 * número junto a cada zona la casa con la fila del panel.
 *
 * El dueño descartó marcarlos con esferas: lo que quiere ver coloreado es la
 * zona misma, «todo lo de ese color es el candidato».
 *
 * Función pura, aparte de Viewer y de vtk.js para poder probarla. */

import type { AneurysmCandidate } from "../api/types";
import { isManual } from "../components/planning/detectCopy";
import { hexToRgb01 } from "./planeColors";
import type { MeshLabel, MeshLayer } from "./MeshView";

/** Elegido: el azul «dónde mirar» que el panel explica (no es el saco). */
export const CANDIDATE_SELECTED_HEX = "#528CBF";
/** Aceptados sin elegir: ámbar apagado. Un gris se perdía sobre el árbol, que
 *  también es gris; el ámbar se distingue del azul del elegido y del vaso. */
export const CANDIDATE_HEX = "#E0B35A";
/** Descartados: el mismo ámbar, oscurecido y tenue. */
export const CANDIDATE_REJECTED_HEX = "#9A7A3C";
/** Opacidad de las zonas no elegidas, relativa a la del resalte del elegido. */
export const CANDIDATE_OTHER_OPACITY = 0.55;
export const CANDIDATE_REJECTED_OPACITY = 0.35;
/** Margen alrededor del saco, en mm, para elegir un candidato pulsando cerca. */
export const PICK_MARGIN_MM = 1.0;

type Vec3 = [number, number, number];

const pos = (c: AneurysmCandidate): Vec3 => [c.center_mm.x, c.center_mm.y, c.center_mm.z];

/** El texto de la etiqueta: el puesto del aceptado, «D» + orden del descartado,
 *  «M» para un punto marcado a mano (sin puesto). */
export function candidateLabel(c: AneurysmCandidate, index: number, rejected: boolean): string {
  if (isManual(c)) return "M";
  const n = c.rank && c.rank > 0 ? c.rank : index + 1;
  return rejected ? `D${n}` : String(n);
}

export function candidateOverlay(args: {
  candidates: AneurysmCandidate[];
  rejected: AneurysmCandidate[];
  /** Índice sobre aceptados seguidos de descartados, como `selectedCandidate`. */
  selected: number;
  showRejected: boolean;
  step: string;
  /** Opacidad del resalte del elegido en este momento (el visor la baja
   *  mientras se marca sobre la superficie). */
  resalte: number;
}): { layers: MeshLayer[]; labels: MeshLabel[] } {
  const layers: MeshLayer[] = [];
  const labels: MeshLabel[] = [];
  if (args.step !== "detect") return { layers, labels };
  const push = (c: AneurysmCandidate, idx: number, rejected: boolean, i: number) => {
    const on = idx === args.selected;
    const hex = on ? CANDIDATE_SELECTED_HEX : rejected ? CANDIDATE_REJECTED_HEX : CANDIDATE_HEX;
    const opacity = on ? args.resalte : args.resalte * (rejected ? CANDIDATE_REJECTED_OPACITY : CANDIDATE_OTHER_OPACITY);
    // Un punto marcado a mano no tiene malla: solo su número.
    if (c.dome_mesh_url) layers.push({ url: c.dome_mesh_url, color: hexToRgb01(hex), opacity, id: `cand:${c.id}` });
    labels.push({ pos: pos(c), text: candidateLabel(c, i, rejected), color: hex });
  };
  args.candidates.forEach((c, i) => push(c, i, false, i));
  args.rejected.forEach((c, i) => {
    const idx = args.candidates.length + i;
    // Con el interruptor apagado, el descartado elegido sigue a la vista: es
    // lo que la persona está mirando en el panel.
    if (args.showRejected || idx === args.selected) push(c, idx, true, i);
  });
  return { layers, labels };
}

/** El candidato cuyo saco (más un margen) contiene el punto pulsado sobre la
 *  malla; el más cercano si hay varios. Con los descartados ocultos solo
 *  cuentan los aceptados (los primeros `acceptedCount`). */
export function nearestCandidate(
  xyz: Vec3,
  all: AneurysmCandidate[],
  showRejected: boolean,
  acceptedCount: number = all.length,
): number | null {
  let best: number | null = null;
  let bestDist = Infinity;
  const limit = showRejected ? all.length : Math.min(acceptedCount, all.length);
  for (let i = 0; i < limit; i++) {
    const c = all[i];
    const p = pos(c);
    const d = Math.hypot(xyz[0] - p[0], xyz[1] - p[1], xyz[2] - p[2]);
    const reach = Math.max(0, c.max_diameter_mm) / 2 + PICK_MARGIN_MM;
    if (d <= reach && d < bestDist) { best = i; bestDist = d; }
  }
  return best;
}
