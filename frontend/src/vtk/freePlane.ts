/* Geometría del plano libre: el que recorta el volumen, el que muestra la vista
   Oblicuo y el que se dibuja en el 3D y en los cortes. Todo en el marco de
   índices (vóxel × espaciado, origen 0), el mismo que usan las demás vistas, y
   todo puro para poder probarlo sin WebGL. */
import type { VolumeMeta } from "../api/types";
import { voxelToMm, type Plane, type Vec3 } from "./geometry";

export interface FreePlane { azimuthDeg: number; elevationDeg: number; offsetMm: number }
export const DEFAULT_FREE_PLANE: FreePlane = { azimuthDeg: 0, elevationDeg: 0, offsetMm: 0 };
export const AZIMUTH_RANGE: [number, number] = [-180, 180];
/* 89 y no 90: con la normal paralela a y (elevación 90°) el «arriba» proyectado se anula. */
export const ELEVATION_RANGE: [number, number] = [-89, 89];

const EPS = 1e-9;
const rad = (d: number) => (d * Math.PI) / 180;
const clamp = (v: number, [lo, hi]: [number, number]) => Math.min(hi, Math.max(lo, v));
const norm = (v: Vec3): Vec3 => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: Vec3, b: Vec3, k = 1): Vec3 => [a[0] + k * b[0], a[1] + k * b[1], a[2] + k * b[2]];

export function clampPlane(p: FreePlane): FreePlane {
  return { azimuthDeg: clamp(p.azimuthDeg, AZIMUTH_RANGE), elevationDeg: clamp(p.elevationDeg, ELEVATION_RANGE), offsetMm: p.offsetMm };
}

export function normalOf(p: FreePlane): Vec3 {
  const a = rad(p.azimuthDeg), e = rad(p.elevationDeg);
  return norm([Math.sin(e) * Math.sin(a), Math.sin(e) * Math.cos(a), Math.cos(e)]);
}

/** Proyección de −y sobre el plano: un «arriba» fijo para que el oblicuo no gire
 *  solo al mover los ángulos. Es continuo en todo el rango permitido (solo se
 *  anula con la normal paralela a y, que |elevación| ≤ 89° excluye) y con
 *  elevación 0 da −y, el mismo «arriba» del corte axial en pantalla. */
export function upOf(p: FreePlane): Vec3 {
  const n = normalOf(p);
  const ref: Vec3 = [0, -1, 0];
  const k = dot(ref, n);
  return norm(sub(ref, [n[0] * k, n[1] * k, n[2] * k]));
}

export function rightOf(p: FreePlane): Vec3 { return norm(cross(upOf(p), normalOf(p))); }

export function originOf(p: FreePlane, voxel: { x: number; y: number; z: number }, meta: VolumeMeta): Vec3 {
  return add(voxelToMm(voxel, meta), normalOf(p), p.offsetMm);
}

export function boxMm(meta: VolumeMeta): [Vec3, Vec3] {
  const [nz, ny, nx] = meta.shape; const [sz, sy, sx] = meta.spacing;
  return [[0, 0, 0], [(nx - 1) * sx, (ny - 1) * sy, (nz - 1) * sz]];
}

/** Intersección plano–caja: se cortan las 12 aristas y los puntos se ordenan
 *  por ángulo en la base (right, up) alrededor de su centroide. */
export function clipPolygon(p: FreePlane, voxel: { x: number; y: number; z: number }, meta: VolumeMeta): Vec3[] {
  const n = normalOf(p), o = originOf(p, voxel, meta);
  const [lo, hi] = boxMm(meta);
  const corner = (i: number): Vec3 => [i & 1 ? hi[0] : lo[0], i & 2 ? hi[1] : lo[1], i & 4 ? hi[2] : lo[2]];
  const pts: Vec3[] = [];
  for (let i = 0; i < 8; i++) for (const bit of [1, 2, 4]) {
    if (i & bit) continue;
    const a = corner(i), b = corner(i | bit);
    const da = dot(sub(a, o), n), db = dot(sub(b, o), n);
    // Un vértice sobre el plano cuenta aunque sea el extremo b de la arista (el
    // vértice máximo solo es b); la tolerancia absorbe el error de coma flotante
    // cuando el offset se acota exactamente a esa cara.
    if (Math.abs(da) < EPS) pts.push(a);
    if (Math.abs(db) < EPS) pts.push(b);
    if ((da < -EPS && db > EPS) || (da > EPS && db < -EPS)) { const t = da / (da - db); pts.push(add(a, sub(b, a), t)); }
  }
  // Quitar duplicados (aristas que comparten un vértice cortado exactamente).
  const uniq: Vec3[] = [];
  for (const q of pts) if (!uniq.some((u) => Math.hypot(u[0] - q[0], u[1] - q[1], u[2] - q[2]) < 1e-6)) uniq.push(q);
  if (uniq.length < 3) return [];
  const c = uniq.reduce((s, v) => add(s, v, 1 / uniq.length), [0, 0, 0] as Vec3);
  const r = rightOf(p), u = upOf(p);
  return uniq.map((v) => ({ v, ang: Math.atan2(dot(sub(v, c), u), dot(sub(v, c), r)) })).sort((a, b) => a.ang - b.ang).map((x) => x.v);
}

/** El plano corta la caja mientras su origen quede entre las proyecciones
 *  mínima y máxima de los 8 vértices sobre la normal. */
export function clampOffsetToBox(p: FreePlane, voxel: { x: number; y: number; z: number }, meta: VolumeMeta): FreePlane {
  const n = normalOf(p), base = voxelToMm(voxel, meta);
  const [lo, hi] = boxMm(meta);
  let min = Infinity, max = -Infinity;
  for (let i = 0; i < 8; i++) {
    const v: Vec3 = [i & 1 ? hi[0] : lo[0], i & 2 ? hi[1] : lo[1], i & 4 ? hi[2] : lo[2]];
    const d = dot(sub(v, base), n); min = Math.min(min, d); max = Math.max(max, d);
  }
  return { ...p, offsetMm: clamp(p.offsetMm, [min, max]) };
}

/** Recta de intersección del plano libre con un corte de índice, recortada
 *  al rectángulo del corte y expresada en fracciones (u, v) con las mismas
 *  convenciones que las líneas de referencia (`planeCfg`): axial u=x/X v=y/Y;
 *  coronal u=x/X v=1−z/Z; sagital u=y/Y v=1−z/Z. */
export function sliceSegment(p: FreePlane, voxel: { x: number; y: number; z: number }, meta: VolumeMeta, slice: Plane, index: number): [[number, number], [number, number]] | null {
  const n = normalOf(p), o = originOf(p, voxel, meta);
  const [, hi] = boxMm(meta);
  const [nz, ny, nx] = meta.shape;
  const [sz, sy, sx] = meta.spacing;
  // Un corte que no existe en el volumen no tiene recta que dibujar.
  const count = slice === "axial" ? nz : slice === "coronal" ? ny : nx;
  if (index < 0 || index > count - 1) return null;
  // Ejes del corte en el marco 3D: (ejeU, ejeV, ejeFijo) y su coordenada fija.
  const cfg = slice === "axial" ? { u: 0, v: 1, f: 2, c: index * sz, flipV: false }
    : slice === "coronal" ? { u: 0, v: 2, f: 1, c: index * sy, flipV: true }
    : { u: 1, v: 2, f: 0, c: index * sx, flipV: true };
  const nu = n[cfg.u], nv = n[cfg.v];
  if (Math.abs(nu) < 1e-9 && Math.abs(nv) < 1e-9) return null;            // paralelo al corte
  // Ecuación en el corte: nu·u + nv·v = k, con u,v en mm.
  const k = dot(n, o) - n[cfg.f] * cfg.c;
  const U = hi[cfg.u], V = hi[cfg.v];
  const pts: [number, number][] = [];
  const push = (u: number, v: number) => { if (u >= -1e-9 && u <= U + 1e-9 && v >= -1e-9 && v <= V + 1e-9 && !pts.some((q) => Math.abs(q[0] - u) < 1e-6 && Math.abs(q[1] - v) < 1e-6)) pts.push([u, v]); };
  if (Math.abs(nv) > 1e-9) { push(0, k / nv); push(U, (k - nu * U) / nv); }          // con los bordes u = 0 y u = U
  if (Math.abs(nu) > 1e-9) { push(k / nu, 0); push((k - nv * V) / nu, V); }          // con los bordes v = 0 y v = V
  if (pts.length < 2) return null;
  const [a, b] = pts;
  const frac = (q: [number, number]): [number, number] => [q[0] / U, cfg.flipV ? 1 - q[1] / V : q[1] / V];
  return [frac(a), frac(b)];
}
