/* Qué hay que encuadrar y alrededor de qué se gira en VOLUMEN. Medido en Case 3:
   el manipulador giraba alrededor de (0,0,0), una ESQUINA del volumen, y tras
   90° el centro quedaba 124 mm fuera de la celda. El centro de giro es el punto
   compartido; ENCUADRAR encuadra solo lo que el recorte deja ver. */
import type { VolumeMeta } from "../api/types";
import { voxelToMm, type Vec3 } from "./geometry";

export type Bounds6 = [number, number, number, number, number, number];
export type ClipState =
  | { mode: "eje"; axis: 0 | 1 | 2; posMm: number; acumulado: boolean; reverse: boolean; slabMm: number }
  | { mode: "libre"; normal: Vec3; originMm: Vec3; polygon: Vec3[]; polygons?: Vec3[][]; acumulado: boolean; reverse: boolean; slabMm: number };
export const MIN_EXTENT_MM = 1;

export function rotationCenterMm(voxel: { x: number; y: number; z: number }, meta: VolumeMeta): Vec3 { return voxelToMm(voxel, meta); }
export function boundsCenter(b: Bounds6): Vec3 { return [(b[0] + b[1]) / 2, (b[2] + b[3]) / 2, (b[4] + b[5]) / 2]; }

const clampTo = (v: Bounds6, b: Bounds6): Bounds6 => {
  const out = v.slice() as Bounds6;
  for (let a = 0; a < 3; a++) {
    out[2 * a] = Math.max(b[2 * a], Math.min(b[2 * a + 1], out[2 * a]));
    out[2 * a + 1] = Math.max(b[2 * a], Math.min(b[2 * a + 1], out[2 * a + 1]));
    if (out[2 * a + 1] - out[2 * a] < MIN_EXTENT_MM) {           // nunca una caja plana: resetCamera daría NaN
      const c = (out[2 * a] + out[2 * a + 1]) / 2;
      out[2 * a] = Math.max(b[2 * a], c - MIN_EXTENT_MM / 2); out[2 * a + 1] = Math.min(b[2 * a + 1], c + MIN_EXTENT_MM / 2);
      if (out[2 * a + 1] - out[2 * a] < MIN_EXTENT_MM) { out[2 * a] = b[2 * a]; out[2 * a + 1] = Math.min(b[2 * a + 1], b[2 * a] + MIN_EXTENT_MM); }
    }
  }
  return out;
};
const boxOf = (pts: Vec3[]): Bounds6 | null => {
  if (!pts.length) return null;
  const o: Bounds6 = [Infinity, -Infinity, Infinity, -Infinity, Infinity, -Infinity];
  for (const p of pts) for (let a = 0; a < 3; a++) { o[2 * a] = Math.min(o[2 * a], p[a]); o[2 * a + 1] = Math.max(o[2 * a + 1], p[a]); }
  return o;
};

const cornersOf = (b: Bounds6): Vec3[] => {
  const out: Vec3[] = [];
  for (let i = 0; i < 8; i++) out.push([i & 1 ? b[1] : b[0], i & 2 ? b[3] : b[2], i & 4 ? b[5] : b[4]]);
  return out;
};

/** Vértices de lo que el recorte deja ver (un poliedro convexo). ENCUADRAR los
 *  proyecta para encuadrar: con un plano libre oblicuo la caja alineada de
 *  `visibleBounds` incluye la esquina cortada, y encuadrarla dejaba lo visible
 *  descentrado (121 px de 632 en Case 3) y al 75 % del ancho. */
export function visiblePoints(bounds: Bounds6, clip: ClipState): Vec3[] {
  if (clip.mode === "eje") return cornersOf(visibleBounds(bounds, clip));
  if (!clip.polygon.length) return cornersOf(bounds);
  const corners = cornersOf(bounds);
  const n = clip.normal, o = clip.originMm;
  const dist = (c: Vec3) => (c[0] - o[0]) * n[0] + (c[1] - o[1]) * n[1] + (c[2] - o[2]) * n[2];
  if (!clip.acumulado) {
    // La lámina ∩ caja: los dos polígonos más las esquinas de la caja que caen
    // entre los planos (con normal oblicua las hay).
    return [...(clip.polygons ?? [clip.polygon]).flat(), ...corners.filter((c) => Math.abs(dist(c)) <= clip.slabMm)];
  }
  return [...corners.filter((c) => (clip.reverse ? dist(c) >= 0 : dist(c) <= 0)), ...clip.polygon];
}

export function visibleBounds(bounds: Bounds6, clip: ClipState): Bounds6 {
  if (clip.mode === "eje") {
    const v = bounds.slice() as Bounds6, lo = 2 * clip.axis, hi = lo + 1;
    if (clip.acumulado) { if (clip.reverse) v[lo] = clip.posMm; else v[hi] = clip.posMm; }
    else { v[lo] = clip.posMm - clip.slabMm; v[hi] = clip.posMm + clip.slabMm; }
    return clampTo(v, bounds);
  }
  if (!clip.polygon.length) return bounds;
  return clampTo(boxOf(visiblePoints(bounds, clip)) ?? bounds, bounds);
}
