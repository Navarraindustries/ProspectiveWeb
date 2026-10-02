/* Preferencias de vista de cada profesional: se guardan en SU navegador.

   Ocultar la decoración del HUD es una manera de mirar, no un dato del caso:
   no viaja al servidor ni a otros usuarios. (Ver solo la vista principal es
   ahora el preset «sola» de la distribución, en layout.ts.)
   El almacenamiento puede fallar (navegación privada, cuota); entonces se
   vuelve al valor por defecto y la vista sigue funcionando. */

import { useCallback, useState } from "react";
import { CINE_FPS_DEFAULT, clampFps } from "./cine";

export const PREF_DECOR_HIDDEN = "viewer.hudDecorHidden";
export const PREF_PLANES_HIDDEN = "viewer.planesHidden";
/** La cadencia del cine es un gusto de quien mira, como la decoración. */
export const PREF_CINE_FPS = "viewer.cineFps";

function leer(key: string, porDefecto: boolean): boolean {
  try {
    const v = window.localStorage.getItem(key);
    return v === null ? porDefecto : v === "1";
  } catch {
    return porDefecto;
  }
}

/** Un interruptor que recuerda su estado entre sesiones. */
export function useStoredFlag(key: string, porDefecto = false): [boolean, (v: boolean) => void] {
  const [valor, setValor] = useState(() => leer(key, porDefecto));
  const set = useCallback((v: boolean) => {
    setValor(v);
    try { window.localStorage.setItem(key, v ? "1" : "0"); } catch { /* se queda en memoria */ }
  }, [key]);
  return [valor, set];
}

/** Fotogramas por segundo guardados; un valor ilegible vuelve al defecto. */
export function readCineFps(): number {
  try {
    const v = window.localStorage.getItem(PREF_CINE_FPS);
    return v === null ? CINE_FPS_DEFAULT : clampFps(Number(v));
  } catch {
    return CINE_FPS_DEFAULT;
  }
}

export function writeCineFps(fps: number): void {
  try { window.localStorage.setItem(PREF_CINE_FPS, String(clampFps(fps))); } catch { /* se queda en memoria */ }
}
