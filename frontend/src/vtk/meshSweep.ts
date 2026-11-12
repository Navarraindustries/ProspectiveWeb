/* Llegada de la malla segmentada: aparece de los pies a la cabeza del
   paciente con una franja luminosa en el frente, como un escáner. Aquí la
   geometría y el ritmo, puros; MeshView pone los planos de recorte. */
import { cubicBezier, EASE_EN_MOVIMIENTO } from "../motion";
import { effectiveDirection, fromLps, type Orientation, type Vec3 } from "./geometry";

/** Lo que tarda el barrido. Pasa una vez por segmentación: hay sitio para
 *  un gesto más largo que el de un control. */
export const BARRIDO_MS = 1600;
/** Grosor de la franja del frente: un 4 % del recorrido, con un mínimo. */
export const FRANJA_MIN_MM = 1.5;
/** Giro de la malla mientras se espera la segmentación (una vuelta en 30 s). */
export const GIRO_ESPERA_GRADOS_S = 12;

const curva = cubicBezier(...EASE_EN_MOVIMIENTO);

/** El superior del paciente en coordenadas de la malla (unitario). */
export function superiorEnMalla(o: Orientation): Vec3 {
  const v = fromLps(effectiveDirection(o).d, [0, 0, 1]);
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

/** De dónde a dónde va el barrido sobre `eje`: la proyección de las ocho
 *  esquinas de la caja de la malla. */
export function tramoBarrido(b: readonly number[], eje: Vec3): { desde: number; hasta: number; franja: number } {
  let desde = Infinity, hasta = -Infinity;
  for (const x of [b[0], b[1]]) for (const y of [b[2], b[3]]) for (const z of [b[4], b[5]]) {
    const p = x * eje[0] + y * eje[1] + z * eje[2];
    desde = Math.min(desde, p); hasta = Math.max(hasta, p);
  }
  return { desde, hasta, franja: Math.max(FRANJA_MIN_MM, 0.04 * (hasta - desde)) };
}

/** Dónde va el frente a los `ms`: empieza una franja por debajo de la malla
 *  (no se ve nada) y acaba una franja por encima (se ve entera y la franja ya
 *  salió). Acelera y frena: es un movimiento por la pantalla. */
export function frenteBarrido(ms: number, t: { desde: number; hasta: number; franja: number }): { frente: number; fin: boolean } {
  const k = Math.min(1, Math.max(0, ms / BARRIDO_MS));
  const a = t.desde - t.franja, z = t.hasta + t.franja;
  return { frente: a + (z - a) * curva(k), fin: k >= 1 };
}
