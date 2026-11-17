/* Recorrer la línea central (spec §7): dónde está cada punto, hacia dónde va
   el vaso allí y a qué punto corresponde una posición de la gráfica. Puro. */
import type { CenterlinePoints } from "../api/types";
import type { Vec3 } from "./geometry";
import { planeFromNormal, type FreePlane } from "./freePlane";

export interface CenterlineTrack {
  points: Vec3[]; radiiMm: number[]; arcMm: number[];
  /** El último punto está dentro de la lesión (línea sin destino marcado):
   *  el recorrido llega hasta él en vez de pararse antes de la pared. */
  endsInLesion?: boolean;
}

export function trackFromWire(w: CenterlinePoints): CenterlineTrack {
  return { points: w.points.map((p): Vec3 => [p.x, p.y, p.z]), radiiMm: [...w.radii_mm], arcMm: [...w.arc_mm], endsInLesion: !!w.ends_in_lesion };
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

/* Sentido de la normal de una línea entera, guardado por línea: la tangente
   ya es continua, así que basta con fijar un único signo para todos sus
   puntos. Se elige el que más aleja a la normal de −z, donde el «arriba» del
   oblicuo (upOf) es singular y giraría deprisa. */
const sentidos = new WeakMap<Vec3[], 1 | -1>();
function sentidoDeLinea(points: Vec3[]): 1 | -1 {
  const visto = sentidos.get(points); if (visto) return visto;
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < points.length; i++) { const z = tangentAt(points, i)[2]; lo = Math.min(lo, z); hi = Math.max(hi, z); }
  const s: 1 | -1 = points.length < 2 || lo + hi >= 0 ? 1 : -1;
  sentidos.set(points, s);
  return s;
}

/** Plano libre perpendicular al vaso en el punto i, con un sentido de la
 *  normal fijo para toda la línea: así el corte no se da la vuelta cuando el
 *  vaso cruza la horizontal (UNI-87), y el mismo índice da siempre el mismo
 *  plano, se llegue por el recorrido, el cine o la gráfica. */
export function planoDeLinea(points: Vec3[], i: number): FreePlane {
  const t = tangentAt(points, i), s = sentidoDeLinea(points);
  return planeFromNormal([s * t[0], s * t[1], s * t[2]], { conSentido: true });
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

/** Índice vigente del recorrido. El redondeo a vóxel puede dejar el foco tan
 *  cerca del punto siguiente como del propio: con el espaciado por encima del
 *  paso de la línea (0,5 mm) el «más cercano» oscilaría y el cine se pegaría.
 *  Por eso manda el índice guardado mientras el foco siga sobre su punto. */
export function stepTrackIndex(track: CenterlineTrack, currentMm: Vec3, lastIndex: number | null, toleranceMm: number): number {
  if (lastIndex !== null && lastIndex >= 0 && lastIndex < track.points.length) {
    const p = track.points[lastIndex];
    if (Math.hypot(p[0] - currentMm[0], p[1] - currentMm[1], p[2] - currentMm[2]) <= toleranceMm) return lastIndex;
  }
  return nearestIndex(track.points, currentMm).index;
}
