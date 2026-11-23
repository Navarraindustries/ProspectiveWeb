/* Recorrido por dentro del vaso (angioscopia virtual): la cámara avanza por la
   línea central mirando unos milímetros por delante. Aquí solo la geometría y
   el ritmo, puros; MeshView mueve la cámara y Viewer pone los mandos. */
import type { CenterlineTrack } from "./centerlineWalk";
import type { Vec3 } from "./geometry";

/** Velocidad de crucero por el vaso (mm/s): un segmento de 40 mm dura ~8 s.
 *  A 8 mm/s (22-11) la pared pasaba demasiado rápido para leerla al
 *  enseñarlo; las teclas con Mayús siguen yendo al triple. */
export const RECORRIDO_MM_S = 5;
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
/** Repetir el recorrido rebobina por dentro del vaso, mirando hacia delante
 *  como un vídeo hacia atrás, al triple de la velocidad de ida (13-11: antes
 *  la cámara volaba del final al origen atravesando las paredes). */
export const REBOBINADO_MM_S = 3 * RECORRIDO_MM_S;
/** Lo que se queda quieta en el origen antes de volver a avanzar (ms). */
export const PAUSA_REBOBINADO_MS = 300;

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: Vec3, b: Vec3, k = 1): Vec3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);
const unit = (a: Vec3): Vec3 | null => { const l = len(a); return l < 1e-9 ? null : [a[0] / l, a[1] / l, a[2] / l]; };

export const longitudRecorrido = (t: CenterlineTrack): number => (t.arcMm.length ? t.arcMm[t.arcMm.length - 1] - t.arcMm[0] : 0);

/** Al llegar, la cámara da una vuelta completa sobre su arriba, en el sitio,
 *  para ver todo lo que rodea al destino, y acaba mirando de frente otra vez
 *  (13-11, a petición: antes era un vaivén de ±24° en 2,6 s). */
export const GIRO_GRADOS = 360;
export const GIRO_MS = 7000;

/** Ángulo (grados) de la vuelta final a los `ms` de llegar: de 0 a
 *  GIRO_GRADOS con arranque y frenada suaves (coseno), 0 fuera de [0, GIRO_MS]
 *  (al acabar, la vuelta entera vuelve a ser mirar de frente). */
export function giroFinal(ms: number): number {
  if (ms <= 0 || ms >= GIRO_MS) return 0;
  const k = ms / GIRO_MS;
  return GIRO_GRADOS * (0.5 - 0.5 * Math.cos(Math.PI * k));
}

/** `v` girado `grados` alrededor del eje unitario `eje` (Rodrigues). */
export function rotarAlrededor(v: Vec3, eje: Vec3, grados: number): Vec3 {
  const a = (grados * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  const d = dot(eje, v);
  const x: Vec3 = [eje[1] * v[2] - eje[2] * v[1], eje[2] * v[0] - eje[0] * v[2], eje[0] * v[1] - eje[1] * v[0]];
  return [v[0] * c + x[0] * s + eje[0] * d * (1 - c), v[1] * c + x[1] * s + eje[1] * d * (1 - c), v[2] * c + x[2] * s + eje[2] * d * (1 - c)];
}

/** La pose de la vuelta final: misma posición, la mirada girada sobre el arriba. */
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

/** Arco `tS` segundos después de empezar a rebobinar de `desde` hacia `hasta`
 *  (`hasta` < `desde`): el mismo perfil trapecio que la ida, al revés y a
 *  REBOBINADO_MM_S. */
export function arcRebobinado(tS: number, desde: number, hasta: number): { s: number; fin: boolean } {
  const { s, fin } = arcAtTime(tS, 0, Math.max(0, desde - hasta), REBOBINADO_MM_S);
  return { s: desde - s, fin };
}

// ── Mandos durante el recorrido (17-11) ──────────────────────────────── #
// Pedido: avanzar y retroceder con el teclado y girar la cámara en TODO
// momento, sin que mirar alrededor pare el recorrido ni saque la cámara de la
// línea. La mirada es un giro relativo a la marcha (guiñada sobre el arriba,
// cabeceo sobre el lado) que se suma a la pose de la línea en cada fotograma.

export interface Mirada { guinada: number; cabeceo: number }
export const MIRADA_AL_FRENTE: Mirada = { guinada: 0, cabeceo: 0 };
/** Cabeceo máximo (°): más allá, arriba y adelante se confunden. */
export const CABECEO_MAX = 85;
/** Grados de giro por píxel de arrastre. */
export const GRADOS_POR_PIXEL = 0.3;
/** Con Mayús, las teclas van a este múltiplo de la velocidad de crucero. */
export const RAPIDO_X = 3;
/** Con las teclas la cámara responde más rápido que en automático: un
 *  toque corto ya la mueve (con 0,6 s de rampa, un toque no se notaba). */
export const ARRANQUE_TECLAS_S = 0.15;
/** Milímetros por «clic» de la rueda (deltaY ≈ 100). */
export const MM_POR_RUEDA = 1;

const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** La mirada tras arrastrar `dx`, `dy` píxeles. Como en el resto del visor,
 *  se agarra la escena: arrastrar a la derecha la lleva a la derecha (se mira
 *  a la izquierda). */
export function girarMirada(m: Mirada, dx: number, dy: number): Mirada {
  let g = m.guinada + dx * GRADOS_POR_PIXEL;
  g = ((g + 180) % 360 + 360) % 360 - 180;
  const c = Math.max(-CABECEO_MAX, Math.min(CABECEO_MAX, m.cabeceo + dy * GRADOS_POR_PIXEL));
  return { guinada: g, cabeceo: c };
}

/** La pose de la línea girada por la mirada, en el mismo sitio. */
export function poseConMirada(p: WalkPose, m: Mirada): WalkPose {
  if (m.guinada === 0 && m.cabeceo === 0) return p;
  const f = unit(sub(p.focalPoint, p.position));
  if (!f) return p;
  const f1 = rotarAlrededor(f, p.viewUp, m.guinada);
  const lado = unit(cross(f1, p.viewUp));
  if (!lado) return p;
  const f2 = rotarAlrededor(f1, lado, m.cabeceo);
  const up2 = rotarAlrededor(p.viewUp, lado, m.cabeceo);
  return { position: p.position, focalPoint: add(p.position, f2, MIRA_MM), viewUp: up2 };
}

export type ModoPaseo = "avance" | "rebobinado" | "quieto";
export interface Teclas { adelante: boolean; atras: boolean; rapido: boolean }
export const SIN_TECLAS: Teclas = { adelante: false, atras: false, rapido: false };

/** La velocidad (mm/s, con signo) a la que se quiere ir: mandan las teclas
 *  si hay alguna pulsada; si no, el modo. */
export function velocidadObjetivo(modo: ModoPaseo, t: Teclas): number {
  const x = t.rapido ? RAPIDO_X : 1;
  if (t.adelante && !t.atras) return RECORRIDO_MM_S * x;
  if (t.atras && !t.adelante) return -RECORRIDO_MM_S * x;
  if (modo === "avance") return RECORRIDO_MM_S;
  if (modo === "rebobinado") return -REBOBINADO_MM_S;
  return 0;
}

/** Un paso de `dtS` segundos hacia la velocidad `objetivo` sobre una línea
 *  de `L` mm: acelera y frena con la misma rampa que el perfil trapecio
 *  (ARRANQUE_S hasta la velocidad), y frena a tiempo para pararse justo en
 *  los extremos en vez de chocar con ellos. */
export function pasoPaseo(s: number, v: number, dtS: number, objetivo: number, L: number, arranqueS = ARRANQUE_S): { s: number; v: number } {
  const a = Math.max(Math.abs(objetivo), RECORRIDO_MM_S) / arranqueS;
  let vt = objetivo;
  if (vt > 0) vt = Math.min(vt, Math.sqrt(2 * a * Math.max(0, L - s)));
  if (vt < 0) vt = Math.max(vt, -Math.sqrt(2 * a * Math.max(0, s)));
  const dv = a * dtS;
  let v2 = v < vt ? Math.min(vt, v + dv) : Math.max(vt, v - dv);
  // Con la frenada en raíz cuadrada nunca se llega del todo: a menos de
  // 0,05 mm del extremo, ya ha llegado.
  let s2 = s + v2 * dtS;
  if (objetivo > 0 && L - s2 < 0.05) { s2 = L; v2 = 0; }
  if (objetivo < 0 && s2 < 0.05) { s2 = 0; v2 = 0; }
  if (s2 >= L) { s2 = L; v2 = Math.min(v2, 0); }
  if (s2 <= 0) { s2 = 0; v2 = Math.max(v2, 0); }
  return { s: s2, v: v2 };
}

/** Hasta dónde avanza la cámara en esta línea: hasta el final si termina
 *  dentro de la lesión (su punto más hondo, lejos de la pared); si no, se
 *  para PARADA_MM antes (el destino marcado suele estar sobre la pared). */
export const finDeLinea = (t: CenterlineTrack): number =>
  (t.endsInLesion ? longitudRecorrido(t) : finRecorrido(longitudRecorrido(t)));
