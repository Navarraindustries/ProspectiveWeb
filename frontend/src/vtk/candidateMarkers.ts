/* Marcadores de los candidatos que se «encienden» en secuencia al terminar la
   detección. Puro: sin vtk.js, para poder probarlo sin escena. */
import type { AneurysmCandidate } from "../api/types";
import type { MeshMarker } from "./MeshView";
import { CANDIDATE_COLOR, CANDIDATE_DIM_COLOR } from "./markerColors";

/** Radio visual del marcador de candidato, en mm (≈ 2 mm de diámetro). */
export const CANDIDATE_MARKER_RADIUS_MM = 1;

/** Un marcador por candidato ya encendido (los `lit` primeros). El seleccionado
 *  en el azul vivo, el resto apagados. `MeshView` dibuja todas las esferas con
 *  un radio compartido y `scale` lo multiplica: se pasa ese radio en `sharedRadiusMm`
 *  (el Viewer lo conoce a partir del diámetro de referencia) para que la esfera
 *  mida `CANDIDATE_MARKER_RADIUS_MM`. Con el valor por defecto (1) la escala es 1. */
export function candidateMarkers(
  cands: AneurysmCandidate[],
  selected: number,
  lit: number,
  sharedRadiusMm = 1,
): MeshMarker[] {
  const scale = CANDIDATE_MARKER_RADIUS_MM / Math.max(sharedRadiusMm, 1e-6);
  return cands.slice(0, Math.max(0, lit)).map((cand, i) => ({
    pos: [cand.center_mm.x, cand.center_mm.y, cand.center_mm.z],
    color: i === selected ? CANDIDATE_COLOR : CANDIDATE_DIM_COLOR,
    scale,
  }));
}

/** ¿Hay que reproducir el encendido? Sí si aún no se completó ninguno
 *  (`prev === null`) o la lista es otra (otra identidad). */
export function shouldReplay(prev: unknown, list: unknown): boolean {
  return prev === null || prev !== list;
}

/** Instantes (ms) en que se enciende cada uno de los `n` marcadores: reparte
 *  `totalMs` entre ellos; con uno solo, en 0. */
export function litSequence(n: number, totalMs = 1000): number[] {
  const step = totalMs / Math.max(n - 1, 1);
  return Array.from({ length: n }, (_, i) => i * step);
}
