/* Geometría pura del visor: sin vtk.js, sin DOM, para poder probarla.
   Convención: el volumen es (z, y, x); las mallas están en mm = vóxel·spacing
   con origen 0; la pantalla de cada plano reproduce los PNG del servidor. */

import type { VolumeMeta } from "../api/types";

export type Vec3 = [number, number, number];
export type Plane = "axial" | "coronal" | "sagital";
export interface ManualOrientation {
  anteriorEdge: "top" | "right" | "bottom" | "left";
  firstSliceSuperior: boolean;
}
export interface Orientation {
  direction: number[] | null;
  manual: ManualOrientation | null;
}

const clampIdx = (n: number, i: number) => Math.max(0, Math.min(n - 1, Math.round(i)));

export function voxelToMm(v: { x: number; y: number; z: number }, meta: VolumeMeta): Vec3 {
  const [sz, sy, sx] = meta.spacing;
  return [v.x * sx, v.y * sy, v.z * sz];
}

export function mmToVoxel(mm: Vec3, meta: VolumeMeta): { x: number; y: number; z: number } {
  const [nz, ny, nx] = meta.shape;
  const [sz, sy, sx] = meta.spacing;
  return { x: clampIdx(nx, mm[0] / sx), y: clampIdx(ny, mm[1] / sy), z: clampIdx(nz, mm[2] / sz) };
}

/* Dirección de proyección (hacia dónde mira) y up que reproducen los PNG:
   axial fila 0 arriba y x a la derecha; coronal/sagital con z arriba.
   Los componentes -0 (en vez de 0) son intencionales: son el mismo valor
   matemático, pero conservan el signo que hace que el producto cruzado con
   viewUp dé +0 en vez de -0 (IEEE754 propaga el signo en 0 * negativo), que
   es lo que exigen las pruebas con toEqual (sensible a -0 vs +0). */
export function sliceCamera(plane: Plane): { direction: Vec3; viewUp: Vec3 } {
  if (plane === "axial") return { direction: [-0, 0, 1], viewUp: [0, -1, 0] };
  if (plane === "coronal") return { direction: [0, 1, 0], viewUp: [0, 0, 1] };
  return { direction: [-1, -0, -0], viewUp: [0, 0, 1] };
}

/* -0 === 0 mas toEqual distingue el signo; se normaliza para no filtrar el
   artefacto de -0 de la negación de un viewUp con componentes en 0. */
const cleanZero = (n: number): number => (n === 0 ? 0 : n);

export function screenAxes(plane: Plane): { right: Vec3; down: Vec3 } {
  const { direction: d, viewUp: u } = sliceCamera(plane);
  const right: Vec3 = [d[1] * u[2] - d[2] * u[1], d[2] * u[0] - d[0] * u[2], d[0] * u[1] - d[1] * u[0]]
    .map(cleanZero) as Vec3;
  const down = [-u[0], -u[1], -u[2]].map(cleanZero) as Vec3;
  return { right, down };
}

/* Orientación manual → matriz de dirección (columnas = ejes i, j, k en LPS).
   En el axial la pantalla tiene +x a la derecha y +y abajo. Con anterior
   arriba, la derecha de pantalla es la izquierda del paciente (convención
   radiológica) y abajo es posterior; cada borde siguiente gira 90°. */
const AXIAL_BY_EDGE: Record<ManualOrientation["anteriorEdge"], { right: Vec3; down: Vec3 }> = {
  top:    { right: [1, 0, 0],  down: [0, 1, 0] },    // L, P
  right:  { right: [0, -1, 0], down: [1, 0, 0] },    // A, L
  bottom: { right: [-1, 0, 0], down: [0, -1, 0] },   // R, A
  left:   { right: [0, 1, 0],  down: [-1, 0, 0] },   // P, R
};

export function manualToDirection(m: ManualOrientation): number[] {
  const { right: i, down: j } = AXIAL_BY_EDGE[m.anteriorEdge];
  const k: Vec3 = m.firstSliceSuperior ? [0, 0, -1] : [0, 0, 1];
  return [i[0], j[0], k[0], i[1], j[1], k[1], i[2], j[2], k[2]];
}

/* Orientación asumida cuando el DICOM no trae cosenos y nadie la ha fijado a
   mano: anterior arriba en el axial y el primer corte inferior, que es la
   matriz identidad (i→L, j→P, k→S). Se muestra entre corchetes, igual que la
   manual, hasta que el usuario la corrija; «?» en los bordes no orienta a
   nadie y dejaba sin cinta de rumbo al MIP. */
export const DEFAULT_MANUAL_ORIENTATION: ManualOrientation = { anteriorEdge: "top", firstSliceSuperior: false };

export function effectiveDirection(o: Orientation): { d: number[]; known: boolean } {
  if (o.direction && o.direction.length === 9) return { d: o.direction, known: true };
  return { d: manualToDirection(o.manual ?? DEFAULT_MANUAL_ORIENTATION), known: false };
}

/* Un eje del volumen (i, j o k, con signo) → vector LPS. */
function toLps(d: number[], v: Vec3): Vec3 {
  return [
    d[0] * v[0] + d[1] * v[1] + d[2] * v[2],
    d[3] * v[0] + d[4] * v[1] + d[5] * v[2],
    d[6] * v[0] + d[7] * v[1] + d[8] * v[2],
  ];
}

function lpsLabel(v: Vec3): string {
  const ax = [Math.abs(v[0]), Math.abs(v[1]), Math.abs(v[2])];
  const k = ax.indexOf(Math.max(...ax));
  if (k === 0) return v[0] > 0 ? "IZQ" : "DER";
  if (k === 1) return v[1] > 0 ? "POST" : "ANT";
  return v[2] > 0 ? "SUP" : "INF";
}

export function edgeLabels(plane: Plane, o: Orientation): { top: string; bottom: string; left: string; right: string } {
  const eff = effectiveDirection(o);
  const wrap = (s: string) => (eff.known ? s : `[${s}]`);
  const { right, down } = screenAxes(plane);
  const neg = (v: Vec3): Vec3 => [-v[0], -v[1], -v[2]];
  return {
    right: wrap(lpsLabel(toLps(eff.d, right))),
    left: wrap(lpsLabel(toLps(eff.d, neg(right)))),
    bottom: wrap(lpsLabel(toLps(eff.d, down))),
    top: wrap(lpsLabel(toLps(eff.d, neg(down)))),
  };
}

/* Rumbo de la cámara respecto al paciente: azimut 0 = mirando desde anterior,
   90 = desde la izquierda del paciente; elevación 90 = desde arriba. */
export function cameraHeading(directionOfProjection: Vec3, viewUp: Vec3, o: Orientation) {
  const eff = effectiveDirection(o);
  const d = toLps(eff.d, directionOfProjection);            // hacia dónde mira, en LPS
  const from: Vec3 = [-d[0], -d[1], -d[2]];                  // desde dónde mira
  const elevationDeg = (Math.asin(Math.max(-1, Math.min(1, from[2]))) * 180) / Math.PI;
  // Anterior es −P (LPS y negativo); la izquierda es +L.
  const azimuthDeg = (Math.atan2(from[0], -from[1]) * 180) / Math.PI;
  void viewUp;
  return { azimuthDeg, elevationDeg, known: eff.known };
}
