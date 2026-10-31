/* Todos los candidatos a la vez en el 3D (paso Detección).
 *
 * El visor dibujaba solo el candidato elegido y el panel listaba los demás:
 * para ver dónde había mirado el detector había que recorrerlos uno a uno. Con
 * todos marcados a la vez, el profesional ve de un vistazo los sitios que el
 * detector consideró y le salta cualquier lesión que no tenía contemplada. Los
 * descartados por los vetos también se dibujan, más tenues: son justo los
 * sitios donde podría esconderse algo que nadie miró.
 *
 * Son balizas de la capa superior de MeshView (como el punto de foco), no
 * marcadores normales: el centro de un candidato está DENTRO del saco o del
 * vaso y una esfera con prueba de profundidad quedaba tapada por la malla.
 *
 * Función pura, aparte de Viewer y de vtk.js para poder probarla. */

import type { AneurysmCandidate } from "../api/types";
import { isManual } from "../components/planning/detectCopy";
import { HUD_HEX, hexToRgb01 } from "./planeColors";
import type { MeshFocus, MeshLabel } from "./MeshView";

/** Elegido: el acento del visor (el mismo verde del HUD y del foco). */
export const CANDIDATE_SELECTED_HEX = HUD_HEX;
/** Aceptados sin elegir: gris claro neutro, que no compite con el elegido. */
export const CANDIDATE_HEX = "#D8DCE2";
/** Descartados: gris oscuro, tenue. */
export const CANDIDATE_REJECTED_HEX = "#7A7F88";
export const CANDIDATE_SELECTED_SCALE = 1.3;
export const CANDIDATE_REJECTED_SCALE = 0.7;
export const CANDIDATE_REJECTED_OPACITY = 0.55;
/** Radio de la baliza: una fracción del saco, acotada para que se vea en un
 *  árbol entero y no tape un saco pequeño. */
export const BEACON_FROM_DIAMETER = 0.22;
export const BEACON_MIN_MM = 1.0;
export const BEACON_MAX_MM = 3.0;
/** Margen alrededor del saco, en mm, para que una baliza pequeña se pueda pulsar. */
export const PICK_MARGIN_MM = 1.0;

type Vec3 = [number, number, number];

const pos = (c: AneurysmCandidate): Vec3 => [c.center_mm.x, c.center_mm.y, c.center_mm.z];

export function beaconRadiusMm(diameterMm: number): number {
  const raw = Math.max(0, diameterMm) * BEACON_FROM_DIAMETER;
  if (!Number.isFinite(raw)) return BEACON_MIN_MM;
  return Math.min(BEACON_MAX_MM, Math.max(BEACON_MIN_MM, raw));
}

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
}): { beacons: MeshFocus[]; labels: MeshLabel[] } {
  const beacons: MeshFocus[] = [];
  const labels: MeshLabel[] = [];
  if (args.step !== "detect") return { beacons, labels };
  const push = (c: AneurysmCandidate, idx: number, rejected: boolean, i: number) => {
    const on = idx === args.selected;
    const hex = on ? CANDIDATE_SELECTED_HEX : rejected ? CANDIDATE_REJECTED_HEX : CANDIDATE_HEX;
    const scale = on ? CANDIDATE_SELECTED_SCALE : rejected ? CANDIDATE_REJECTED_SCALE : 1;
    const radiusMm = beaconRadiusMm(c.max_diameter_mm) * scale;
    beacons.push({ pos: pos(c), color: hexToRgb01(hex), radiusMm, opacity: rejected && !on ? CANDIDATE_REJECTED_OPACITY : 1 });
    // El número se aparta al borde de la baliza: dentro no se leería.
    labels.push({ pos: pos(c), text: candidateLabel(c, i, rejected), color: hex, clearMm: radiusMm });
  };
  args.candidates.forEach((c, i) => push(c, i, false, i));
  args.rejected.forEach((c, i) => {
    const idx = args.candidates.length + i;
    // Con el interruptor apagado, el descartado elegido sigue a la vista: es
    // lo que la persona está mirando en el panel.
    if (args.showRejected || idx === args.selected) push(c, idx, true, i);
  });
  return { beacons, labels };
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
