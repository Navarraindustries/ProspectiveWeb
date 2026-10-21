/* Arrastrar una vista sobre otra para intercambiarlas. Puro: el componente
   solo traduce eventos de puntero a estas llamadas. El umbral evita que un
   clic con temblor (o el doble clic que sube a principal) se tome por arrastre. */
import type { PaneId } from "./layout";

export const DRAG_THRESHOLD_PX = 6;
export interface DragState { from: PaneId; x0: number; y0: number; active: boolean; over: PaneId | null }

export function beginDrag(from: PaneId, x: number, y: number): DragState {
  return { from, x0: x, y0: y, active: false, over: null };
}

export function moveDrag(s: DragState, x: number, y: number, over: PaneId | null): DragState {
  const active = s.active || Math.hypot(x - s.x0, y - s.y0) > DRAG_THRESHOLD_PX;
  // Sobre sí misma no se marca: soltar ahí no hace nada y el resalte
  // prometería un intercambio que no ocurre.
  return { ...s, active, over: active && over !== s.from ? over : null };
}

export function cancelDrag(): null { return null; }

export function endDrag(s: DragState | null): [PaneId, PaneId] | null {
  if (!s || !s.active || !s.over || s.over === s.from) return null;
  return [s.from, s.over];
}
