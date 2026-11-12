/* Recorrido por dentro del vaso (angioscopia virtual): la cámara avanza por la
   línea central mirando unos milímetros por delante. Aquí solo la geometría y
   el ritmo, puros; MeshView mueve la cámara y Viewer pone los mandos. */
import type { CenterlineTrack } from "./centerlineWalk";
import type { Vec3 } from "./geometry";

/** Velocidad de crucero por el vaso (mm/s): un segmento de 40 mm dura ~5 s. */
export const RECORRIDO_MM_S = 8;
/** Lo que tarda en ganar la velocidad de crucero y en frenar al llegar (s). */
export const ARRANQUE_S = 0.6;
/** Cuánto por delante mira la cámara (mm): la cuerda hasta allí suaviza el
 *  zigzag de la línea muestreada a 0,5 mm. */
export const MIRA_MM = 4;
/** Ángulo de visión dentro del vaso, de endoscopio (el del visor es 30°). */
export const ANGULO_ENDOSCOPIO = 70;
/** La cámara se para este trecho antes del destino (mm): el destino suele
 *  marcarse sobre la pared del saco, y llegar a él la dejaría pegada a ella. */
export const PARADA_MM = 1.5;
/** Hasta dónde avanza la cámara en una línea de `L` mm (las muy cortas, entera). */
export const finRecorrido = (L: number): number => (L > 2 * PARADA_MM ? L - PARADA_MM : L);
/** Lo que dura la zambullida desde la vista de fuera hasta la boca del vaso (ms). */
export const ZAMBULLIDA_MS = 1100;

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: Vec3, b: Vec3, k = 1): Vec3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);
const unit = (a: Vec3): Vec3 | null => { const l = len(a); return l < 1e-9 ? null : [a[0] / l, a[1] / l, a[2] / l]; };

export const longitudRecorrido = (t: CenterlineTrack): number => (t.arcMm.length ? t.arcMm[t.arcMm.length - 1] - t.arcMm[0] : 0);

/** Al llegar, la cámara mira alrededor: un vaivén de ±GIRO_GRADOS a izquierda
 *  y derecha en GIRO_MS, que acaba mirando de frente otra vez. */
export const GIRO_GRADOS = 24;
export const GIRO_MS = 2600;

/** Ángulo (grados) del vaivén final a los `ms` de llegar: arranca y acaba en
 *  0 con velocidad suave (seno completo con envolvente), 0 fuera de [0, GIRO_MS]. */
export function giroFinal(ms: number): number {
  if (ms <= 0 || ms >= GIRO_MS) return 0;
  const k = ms / GIRO_MS;
  return GIRO_GRADOS * Math.sin(2 * Math.PI * k) * Math.sin(Math.PI * k);
}

/** `v` girado `grados` alrededor del eje unitario `eje` (Rodrigues). */
export function rotarAlrededor(v: Vec3, eje: Vec3, grados: number): Vec3 {
  const a = (grados * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  const d = dot(eje, v);
  const x: Vec3 = [eje[1] * v[2] - eje[2] * v[1], eje[2] * v[0] - eje[0] * v[2], eje[0] * v[1] - eje[1] * v[0]];
  return [v[0] * c + x[0] * s + eje[0] * d * (1 - c), v[1] * c + x[1] * s + eje[1] * d * (1 - c), v[2] * c + x[2] * s + eje[2] * d * (1 - c)];
}

/** La pose del vaivén final: misma posición, la mirada girada sobre el arriba. */
export function poseGiro(p: WalkPose, ms: number): WalkPose {
  const g = giroFinal(ms);
  if (g === 0) return p;
  const mira = rotarAlrededor(sub(p.focalPoint, p.position), p.viewUp, g);
  return { position: p.position, focalPoint: add(p.position, mira), viewUp: p.viewUp };
}

/** El punto de la línea a `s` mm del origen, interpolando entre muestras. */
export function pointAtArc(t: CenterlineTrack, s: number): Vec3 {
  const n = t.points.length;
  if (n === 0) return [0, 0, 0];
  const a0 = t.arcMm[0], mm = s + a0;
  if (n === 1 || mm <= a0) return t.points[0];
  if (mm >= t.arcMm[n - 1]) return t.points[n - 1];
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (t.arcMm[mid] <= mm) lo = mid; else hi = mid; }
  const span = t.arcMm[hi] - t.arcMm[lo];
  const k = span > 1e-9 ? (mm - t.arcMm[lo]) / span : 0;
  return add(t.points[lo], sub(t.points[hi], t.points[lo]), k);
}

/** El calibre (Ø, mm) a `s` mm del origen, interpolado como el punto. */
export function diameterAtArc(t: CenterlineTrack, s: number): number {
  const n = t.radiiMm.length;
  if (n === 0) return 0;
  const a0 = t.arcMm[0], mm = s + a0;
  if (n === 1 || mm <= a0) return 2 * t.radiiMm[0];
  if (mm >= t.arcMm[n - 1]) return 2 * t.radiiMm[n - 1];
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (t.arcMm[mid] <= mm) lo = mid; else hi = mid; }
  const span = t.arcMm[hi] - t.arcMm[lo];
  const k = span > 1e-9 ? (mm - t.arcMm[lo]) / span : 0;
  return 2 * (t.radiiMm[lo] + (t.radiiMm[hi] - t.radiiMm[lo]) * k);
}

/** Como `pointAtArc`, pero más allá del final sigue recto en la dirección de
 *  llegada: así la mirada no se clava en el último punto al acabar. */
function aheadAtArc(t: CenterlineTrack, s: number): Vec3 {
  const L = longitudRecorrido(t);
  if (s <= L) return pointAtArc(t, s);
  const fin = pointAtArc(t, L);
  const llegada = unit(sub(fin, pointAtArc(t, Math.max(0, L - MIRA_MM)))) ?? [0, 0, 1];
  return add(fin, llegada, s - L);
}

/** Un vector perpendicular a `d` lo más parecido posible a `up` (transporte
 *  paralelo): así la imagen no gira sobre sí misma en las curvas. */
export function transportUp(up: Vec3, d: Vec3): Vec3 {
  const proyectado = unit(add(up, d, -dot(up, d)));
  if (proyectado) return proyectado;
  // `up` paralelo a la marcha: cualquier perpendicular estable.
  const eje: Vec3 = Math.abs(d[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  return unit(add(eje, d, -dot(eje, d))) ?? [0, 1, 0];
}

export interface WalkPose { position: Vec3; focalPoint: Vec3; viewUp: Vec3 }

/** Dónde está y hacia dónde mira la cámara a `s` mm del origen. */
export function walkPose(t: CenterlineTrack, s: number, prevUp: Vec3): WalkPose {
  const position = pointAtArc(t, s);
  let d = unit(sub(aheadAtArc(t, s + MIRA_MM), position));
  if (!d) d = unit(sub(position, pointAtArc(t, Math.max(0, s - MIRA_MM)))) ?? [0, 0, 1];
  return { position, focalPoint: add(position, d, MIRA_MM), viewUp: transportUp(prevUp, d) };
}

/** Arco recorrido `tS` segundos después de salir de `desde` hacia `hasta`
 *  (perfil trapecio: acelera en ARRANQUE_S, crucero, frena en ARRANQUE_S; si
 *  el tramo es corto, triángulo). `fin` cuando ya ha llegado. */
export function arcAtTime(tS: number, desde: number, hasta: number, v = RECORRIDO_MM_S, ta = ARRANQUE_S): { s: number; fin: boolean } {
  const D = Math.max(0, hasta - desde);
  if (D === 0 || tS <= 0) return { s: desde, fin: D === 0 };
  const a = v / ta;
  let vp = v, tp = ta;
  if (D < v * ta) { vp = Math.sqrt(a * D); tp = vp / a; }   // no llega a crucero
  const T = D / vp + tp;
  if (tS >= T) return { s: hasta, fin: true };
  let x: number;
  if (tS < tp) x = 0.5 * a * tS * tS;
  else if (tS > T - tp) x = D - 0.5 * a * (T - tS) * (T - tS);
  else x = 0.5 * vp * tp + vp * (tS - tp);
  return { s: desde + x, fin: false };
}
