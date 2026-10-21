/* Asas de los planos en la escena 3D: un cuadradito en el centro de cada
   contorno que, arrastrado, mueve el plano solo a lo largo de su normal. Los
   planos de índice avanzan de corte en corte (el mismo índice que la celda de
   su corte); el plano libre cambia su desplazamiento en mm. Puro: el Viewer
   pone el rayo (screenToAxis) y escribe el resultado. */
import type { VolumeMeta } from "../api/types";
import type { Plane, Vec3 } from "./geometry";
import type { Handle } from "./MeshView";
import { normalOf, type FreePlane } from "./freePlane";
import type { OutlinePlane } from "./planeColors";
import { polygonCentroid, type PlaneOutline } from "./planeOutlines";

/** Lado del cuadrado en mm: pequeño para no tapar el corte, agarrable con el ratón. */
const HANDLE_MM = 1.2;

/** Un cuadrado por contorno, del color del contorno, en su centroide. */
export function planeHandles(outlines: PlaneOutline[]): Handle[] {
  return outlines.map((o) => ({ id: `plane:${o.plane}`, kind: "square", pos: polygonCentroid(o.corners), radiusMm: HANDLE_MM, color: o.color }));
}

/** Dirección en que se mueve cada plano (en el marco de la malla, ejes de vóxel). */
export function planeAxis(plane: OutlinePlane, freePlane: FreePlane): Vec3 {
  if (plane === "axial") return [0, 0, 1];
  if (plane === "coronal") return [0, 1, 0];
  if (plane === "sagital") return [1, 0, 0];
  return normalOf(freePlane);
}

/** Índice del corte tras desplazarlo `dtMm` por su eje: redondeado al corte
 *  más cercano y acotado al volumen (0..n−1). */
export function indexFromDrag(plane: Plane, startIndex: number, dtMm: number, meta: VolumeMeta): number {
  const k = plane === "axial" ? 0 : plane === "coronal" ? 1 : 2;   // shape/spacing van en (z, y, x)
  const n = meta.shape[k], s = meta.spacing[k];
  const i = Math.round(startIndex + (s > 0 ? dtMm / s : 0));
  return Math.max(0, Math.min(n - 1, i));
}
