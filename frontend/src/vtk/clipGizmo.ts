// frontend/src/vtk/clipGizmo.ts
/* El manipulador del clip en el 3D, sin WebGL: qué asas dibujar y qué pose
   sale de cada gesto. Tres asas, una por grado de libertad que el cirujano
   ajusta a mano: la esfera verde desplaza (en el plano del cuello, o por la
   normal con Shift), el anillo ámbar gira el clip sobre su normal y la esfera
   lavanda en la punta del brazo lo inclina (acotado a 60°, como el servidor).
   Todo lo que necesita del gesto se congela al empezar (DragStart): si la
   normal o el eje se recalcularan a mitad del arrastre, el punto de agarre se
   iría moviendo bajo el ratón. */
import type { PlacedClip } from "../store/planning";
import type { Handle } from "./MeshView";
import type { Vec3 } from "./geometry";
import { angleAround, screenToAxis, screenToPlane, screenToSphere, type CameraLike, type Viewport } from "./dragController";
import { clampTilt, neckFrameAngles } from "./clipPose";
import { HUD_HEX, hexToRgb01, planeRgb01 } from "./planeColors";

export const RING_MM = 3, TILT_ARM_MM = 6, HANDLE_MM = 0.9;
/** Con Shift, a lo largo de la normal: con la vista casi paralela a la normal
 *  el rayo y el eje se cortan muy lejos y un píxel serían metros. */
const AXIS_MAX_MM = 50;
const ROLL_HEX = "#ffc857";

export type ClipHandleId = "clip:move" | "clip:roll" | "clip:tilt";

const add = (a: Vec3, b: Vec3, k = 1): Vec3 => [a[0] + k * b[0], a[1] + k * b[1], a[2] + k * b[2]];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const norm = (v: Vec3): Vec3 | null => {
  const l = Math.hypot(v[0], v[1], v[2]);
  return l > 1e-9 ? [v[0] / l, v[1] / l, v[2] / l] : null;
};
/** Ángulo a (−180, 180], la convención de rotation_deg. */
const wrapDeg = (d: number) => { const w = ((d + 180) % 360 + 360) % 360 - 180; return w === -180 ? 180 : w; };
/** Diferencia de ángulos a (−π, π]: cruzar ±π no es una vuelta entera. */
const wrapRad = (r: number) => { const w = r - 2 * Math.PI * Math.ceil((r - Math.PI) / (2 * Math.PI)); return w; };

export function clipHandles(clip: PlacedClip, normal: Vec3): Handle[] {
  const p = clip.position;
  return [
    { id: "clip:move", kind: "sphere", pos: p, radiusMm: HANDLE_MM, color: hexToRgb01(HUD_HEX) },
    { id: "clip:roll", kind: "ring", pos: p, normal, radiusMm: RING_MM, color: hexToRgb01(ROLL_HEX) },
    { id: "clip:tilt", kind: "sphere", pos: add(p, normal, TILT_ARM_MM), radiusMm: HANDLE_MM, color: planeRgb01("libre"), lineTo: p },
  ];
}

export interface DragStart { clip: PlacedClip; normal: Vec3; axis: Vec3 | null; p0: Vec3 | null; t0: number | null; a0: number | null }

export function beginDrag(
  id: string, clip: PlacedClip, normal: Vec3, axis: Vec3 | null,
  cam: CameraLike, vp: Viewport, px: number, py: number, shift: boolean,
): DragStart {
  const s: DragStart = { clip, normal, axis, p0: null, t0: null, a0: null };
  if (id === "clip:move") {
    // Solo uno de los dos: el modo (plano o normal) queda fijado al empezar.
    if (shift) s.t0 = screenToAxis(cam, vp, px, py, { origin: clip.position, dir: normal });
    else s.p0 = screenToPlane(cam, vp, px, py, { origin: clip.position, normal });
  } else if (id === "clip:roll") {
    s.a0 = angleAround(cam, vp, px, py, clip.position, normal);
  }
  return s;
}

/** La pose nueva, o null si el rayo no toca lo que el asa necesita (se conserva la pose). */
export function dragPose(
  id: string, start: DragStart, cam: CameraLike, vp: Viewport, px: number, py: number, shift: boolean,
): PlacedClip | null {
  void shift;   // el modo se decidió en beginDrag
  const { clip, normal } = start;
  if (id === "clip:move") {
    if (start.p0) {
      const p = screenToPlane(cam, vp, px, py, { origin: clip.position, normal });
      return p ? { ...clip, position: add(clip.position, sub(p, start.p0)) } : null;
    }
    if (start.t0 !== null) {
      const t = screenToAxis(cam, vp, px, py, { origin: clip.position, dir: normal });
      if (t === null) return null;
      const d = Math.max(-AXIS_MAX_MM, Math.min(AXIS_MAX_MM, t - start.t0));
      return { ...clip, position: add(clip.position, normal, d) };
    }
    return null;
  }
  if (id === "clip:roll") {
    if (start.a0 === null) return null;
    const a = angleAround(cam, vp, px, py, clip.position, normal);
    if (a === null) return null;
    return { ...clip, rotation_deg: wrapDeg(clip.rotation_deg + (wrapRad(a - start.a0) * 180) / Math.PI) };
  }
  if (id === "clip:tilt") {
    const p = screenToSphere(cam, vp, px, py, { center: clip.position, r: TILT_ARM_MM });
    if (!p) return null;
    const n = norm(sub(p, clip.position));
    if (!n) return null;
    const { azimuthDeg, elevationDeg } = clampTilt(neckFrameAngles(start.axis, n));
    return { ...clip, azimuthDeg, elevationDeg };
  }
  return null;
}

const mm = (v: number) => v.toFixed(1).replace(".", ",");
const deg = (v: number) => `${Math.round(v) || 0}°`;   // «|| 0»: sin «-0°»

export function gizmoReadout(clip: PlacedClip): string {
  return `CLIP ${clip.name} · ${clip.position.map(mm).join(" ")} mm · ROT ${deg(clip.rotation_deg)} · AZ ${deg(clip.azimuthDeg)} · EL ${deg(clip.elevationDeg)}`;
}
