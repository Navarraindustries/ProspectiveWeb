// frontend/src/vtk/clipPose.ts
/* La pose del clip tal y como la cuece el servidor (services/devices.pose_transform),
   reproducida en el cliente para mover la malla ya cocida con una matriz delta
   mientras llega el plan nuevo. Matrices 4×4 por filas, como vtk.js. */
import type { Vec3 } from "./geometry";

export type Mat4 = number[];
export const TILT_MAX_DEG = 60;
// Congelada: se comparte por referencia (MeshView la pasa a setUserMatrix, que
// copia), y una escritura accidental movería todo lo que vuelve a la identidad.
export const IDENTITY = Object.freeze([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]) as Mat4;
const rad = (d: number) => (d * Math.PI) / 180;
const norm = (v: Vec3): Vec3 => { const l = Math.hypot(v[0], v[1], v[2]); return l > 1e-9 ? [v[0]/l, v[1]/l, v[2]/l] : [0, 0, 0]; };
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
const dot = (a: Vec3, b: Vec3) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];

/** Rotación de Rodrigues de `deg` alrededor de `axis` (unitario). */
function rotationWXYZ(deg: number, axis: Vec3): Mat4 {
  const [x, y, z] = axis, c = Math.cos(rad(deg)), s = Math.sin(rad(deg)), t = 1 - c;
  return [t*x*x+c, t*x*y-s*z, t*x*z+s*y, 0,  t*x*y+s*z, t*y*y+c, t*y*z-s*x, 0,  t*x*z-s*y, t*y*z+s*x, t*z*z+c, 0,  0,0,0,1];
}
const translation = (p: Vec3): Mat4 => [1,0,0,p[0], 0,1,0,p[1], 0,0,1,p[2], 0,0,0,1];

export function multiply(a: Mat4, b: Mat4): Mat4 {
  const r = new Array(16).fill(0);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) for (let k = 0; k < 4; k++) r[i*4+j] += a[i*4+k] * b[k*4+j];
  return r;
}
export function applyPoint(m: Mat4, p: Vec3): Vec3 {
  return [m[0]*p[0]+m[1]*p[1]+m[2]*p[2]+m[3], m[4]*p[0]+m[5]*p[1]+m[6]*p[2]+m[7], m[8]*p[0]+m[9]*p[1]+m[10]*p[2]+m[11]];
}
/** Inversa de una transformación rígida: R^T y −R^T·t. */
export function invert(m: Mat4): Mat4 {
  const r = [m[0],m[4],m[8], m[1],m[5],m[9], m[2],m[6],m[10]];
  const t: Vec3 = [m[3], m[7], m[11]];
  const nt = [-(r[0]*t[0]+r[1]*t[1]+r[2]*t[2]), -(r[3]*t[0]+r[4]*t[1]+r[5]*t[2]), -(r[6]*t[0]+r[7]*t[1]+r[8]*t[2])];
  return [r[0],r[1],r[2],nt[0], r[3],r[4],r[5],nt[1], r[6],r[7],r[8],nt[2], 0,0,0,1];
}

/** Rotación mínima que lleva +z a `axis`; 180° alrededor de x si son antiparalelos (como VTK); identidad si `axis` es nulo. */
export function axisRotation(axis: Vec3): Mat4 {
  const n = norm(axis);
  // Copias de la identidad: como las otras ramas, el resultado es una matriz
  // nueva que quien la recibe puede modificar sin tocar la constante congelada.
  if (dot(n, n) < 0.5) return [...IDENTITY];
  const z: Vec3 = [0, 0, 1];
  const ax = cross(z, n), l = Math.hypot(ax[0], ax[1], ax[2]);
  if (l >= 1e-9) return rotationWXYZ((Math.acos(Math.max(-1, Math.min(1, dot(z, n)))) * 180) / Math.PI, [ax[0]/l, ax[1]/l, ax[2]/l]);
  return n[2] < 0 ? rotationWXYZ(180, [1, 0, 0]) : [...IDENTITY];
}

export function poseMatrix(position: Vec3, normal: Vec3, rotationDeg: number): Mat4 {
  const n = norm(normal);
  return multiply(multiply(translation(position), axisRotation(dot(n, n) < 0.5 ? [0, 0, 1] : n)), rotationWXYZ(rotationDeg, [0, 0, 1]));
}
export function poseDelta(from: { position: Vec3; normal: Vec3; rotationDeg: number }, to: { position: Vec3; normal: Vec3; rotationDeg: number }): Mat4 {
  return multiply(poseMatrix(to.position, to.normal, to.rotationDeg), invert(poseMatrix(from.position, from.normal, from.rotationDeg)));
}

/* Inclinación de la normal del clip en el marco del cuello: los mismos ángulos
   que el plano libre (azimut alrededor del eje, elevación desde el eje), pero
   referidos al eje principal del cuello en vez de a +z. */
export function neckFrameNormal(axis: Vec3 | null, azimuthDeg: number, elevationDeg: number): Vec3 {
  const a = rad(azimuthDeg), e = rad(elevationDeg);
  const local: Vec3 = [Math.sin(e) * Math.sin(a), Math.sin(e) * Math.cos(a), Math.cos(e)];
  const R = axisRotation(axis ?? [0, 0, 1]);
  return norm(applyPoint([R[0],R[1],R[2],0, R[4],R[5],R[6],0, R[8],R[9],R[10],0, 0,0,0,1], local));
}
export function neckFrameAngles(axis: Vec3 | null, normal: Vec3): { azimuthDeg: number; elevationDeg: number } {
  const Rinv = invert(axisRotation(axis ?? [0, 0, 1]));
  const l = norm(applyPoint([Rinv[0],Rinv[1],Rinv[2],0, Rinv[4],Rinv[5],Rinv[6],0, Rinv[8],Rinv[9],Rinv[10],0, 0,0,0,1], normal));
  const e = Math.acos(Math.max(-1, Math.min(1, l[2])));
  const a = Math.hypot(l[0], l[1]) < 1e-9 ? 0 : Math.atan2(l[0], l[1]);
  return { azimuthDeg: (a * 180) / Math.PI, elevationDeg: (e * 180) / Math.PI };
}
export function clampTilt(t: { azimuthDeg: number; elevationDeg: number }) {
  return { azimuthDeg: Math.max(-180, Math.min(180, t.azimuthDeg)), elevationDeg: Math.max(0, Math.min(TILT_MAX_DEG, t.elevationDeg)) };
}
