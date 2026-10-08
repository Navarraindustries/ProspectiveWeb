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

/** Cuánta información dibuja el HUD: todo, lo esencial o la imagen sola. */
export type HudLevel = "completo" | "esencial" | "limpio";
export const HUD_LEVELS: HudLevel[] = ["completo", "esencial", "limpio"];
export const PREF_HUD_LEVEL = "viewer.hudLevel";

/* Antes había un solo interruptor (REGLAS ○ = decoración oculta); quien lo
   tenía puesto quería menos ruido, lo que hoy es «esencial». */
export function hudLevelFromStorage(raw: string | null, legacyDecorHidden: string | null): HudLevel {
  if (raw === null) return legacyDecorHidden === "1" ? "esencial" : "completo";
  return (HUD_LEVELS as string[]).includes(raw) ? (raw as HudLevel) : "completo";
}

/** El ciclo de la tecla H. */
export function nextHudLevel(l: HudLevel): HudLevel {
  return HUD_LEVELS[(HUD_LEVELS.indexOf(l) + 1) % HUD_LEVELS.length];
}

/** Lee el nivel; si venía de la clave vieja lo migra y la borra, para no migrar dos veces. */
export function readHudLevel(): HudLevel {
  try {
    const raw = window.localStorage.getItem(PREF_HUD_LEVEL);
    const legacy = window.localStorage.getItem(PREF_DECOR_HIDDEN);
    const nivel = hudLevelFromStorage(raw, legacy);
    if (raw === null && legacy !== null) {
      window.localStorage.setItem(PREF_HUD_LEVEL, nivel);
      window.localStorage.removeItem(PREF_DECOR_HIDDEN);
    }
    return nivel;
  } catch {
    return "completo";
  }
}

/** Una elección entre varias cadenas que recuerda su valor; lo desconocido vuelve al defecto. */
export function useStoredChoice<T extends string>(
  key: string, valid: readonly T[], porDefecto: T, read?: () => T,
): [T, (v: T) => void] {
  const [valor, setValor] = useState<T>(() => {
    if (read) return read();
    try {
      const v = window.localStorage.getItem(key);
      return v !== null && (valid as readonly string[]).includes(v) ? (v as T) : porDefecto;
    } catch {
      return porDefecto;
    }
  });
  const set = useCallback((v: T) => {
    setValor(v);
    try { window.localStorage.setItem(key, v); } catch { /* se queda en memoria */ }
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
