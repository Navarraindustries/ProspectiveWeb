/* Los tres planos de corte como rectángulos en coordenadas de la malla
   (vóxel × espaciado, el mismo marco que usan las vistas de cortes y la traza
   del MIP). Son planos de ÍNDICE: en un volumen no alineado con LPS el «axial»
   es el plano k, igual que en la celda AXIAL, y así los rectángulos del 3D
   coinciden con lo que enseñan los cortes. */
import type { VolumeMeta } from "../api/types";
import type { Plane, Vec3 } from "./geometry";
import { planeRgb01 } from "./planeColors";

export interface PlaneOutline { plane: Plane; corners: [Vec3, Vec3, Vec3, Vec3]; color: [number, number, number] }

/** Los tres planos de ÍNDICE (ejes de vóxel) que pasan por `voxel`, con la extensión del volumen; [] sin meta. */
export function planeOutlines(voxel: { x: number; y: number; z: number } | null, meta: VolumeMeta | null): PlaneOutline[] {
  if (!voxel || !meta) return [];
  const [nz, ny, nx] = meta.shape; const [sz, sy, sx] = meta.spacing;
  const X = (nx - 1) * sx, Y = (ny - 1) * sy, Z = (nz - 1) * sz;
  const x = voxel.x * sx, y = voxel.y * sy, z = voxel.z * sz;
  const rect = (plane: Plane, corners: [Vec3, Vec3, Vec3, Vec3]): PlaneOutline => ({ plane, corners, color: planeRgb01(plane) });
  return [
    rect("axial",   [[0, 0, z], [X, 0, z], [X, Y, z], [0, Y, z]]),
    rect("coronal", [[0, y, 0], [X, y, 0], [X, y, Z], [0, y, Z]]),
    rect("sagital", [[x, 0, 0], [x, Y, 0], [x, Y, Z], [x, 0, Z]]),
  ];
}
