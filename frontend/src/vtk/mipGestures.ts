/* Los gestos del MIP, decididos sin vtk: la rueda mueve el corte compartido
   (el MIP se ve construirse desde él mismo) y Ctrl+rueda hace zoom. Igual que
   SliceView, para que el profesional no cambie de gesto al cambiar de vista. */
import type { Plane } from "./geometry";

export const AXIS_OF: Record<Plane, 0 | 1 | 2> = { sagital: 0, coronal: 1, axial: 2 };   // eje vtk (x,y,z)
/** `factor` > 1 acerca (amplía), < 1 aleja. */
export type WheelAction = { kind: "slice"; next: number } | { kind: "zoom"; factor: number } | { kind: "none" };

/** Ampliación por paso de rueda: la misma que SliceView. */
export const ZOOM_STEP = 1.1;

export function wheelAction(e: { deltaY: number; ctrlKey: boolean }, index: number, count: number): WheelAction {
  // Rueda hacia arriba (deltaY < 0) acerca, como en los cortes. El zoom de vtk
  // (onScroll del manipulador) va al revés y en 36.2.1 no atiende a
  // flipDirection, por eso el zoom se decide aquí y no en vtk.
  if (e.ctrlKey) return e.deltaY === 0 ? { kind: "none" } : { kind: "zoom", factor: e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP };
  if (e.deltaY === 0) return { kind: "none" };
  const next = Math.max(0, Math.min(count - 1, index + (e.deltaY > 0 ? 1 : -1)));
  return { kind: "slice", next };
}
export function indexOf(plane: Plane, v: { x: number; y: number; z: number }): number {
  return plane === "axial" ? v.z : plane === "coronal" ? v.y : v.x;
}
export function withIndex(plane: Plane, v: { x: number; y: number; z: number }, i: number): { x: number; y: number; z: number } {
  return plane === "axial" ? { ...v, z: i } : plane === "coronal" ? { ...v, y: i } : { ...v, x: i };
}
