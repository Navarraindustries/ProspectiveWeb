/** Recorrido de cortes: reloj del reproductor y teclas de paso. Todo puro, para
 *  que el reloj (tarea siguiente) y las celdas compartan las mismas reglas. */
import type { PaneId } from "./layout";

export const CINE_FPS_DEFAULT = 8, CINE_FPS_MIN = 1, CINE_FPS_MAX = 30, PAGE_STEP = 10;

/** Los fotogramas por segundo se acotan; un valor no numérico vuelve al defecto
 *  para que un campo vacío no pare ni dispare el reloj. */
export function clampFps(fps: number): number {
  if (!Number.isFinite(fps)) return CINE_FPS_DEFAULT;
  return Math.min(CINE_FPS_MAX, Math.max(CINE_FPS_MIN, fps));
}

/** Siguiente corte del reproductor. Con rebote da la vuelta en los extremos en
 *  vez de saltar al otro lado; con un solo corte no hay adónde ir. */
export function nextIndex(i: number, dir: 1 | -1, count: number, bounce: boolean): { index: number; dir: 1 | -1 } {
  if (count <= 1) return { index: 0, dir };
  const n = i + dir;
  if (n >= 0 && n < count) return { index: n, dir };
  if (bounce) { const d = (dir === 1 ? -1 : 1) as 1 | -1; return { index: i + d, dir: d }; }
  return { index: dir === 1 ? 0 : count - 1, dir };
}

/** ¿Debe pararse el cine? Un cine que siguiera solo movería cortes que ya nadie
 *  mira: se para si otra celda toma el foco o si la distribución oculta la
 *  celda que reproduce (Alt+1, o «▸ VOL» que la manda al hueco sin sitio de
 *  CUATRO). Sin celda enfocada no hay «otra»: el espacio arranca el cine en la
 *  principal antes de que nadie pinche, y eso no es motivo para pararlo. */
export function cineShouldStop(
  cine: { pane: PaneId } | null,
  { focusedPane, visible }: { focusedPane: PaneId | null; visible: Partial<Record<PaneId, boolean>> },
): boolean {
  if (!cine) return false;
  if (focusedPane !== null && focusedPane !== cine.pane) return true;
  return !visible[cine.pane];
}

/** Paso que pide una tecla; ±Infinity son los extremos (Inicio/Fin). */
export function stepFromKey(key: string): number | null {
  switch (key) {
    case "ArrowUp": case "ArrowRight": return 1;
    case "ArrowDown": case "ArrowLeft": return -1;
    case "PageUp": return PAGE_STEP;
    case "PageDown": return -PAGE_STEP;
    case "Home": return -Infinity;
    case "End": return Infinity;
    default: return null;
  }
}

/** Aplica un paso y acota al rango; ±Infinity caen en los extremos. */
export function applyStep(i: number, step: number, count: number): number {
  return Math.max(0, Math.min(count - 1, i + step));
}

/** Un control con teclado propio (deslizador, selector, botón, texto) dentro de
 *  la celda se queda con sus flechas: si la celda también las atendiera, el
 *  deslizador dejaría de moverse y se movería el corte. */
export function isNativeKeyTarget(t: EventTarget | null): boolean {
  return t instanceof HTMLInputElement || t instanceof HTMLSelectElement
    || t instanceof HTMLTextAreaElement || t instanceof HTMLButtonElement;
}
