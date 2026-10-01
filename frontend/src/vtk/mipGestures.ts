/* Los gestos del MIP, decididos sin vtk: la rueda mueve el corte compartido
   (el MIP se ve construirse desde él mismo), Ctrl+rueda la deja a vtk para el
   zoom. Igual que SliceView, para que el profesional no cambie de gesto al
   cambiar de vista. */
import type { Plane } from "./geometry";

export const AXIS_OF: Record<Plane, 0 | 1 | 2> = { sagital: 0, coronal: 1, axial: 2 };   // eje vtk (x,y,z)
export type WheelAction = { kind: "slice"; next: number } | { kind: "zoom" } | { kind: "none" };

export function wheelAction(e: { deltaY: number; ctrlKey: boolean }, index: number, count: number): WheelAction {
  if (e.ctrlKey) return { kind: "zoom" };
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
