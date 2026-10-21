/* slicePlanes — los tres cortes de índice como planos del mundo de la escena,
   para el modo «Cortes 3D».

   WHY: la escena y el vtkImageData cliente comparten el mismo espacio en mm
   (origen 0, espaciado de la meta), así que cada corte es el plano de índice
   que pasa por el punto compartido. Puro para probarlo sin WebGL. */
import type { VolumeMeta } from "../api/types";
import { voxelToMm, type Plane, type Vec3 } from "./geometry";

export interface SlicePlaneSpec { plane: Plane; normal: Vec3; originMm: Vec3 }

/** Opacidad de la malla en «Cortes 3D»: deja ver los cortes a través de ella
 *  sin perder la forma del vaso. */
export const SLICES3D_MESH_OPACITY = 0.35;

export function slicePlaneSpecs(voxel: { x: number; y: number; z: number }, meta: VolumeMeta): SlicePlaneSpec[] {
  const o = voxelToMm(voxel, meta);
  return [
    { plane: "axial", normal: [0, 0, 1], originMm: o },
    { plane: "coronal", normal: [0, 1, 0], originMm: o },
    { plane: "sagital", normal: [1, 0, 0], originMm: o },
  ];
}
