/* Guardar la ventana y el nivel de los cortes con la sesión (F1-248).

   Vivían solo en el store del navegador: reanudar volvía siempre a la ventana
   por defecto del DICOM. Arrastrar W/L cambia la ventana decenas de veces por
   segundo; con un rebote de 500 ms el servidor recibe una petición por
   arrastre, con el valor en el que se soltó. */

import { useEffect, useRef } from "react";

export type WindowLevel = { wc: number; ww: number };

/** El rebote, aparte de React para poder probarlo con relojes falsos. */
export function createWindowSaver(
  send: (sessionId: string, w: WindowLevel) => Promise<unknown>,
  delayMs = 500,
) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let last: string | null = null;
  const cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };
  const push = (sessionId: string, w: WindowLevel) => {
    cancel();
    timer = setTimeout(() => {
      timer = null;
      const key = `${sessionId}:${w.wc}:${w.ww}`;
      if (key === last) return;
      last = key;
      // Si no llega, se olvida que se mandó: la próxima vez se intenta otra.
      send(sessionId, w).catch(() => { if (last === key) last = null; });
    }, delayMs);
  };
  return { push, cancel };
}

/** Manda la ventana vigente al servidor cuando deja de cambiar. `wl` null es
 *  «la del DICOM» (doble clic para restablecer): se manda esa, o reanudar
 *  devolvería la última que se tocó. */
export function usePersistWindow(
  sessionId: string | null,
  wl: WindowLevel | null,
  dicom: WindowLevel | null,
  send: (sessionId: string, w: WindowLevel) => Promise<unknown>,
) {
  const saver = useRef<ReturnType<typeof createWindowSaver> | null>(null);
  if (!saver.current) saver.current = createWindowSaver(send);
  const w = wl ?? dicom;
  useEffect(() => {
    if (!sessionId || !w || !(w.ww > 0)) return;
    saver.current!.push(sessionId, w);
  }, [sessionId, w?.wc, w?.ww]);   // eslint-disable-line react-hooks/exhaustive-deps
  // Lo pendiente de una sesión no se manda a la siguiente.
  useEffect(() => () => saver.current?.cancel(), [sessionId]);
}
