/* El abordaje como dirección: lo que la cámara mira y lo que el plano Oblicuo
   corta en perpendicular (spec §4). */
import type { Vec3 } from "./geometry";

export function approachDirection(entry: Vec3, target: Vec3): Vec3 | null {
  const d: Vec3 = [target[0] - entry[0], target[1] - entry[1], target[2] - entry[2]];
  const l = Math.hypot(d[0], d[1], d[2]);
  return l < 1e-6 ? null : [d[0] / l, d[1] / l, d[2] / l];
}

/** Respecto a qué se mide el ángulo del corredor: el servidor usa el eje
 *  principal del saco y, sin morfometría, el eje z. La etiqueta lo dice. */
export function angleReferenceLabel(axis: number[] | null | undefined): { text: string; title: string } {
  const hasAxis = !!axis && axis.some((v) => v !== 0);
  return hasAxis
    ? { text: "Ángulo respecto al eje del aneurisma", title: "Incidencia del corredor sobre el eje principal del saco, de 0° (a lo largo del eje) a 90° (perpendicular)" }
    : { text: "Ángulo respecto al eje vertical del estudio (sin eje del aneurisma medido)", title: "Sin morfometría el servidor mide la incidencia contra el eje z del estudio; mide el aneurisma para tener la referencia clínica" };
}
