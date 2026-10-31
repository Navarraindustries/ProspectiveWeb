/* Estado de la barra lateral (shell C, F2): fijada a 240 px por defecto en
   ventanas anchas (>= 1024 px) y plegada a 64 px en las estrechas; plegada se
   expande al pasar el ratón, con Alt+B o dejándola fija con la chincheta.

   Solo lo fijo se recuerda (`localStorage`, clave `shell.sidebar`): el paso del
   ratón y Alt+B son del momento. Alt+B se escucha en `document` y no mueve el
   foco: quien está escribiendo en un campo sigue en él, y la tecla no llega al
   campo porque se cancela el evento. En el espacio de trabajo (sin barra en F2)
   se deja pasar para no quitarle el atajo al navegador. */

import { useCallback, useEffect, useRef, useState } from "react";
import { SCREEN_PATH } from "../../store/nav";

export const SIDEBAR_KEY = "shell.sidebar";
/** Lo que tarda el ratón parado encima en expandirla: evita que un cruce
    rápido hacia el contenido la abra y la cierre. */
export const HOVER_DELAY_MS = 150;

export interface ShellState {
  /** Expandida por cualquier motivo: fija, ratón encima o Alt+B. */
  expanded: boolean;
  pinned: boolean;
  setPinned: (pinned: boolean) => void;
  hoverIn: () => void;
  hoverOut: () => void;
}

/* Sin valor guardado manda el ancho de la ventana; lo que el usuario eligió
   («pinned» o «collapsed») manda siempre. localStorage puede no existir o estar
   vetado (modo privado, iframe): entonces también decide el ancho. */
const WIDE_WINDOW_PX = 1024;
/** A 1280 px o menos la barra arranca plegada aunque la preferencia diga
    «fijada»: el contenido necesita el sitio. No se toca lo guardado. */
const NARROW_QUERY = "(max-width: 1280px)";
function isNarrow(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia(NARROW_QUERY)?.matches === true;
}
function readPinned(): boolean {
  if (isNarrow()) return false;
  const wide = typeof window !== "undefined" && window.innerWidth >= WIDE_WINDOW_PX;
  try {
    const saved = localStorage.getItem(SIDEBAR_KEY);
    if (saved === "pinned") return true;
    if (saved === "collapsed") return false;
    return wide;
  } catch {
    return wide;
  }
}

function writePinned(pinned: boolean): void {
  try {
    localStorage.setItem(SIDEBAR_KEY, pinned ? "pinned" : "collapsed");
  } catch {
    /* sin memoria entre sesiones, pero funciona */
  }
}

export function useShellState(): ShellState {
  const [pinned, setPinnedState] = useState(readPinned);
  const [hovered, setHovered] = useState(false);
  // Abierta con Alt+B; se cierra con Alt+B otra vez o al salir el ratón.
  const [opened, setOpened] = useState(false);
  const timer = useRef<number | null>(null);

  const cancelTimer = useCallback(() => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const hoverIn = useCallback(() => {
    cancelTimer();
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setHovered(true);
    }, HOVER_DELAY_MS);
  }, [cancelTimer]);

  const hoverOut = useCallback(() => {
    cancelTimer();
    setHovered(false);
    setOpened(false);
  }, [cancelTimer]);

  const setPinned = useCallback((next: boolean) => {
    setPinnedState(next);
    writePinned(next);
    if (!next) setOpened(false);
  }, []);

  useEffect(() => cancelTimer, [cancelTimer]);

  const expanded = pinned || hovered || opened;

  // El oyente se suscribe una vez y lee el estado por ref: así no se
  // vuelve a colgar de `document` en cada render.
  const current = useRef({ expanded, pinned, setPinned });
  current.current = { expanded, pinned, setPinned };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Antes que nada Alt, y `key` solo si es texto: el autocompletado de
      // Chrome lanza keydown sin `key` y `toLowerCase` de undefined rompía el oyente.
      if (!e.altKey || e.ctrlKey || e.metaKey) return;
      // `code` para teclados en los que Alt cambia la letra (Option en Mac).
      const isB = e.code === "KeyB" || (typeof e.key === "string" && e.key.toLowerCase() === "b");
      if (!isB) return;
      if (window.location.pathname === SCREEN_PATH.workspace) return;
      e.preventDefault();
      const s = current.current;
      if (s.expanded) {
        // Plegar una barra fija es soltarla: si no, Alt+B no haría nada.
        if (s.pinned) s.setPinned(false);
        setHovered(false);
        setOpened(false);
      } else {
        setOpened(true);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return { expanded, pinned, setPinned, hoverIn, hoverOut };
}
