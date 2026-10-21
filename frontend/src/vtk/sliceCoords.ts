/* Conversión exacta entre las fracciones (u, v) del rectángulo de un corte y
   los mm del marco del volumen. Hasta ahora un clic se redondeaba a vóxel
   (planeCfg): una regla de 3 mm con vóxeles de 0,5 mm salía con ±0,5 mm de
   error por extremo. La región de un plano no lo soporta. */
import type { VolumeMeta } from "../api/types";
import type { Plane, Vec3 } from "./geometry";

export const PLANE_AXIS: Record<Plane, 0 | 1 | 2> = { axial: 2, coronal: 1, sagital: 0 };

// La misma inversión de v que el visor: coronal y sagital enseñan z hacia arriba.
export function uvToMm(plane: Plane, index: number, u: number, v: number, meta: VolumeMeta): Vec3 {
  const [nz, ny, nx] = meta.shape, [sz, sy, sx] = meta.spacing;
  const span = (n: number, f: number) => (n > 1 ? f * (n - 1) : 0);
  if (plane === "axial") return [span(nx, u) * sx, span(ny, v) * sy, index * sz];
  if (plane === "coronal") return [span(nx, u) * sx, index * sy, span(nz, 1 - v) * sz];
  return [index * sx, span(ny, u) * sy, span(nz, 1 - v) * sz];
}

export function mmToUv(plane: Plane, p: Vec3, meta: VolumeMeta): { u: number; v: number } {
  const [nz, ny, nx] = meta.shape, [sz, sy, sx] = meta.spacing;
  const f = (n: number, mm: number, s: number) => (n > 1 ? mm / s / (n - 1) : 0.5);
  if (plane === "axial") return { u: f(nx, p[0], sx), v: f(ny, p[1], sy) };
  if (plane === "coronal") return { u: f(nx, p[0], sx), v: 1 - f(nz, p[2], sz) };
  return { u: f(ny, p[1], sy), v: 1 - f(nz, p[2], sz) };
}
