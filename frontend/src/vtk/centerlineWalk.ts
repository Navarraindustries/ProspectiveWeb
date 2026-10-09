/* Recorrer la línea central (spec §7): dónde está cada punto, hacia dónde va
   el vaso allí y a qué punto corresponde una posición de la gráfica. Puro. */
import type { CenterlinePoints } from "../api/types";
import type { Vec3 } from "./geometry";

export interface CenterlineTrack { points: Vec3[]; radiiMm: number[]; arcMm: number[] }

export function trackFromWire(w: CenterlinePoints): CenterlineTrack {
  return { points: w.points.map((p): Vec3 => [p.x, p.y, p.z]), radiiMm: [...w.radii_mm], arcMm: [...w.arc_mm] };
}

const unit = (v: Vec3): Vec3 => { const l = Math.hypot(v[0], v[1], v[2]); return l < 1e-9 ? [0, 0, 1] : [v[0] / l, v[1] / l, v[2] / l]; };

/** Dirección del vaso en el punto i: diferencias centradas (más suave que la
 *  hacia delante), unilaterales en los extremos; +z si no hay con qué. */
export function tangentAt(points: Vec3[], i: number): Vec3 {
  const n = points.length;
  if (n < 2) return [0, 0, 1];
  const a = points[Math.max(0, i - 1)], b = points[Math.min(n - 1, i + 1)];
  return unit([b[0] - a[0], b[1] - a[1], b[2] - a[2]]);
}

/** El índice cuyo arco está más cerca de `mm` (búsqueda binaria; `arcMm` crece). */
export function indexAtArc(arcMm: number[], mm: number): number {
  let lo = 0, hi = arcMm.length - 1;
  if (hi < 0) return 0;
  if (mm <= arcMm[0]) return 0;
  if (mm >= arcMm[hi]) return hi;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (arcMm[mid] <= mm) lo = mid; else hi = mid; }
  return mm - arcMm[lo] <= arcMm[hi] - mm ? lo : hi;
}

export function nearestIndex(points: Vec3[], p: Vec3): { index: number; distMm: number } {
  let index = 0, best = Infinity;
  points.forEach((q, i) => { const d = Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]); if (d < best) { best = d; index = i; } });
  return { index, distMm: best };
}
