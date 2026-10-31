/* Transición de vista: si el navegador la ofrece, el cambio de pantalla se
   anima; si no, se ejecuta tal cual. */

export function conTransicion(fn: () => void): void {
  const d = document as Document & { startViewTransition?: (cb: () => void) => unknown };
  if (typeof d.startViewTransition === "function") d.startViewTransition(fn);
  else fn();
}
