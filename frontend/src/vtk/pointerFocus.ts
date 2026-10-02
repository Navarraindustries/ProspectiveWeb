/* A quién va el foco al pinchar en el visor. Los lienzos de vtk.js y los
   cortes anulan la acción por defecto del puntero, y con ella el foco: el
   envoltorio con teclado de la celda (tabIndex=0, el que atiende flechas,
   Re Pág/Av Pág, Inicio/Fin) nunca lo recibía. Enfocar solo el contenedor
   del visor dejaba la barra del cine a la vista (la celda sí quedaba
   «enfocada» para el visor) pero sin teclas de corte: incoherente. Puro, para
   probarlo sin montar vtk. */
import { isNativeKeyTarget } from "./cine";

/** El elemento que hay que enfocar tras un pointerdown en `target` dentro de
 *  `host`, o null si no hay que tocar el foco. */
export function focusOnPointerDown(target: EventTarget | null, host: HTMLElement, active: Element | null): HTMLElement | null {
  const t = target instanceof Element ? target : null;
  // Un control nativo (botón del HUD, deslizador, selector) lo enfoca el
  // navegador; quitárselo haría que el espacio arrancara el cine en vez de
  // pulsar el botón.
  if (isNativeKeyTarget(t) || t?.closest("input, select, textarea, button")) return null;
  // La celda: el envoltorio enfocable más cercano dentro del visor. La raíz de
  // la rejilla (tabIndex=-1) no cuenta, ni el propio contenedor.
  const cell = t?.closest<HTMLElement>("[tabindex]:not([tabindex='-1'])") ?? null;
  if (cell && cell !== host && host.contains(cell)) {
    return cell === active || cell.contains(active) ? null : cell;
  }
  // Fuera de toda celda (una junta, un hueco): el contenedor, para que
  // Alt+1…4 lleguen al visor; si el foco ya está dentro, no se le quita.
  return host.contains(active) ? null : host;
}
