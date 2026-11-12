/* Vuelo de la cámara 3D: de una vista a otra en un arco alrededor del foco, en
   vez de un salto. «Centrar en la lesión», la vista de abordaje o un cambio de
   cara dejaban la escena en otra parte de golpe y había que volver a
   orientarse; el vuelo enseña de dónde se viene y hacia dónde se mira.

   Todo puro: MeshView lo aplica fotograma a fotograma sobre la cámara de vtk.js.
   - El foco va en línea recta.
   - La dirección de vista gira por el arco corto (slerp): una recta entre dos
     posiciones de cámara atravesaría el árbol vascular.
   - La distancia, la escala paralela y el zoom cambian en proporción
     (interpolación logarítmica): de 300 a 30 mm se acerca a ritmo constante,
     sin quedarse lejos casi todo el vuelo y caer encima al final. */
import type { CameraState } from "./MeshView";
import type { Vec3 } from "./geometry";

export const VUELO_MIN_MS = 300;
export const VUELO_MAX_MS = 550;

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);
const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
const unit = (a: Vec3): Vec3 | null => { const l = len(a); return l > 1e-12 ? scale(a, 1 / l) : null; };
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerpLog = (a: number, b: number, t: number) => (a > 0 && b > 0 ? Math.exp(lerp(Math.log(a), Math.log(b), t)) : lerp(a, b, t));
const angle = (u: Vec3, w: Vec3) => Math.acos(Math.max(-1, Math.min(1, dot(u, w))));

/** Quita a `v` su componente sobre el vector unitario `n`. */
const perpendicular = (v: Vec3, n: Vec3): Vec3 => sub(v, scale(n, dot(v, n)));

/** Giro de Rodrigues de `v` alrededor del eje unitario `k`. */
function rotate(v: Vec3, k: Vec3, a: number): Vec3 {
  const c = Math.cos(a), s = Math.sin(a), kv = cross(k, v), d = dot(k, v) * (1 - c);
  return [v[0] * c + kv[0] * s + k[0] * d, v[1] * c + kv[1] * s + k[1] * d, v[2] * c + kv[2] * s + k[2] * d];
}

/** Arco corto entre dos unitarios. Si son opuestos el arco no está definido y
 *  se gira alrededor de `eje` (la media vuelta va por donde el usuario espera). */
function slerp(u: Vec3, w: Vec3, t: number, eje: Vec3): Vec3 {
  const a = angle(u, w);
  if (a < 1e-9) return u;
  const k = unit(cross(u, w)) ?? unit(perpendicular(eje, u)) ?? unit(perpendicular([1, 0, 0], u)) ?? [0, 1, 0];
  return rotate(u, k, a * t);
}

const viewDir = (s: CameraState): Vec3 => unit(sub(s.position, s.focalPoint)) ?? [0, 0, 1];
const dist = (s: CameraState) => len(sub(s.position, s.focalPoint));

/** La cámara en el instante `t` (0–1, ya con la curva aplicada) del vuelo de A a B. */
export function interpolateCamera(a: CameraState, b: CameraState, t: number): CameraState {
  if (t <= 0) return a;
  if (t >= 1) return b;
  const da = viewDir(a), db = viewDir(b);
  const dir = slerp(da, db, t, a.viewUp);
  const focalPoint: Vec3 = [lerp(a.focalPoint[0], b.focalPoint[0], t), lerp(a.focalPoint[1], b.focalPoint[1], t), lerp(a.focalPoint[2], b.focalPoint[2], t)];
  const d = lerpLog(dist(a), dist(b), t);
  const position: Vec3 = [focalPoint[0] + dir[0] * d, focalPoint[1] + dir[1] * d, focalPoint[2] + dir[2] * d];
  // El «arriba» gira por su cuenta (alrededor de la vista si se invierte) y se
  // vuelve a hacer perpendicular a la dirección: vtk.js lo exige ortogonal.
  const ua = unit(a.viewUp) ?? [0, 1, 0], ub = unit(b.viewUp) ?? [0, 1, 0];
  const up = unit(perpendicular(slerp(ua, ub, t, dir), dir)) ?? unit(perpendicular(ua, dir)) ?? [0, 1, 0];
  return {
    position, focalPoint, viewUp: up,
    viewAngle: lerp(a.viewAngle, b.viewAngle, t),
    parallelScale: lerpLog(a.parallelScale, b.parallelScale, t),
  };
}

/** Cuánto dura el vuelo: lo que gira, lo que se desplaza el foco respecto a la
 *  distancia y lo que se acerca. Sin cambio apreciable, 0 (no se vuela). */
export function flightDurationMs(a: CameraState, b: CameraState): number {
  const giro = angle(viewDir(a), viewDir(b)) / Math.PI;
  const rollo = angle(unit(a.viewUp) ?? [0, 1, 0], unit(b.viewUp) ?? [0, 1, 0]) / Math.PI;
  const cercania = Math.max(1e-6, Math.min(dist(a), dist(b)));
  const desplazamiento = Math.min(1, len(sub(a.focalPoint, b.focalPoint)) / cercania);
  const da = dist(a), db = dist(b);
  const zoomDist = da > 0 && db > 0 ? Math.abs(Math.log(db / da)) / Math.LN10 : 0;
  const pa = a.parallelScale, pb = b.parallelScale;
  const zoomEscala = pa > 0 && pb > 0 ? Math.abs(Math.log(pb / pa)) / Math.LN10 : 0;
  const esfuerzo = Math.min(1, Math.max(giro, rollo, desplazamiento, zoomDist, zoomEscala));
  if (esfuerzo < 0.01) return 0;
  return Math.round(VUELO_MIN_MS + (VUELO_MAX_MS - VUELO_MIN_MS) * esfuerzo);
}
