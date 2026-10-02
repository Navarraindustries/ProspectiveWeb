// frontend/src/vtk/dragController.ts
/* De píxeles a geometría: el rayo de la cámara por un píxel y su corte con el
   plano, el eje o la esfera que toca cada asa. Puro para poder probar los
   gestos sin WebGL; la única entrada «viva» es un resumen de la cámara. */
import type vtkCamera from "@kitware/vtk.js/Rendering/Core/Camera";
import type { Vec3 } from "./geometry";
export interface CameraLike { position: Vec3; focalPoint: Vec3; viewUp: Vec3; parallel: boolean; parallelScale: number; viewAngleDeg: number }
export interface Viewport { width: number; height: number }
export interface Ray { origin: Vec3; dir: Vec3 }
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0]-b[0], a[1]-b[1], a[2]-b[2]];
const add = (a: Vec3, b: Vec3, k = 1): Vec3 => [a[0]+k*b[0], a[1]+k*b[1], a[2]+k*b[2]];
const dot = (a: Vec3, b: Vec3) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
const norm = (v: Vec3): Vec3 => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0]/l, v[1]/l, v[2]/l]; };

export function pixelRay(cam: CameraLike, vp: Viewport, px: number, py: number): Ray {
  const f = norm(sub(cam.focalPoint, cam.position));
  const r = norm(cross(f, cam.viewUp)), u = cross(r, f);
  // py crece hacia abajo en el lienzo; el espacio de la cámara tiene y hacia arriba
  const x = (px / vp.width) * 2 - 1, y = 1 - (py / vp.height) * 2, aspect = vp.width / vp.height;
  if (cam.parallel) {
    const origin = add(add(cam.position, r, x * cam.parallelScale * aspect), u, y * cam.parallelScale);
    return { origin, dir: f };
  }
  const t = Math.tan((cam.viewAngleDeg * Math.PI) / 360);
  return { origin: cam.position, dir: norm(add(add(f, r, x * t * aspect), u, y * t)) };
}
export function screenToPlane(cam: CameraLike, vp: Viewport, px: number, py: number, plane: { origin: Vec3; normal: Vec3 }): Vec3 | null {
  const { origin, dir } = pixelRay(cam, vp, px, py);
  const d = dot(dir, plane.normal);
  if (Math.abs(d) < 1e-6) return null;
  const t = dot(sub(plane.origin, origin), plane.normal) / d;
  // Detrás del ojo (en perspectiva, con el plano casi de canto o la cámara
  // al otro lado) el corte es geométricamente válido pero no está en pantalla:
  // seguirlo lanzaría el asa al lado opuesto del cursor.
  if (t < 0) return null;
  return add(origin, dir, t);
}
export function screenToAxis(cam: CameraLike, vp: Viewport, px: number, py: number, axis: { origin: Vec3; dir: Vec3 }): number | null {
  const { origin, dir } = pixelRay(cam, vp, px, py);
  const a = norm(axis.dir), w = sub(axis.origin, origin);
  const b = dot(a, dir), denom = 1 - b * b;
  if (Math.abs(denom) < 1e-9) return null;
  // punto del eje más cercano a la recta del rayo (ambas rectas infinitas)
  return (dot(w, dir) * b - dot(w, a)) / denom;
}
export function screenToSphere(cam: CameraLike, vp: Viewport, px: number, py: number, s: { center: Vec3; r: number }): Vec3 | null {
  const { origin, dir } = pixelRay(cam, vp, px, py);
  const oc = sub(origin, s.center), b = dot(oc, dir), c = dot(oc, oc) - s.r * s.r, disc = b * b - c;
  if (disc < 0) return null;
  const t = -b - Math.sqrt(disc);
  return add(origin, dir, t);
}
/** Las dos caras que corta el rayo, la cercana primero; null si no la toca.
 *  Un asa que está detrás de la esfera (el brazo apuntando lejos de la cámara)
 *  se agarra por la cara lejana: quien arrastra elige la que sigue al asa. */
export function screenToSphereBoth(cam: CameraLike, vp: Viewport, px: number, py: number, s: { center: Vec3; r: number }): [Vec3, Vec3] | null {
  const { origin, dir } = pixelRay(cam, vp, px, py);
  const oc = sub(origin, s.center), b = dot(oc, dir), c = dot(oc, oc) - s.r * s.r, disc = b * b - c;
  if (disc < 0) return null;
  const q = Math.sqrt(disc);
  return [add(origin, dir, -b - q), add(origin, dir, -b + q)];
}
export function angleAround(cam: CameraLike, vp: Viewport, px: number, py: number, center: Vec3, normal: Vec3): number | null {
  const p = screenToPlane(cam, vp, px, py, { origin: center, normal });
  if (!p) return null;
  const n = norm(normal);
  // base fija del plano: el mismo ángulo en cada evento aunque la cámara cambie
  const any: Vec3 = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const e1 = norm(sub(any, [n[0]*dot(any, n), n[1]*dot(any, n), n[2]*dot(any, n)])), e2 = cross(n, e1);
  const v = sub(p, center);
  return Math.atan2(dot(v, e2), dot(v, e1));
}
export function cameraLike(cam: vtkCamera, vp: Viewport): CameraLike {
  void vp;
  return { position: cam.getPosition() as Vec3, focalPoint: cam.getFocalPoint() as Vec3, viewUp: cam.getViewUp() as Vec3, parallel: cam.getParallelProjection(), parallelScale: cam.getParallelScale(), viewAngleDeg: cam.getViewAngle() };
}
