/* La tabla única de atajos de teclado. De aquí salen la hoja «Atajos» (lo que
   se enseña) y `matchShortcut` (lo que se atiende): si una tecla cambia, cambia
   en los dos sitios a la vez y la ayuda no puede mentir.

   Quién ejecuta cada cosa:
   - Workspace (manejador global): Esc, «?», los dígitos de paso, y reenvía al
     visor S, C, espacio y +/− por el evento `viewer:shortcut`.
   - Alt+1…4 siguen en su único camino, `presetForKey` (layoutShortcuts): aquí
     solo se listan; si Workspace también los atendiera, se dispararían dos veces.
   - Flechas, Re Pág/Av Pág, Inicio/Fin las atiende cada celda en su onKeyDown
     (necesitan saber qué celda tiene el foco); aquí se listan para la hoja. */
import { isTextEntryTarget } from "./layoutShortcuts";
import { PAGE_STEP } from "./cine";

export type ShortcutScope = "visor" | "celda" | "flujo";
export interface Shortcut { id: string; keys: string; action: string; scope: ShortcutScope }

/** H y P no se asignan: se dejan libres a propósito (spec E1) para lo que
 *  venga después, y la prueba de la tabla lo vigila. */
export const RESERVED_KEYS = ["H", "P"];

const STEP_COUNT = 8;

export const SHORTCUTS: Shortcut[] = [
  { id: "help", keys: "?", action: "Abrir o cerrar esta hoja de atajos", scope: "visor" },
  { id: "preset-sola", keys: "Alt+1", action: "Distribución SOLA", scope: "visor" },
  { id: "preset-derecha", keys: "Alt+2", action: "Distribución DERECHA", scope: "visor" },
  { id: "preset-abajo", keys: "Alt+3", action: "Distribución ABAJO", scope: "visor" },
  { id: "preset-cuatro", keys: "Alt+4", action: "Distribución CUATRO", scope: "visor" },
  { id: "sync", keys: "S", action: "Encender o apagar SINCRO", scope: "visor" },
  { id: "center", keys: "C", action: "Volver a encuadrar la celda enfocada", scope: "celda" },
  { id: "cine-toggle", keys: "Espacio", action: "Reproducir o parar el cine de la celda", scope: "celda" },
  { id: "cine-faster", keys: "+", action: "Cine un fotograma por segundo más rápido", scope: "celda" },
  { id: "cine-slower", keys: "−", action: "Cine un fotograma por segundo más lento", scope: "celda" },
  { id: "slice-up", keys: "↑ / →", action: "Corte siguiente", scope: "celda" },
  { id: "slice-down", keys: "↓ / ←", action: "Corte anterior", scope: "celda" },
  { id: "page-up", keys: "Re Pág", action: `${PAGE_STEP} cortes adelante`, scope: "celda" },
  { id: "page-down", keys: "Av Pág", action: `${PAGE_STEP} cortes atrás`, scope: "celda" },
  { id: "home", keys: "Inicio", action: "Primer corte", scope: "celda" },
  { id: "end", keys: "Fin", action: "Último corte", scope: "celda" },
  { id: "escape", keys: "Esc", action: "Cancelar el marcado, parar el cine o cerrar esta hoja", scope: "flujo" },
  // Un id por paso (Workspace necesita saber cuál), pero la hoja los junta en
  // una fila «1 … 8».
  ...Array.from({ length: STEP_COUNT }, (_, i): Shortcut => ({
    id: `step-${i + 1}`, keys: String(i + 1), action: `Ir al paso ${i + 1}`, scope: "flujo",
  })),
];

const PRESET_BY_CODE: Record<string, string> = {
  Digit1: "preset-sola", Digit2: "preset-derecha", Digit3: "preset-abajo", Digit4: "preset-cuatro",
};
const CELL_KEYS: Record<string, string> = {
  ArrowUp: "slice-up", ArrowRight: "slice-up", ArrowDown: "slice-down", ArrowLeft: "slice-down",
  PageUp: "page-up", PageDown: "page-down", Home: "home", End: "end",
};

/** El id del atajo que pide una tecla, o null. Nunca con el foco donde se
 *  escribe: teclear «s» en un campo no puede apagar SINCRO.
 *  Letras, dígitos y espacio por `code` (la tecla física: en AZERTY la fila de
 *  números no da dígitos sin mayúsculas); «?», «+» y «−» por `key`, porque su
 *  tecla física cambia con la distribución (en un teclado español «?» es
 *  Mayús+' y «+» tiene tecla propia). */
export function matchShortcut(
  e: { key: string; code: string; altKey: boolean; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean },
  target: EventTarget | null,
): string | null {
  if (isTextEntryTarget(target)) return null;
  // Ctrl/Cmd son del navegador y del sistema (copiar, guardar, recargar).
  if (e.ctrlKey || e.metaKey) return null;
  if (e.key === "Escape") return "escape";
  if (e.altKey) return PRESET_BY_CODE[e.code] ?? null;
  if (e.key === "?") return "help";
  if (e.key === "+" || e.code === "NumpadAdd") return "cine-faster";
  if (e.key === "-" || e.key === "−" || e.code === "NumpadSubtract") return "cine-slower";
  if (e.code === "Space") {
    // Sobre un botón o un enlace el espacio es pulsarlo: los del HUD (la propia
    // barra del cine, SINCRO…) se siguen manejando con el teclado.
    const tag = (target as HTMLElement | null)?.tagName;
    return tag === "BUTTON" || tag === "A" ? null : "cine-toggle";
  }
  if (e.code === "KeyS") return "sync";
  if (e.code === "KeyC") return "center";
  const digit = /^(?:Digit|Numpad)([1-9])$/.exec(e.code);
  if (digit && !e.shiftKey) {
    const n = Number(digit[1]);
    return n <= STEP_COUNT ? `step-${n}` : null;
  }
  return CELL_KEYS[e.key] ?? null;
}

export function shortcutsByScope(): Record<ShortcutScope, Shortcut[]> {
  const out: Record<ShortcutScope, Shortcut[]> = { visor: [], celda: [], flujo: [] };
  for (const s of SHORTCUTS) out[s.scope].push(s);
  return out;
}
