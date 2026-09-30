/* Preferencias de vista de cada profesional: se guardan en SU navegador.

   Ocultar la franja de cortes u ocultar la decoración del HUD es una manera
   de mirar, no un dato del caso: no viaja al servidor ni a otros usuarios.
   El almacenamiento puede fallar (navegación privada, cuota); entonces se
   vuelve al valor por defecto y la vista sigue funcionando. */

import { useCallback, useState } from "react";

export const PREF_STRIP_HIDDEN = "viewer.stripHidden";
export const PREF_DECOR_HIDDEN = "viewer.hudDecorHidden";

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
