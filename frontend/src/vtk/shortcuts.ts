/* La tabla única de atajos de teclado. De aquí salen la hoja «Atajos» (lo que
   se enseña) y `matchShortcut` (lo que se atiende): si una tecla cambia, cambia
   en los dos sitios a la vez y la ayuda no puede mentir.

   Quién ejecuta cada cosa:
   - Workspace (manejador global): Esc, «?», P (el panel del paso), los dígitos de paso, y reenvía al
     visor S, L, H, C, espacio y +/− por el evento `viewer:shortcut`.
   - Alt+1…4 siguen en su único camino, `presetForKey` (layoutShortcuts): aquí
     solo se listan; si Workspace también los atendiera, se dispararían dos veces.
   - Flechas, Re Pág/Av Pág, Inicio/Fin las atiende cada celda en su onKeyDown
     (necesitan saber qué celda tiene el foco); aquí se listan para la hoja.
   - Los gestos del ratón («raton») solo se enseñan: los atiende cada vista
     con sus propios oyentes y `matchShortcut` nunca los devuelve. Solo están
     los que existen en el código (F1-120); quien añada o quite uno, que lo
     cambie aquí y en el README (shortcuts.test lo compara). */
import { isTextEntryTarget } from "./layoutShortcuts";
import { PAGE_STEP } from "./cine";
import { isConfirmDialogOpen } from "../components/ConfirmDialog";

export type ShortcutScope = "visor" | "celda" | "flujo" | "raton";
export interface Shortcut { id: string; keys: string; action: string; scope: ShortcutScope }

/** Teclas apartadas para más adelante; la prueba de la tabla vigila que no se
 *  asignen. H (nivel del HUD) y P (panel del paso) ya tienen dueño. */
export const RESERVED_KEYS: string[] = [];

const STEP_COUNT = 8;

export const SHORTCUTS: Shortcut[] = [
  { id: "help", keys: "?", action: "Abrir o cerrar esta hoja de atajos", scope: "visor" },
  { id: "preset-sola", keys: "Alt+1", action: "Distribución SOLA", scope: "visor" },
  { id: "preset-derecha", keys: "Alt+2", action: "Distribución DERECHA", scope: "visor" },
  { id: "preset-abajo", keys: "Alt+3", action: "Distribución ABAJO", scope: "visor" },
  { id: "preset-cuatro", keys: "Alt+4", action: "Distribución CUATRO", scope: "visor" },
  { id: "sync", keys: "S", action: "Encender o apagar VINCULAR", scope: "visor" },
  { id: "center-lesion", keys: "L", action: "Centrar en la lesión (3D y cortes)", scope: "visor" },
  { id: "hud-cycle", keys: "H", action: "Nivel de textos: completo · esencial · limpio", scope: "visor" },
  { id: "anot-regla", keys: "R", action: "Regla: dos puntos", scope: "visor" },
  { id: "anot-angulo", keys: "A", action: "Ángulo: tres puntos", scope: "visor" },
  { id: "anot-region", keys: "G", action: "Región: contorno en un corte", scope: "visor" },
  { id: "anot-marcador", keys: "T", action: "Marcador con nota", scope: "visor" },
  { id: "anot-borrar", keys: "Supr", action: "Borrar la anotación seleccionada", scope: "visor" },
  { id: "anot-deshacer-punto", keys: "Retroceso", action: "Quitar el último punto de la anotación en curso", scope: "visor" },
  { id: "center", keys: "C", action: "Encuadrar la celda enfocada", scope: "celda" },
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
  { id: "panel-toggle", keys: "P", action: "Ocultar o mostrar el panel del paso", scope: "flujo" },
  // Un id por paso (Workspace necesita saber cuál), pero la hoja los junta en
  // una fila «1 … 8».
  ...Array.from({ length: STEP_COUNT }, (_, i): Shortcut => ({
    id: `step-${i + 1}`, keys: String(i + 1), action: `Ir al paso ${i + 1}`, scope: "flujo",
  })),
  // Dónde vive cada gesto: SliceView (rueda, Ctrl+rueda, arrastre con el botón
  // izquierdo o central y Mayús, doble clic en la lectura W/L); ViewerGrid
  // (doble clic en una celda, asa de arriba de la celda, divisor y su doble clic).
  { id: "raton-rueda", keys: "Rueda", action: "Corte siguiente o anterior", scope: "raton" },
  { id: "raton-zoom", keys: "Ctrl+rueda", action: "Acercar o alejar el corte", scope: "raton" },
  { id: "raton-wl", keys: "Arrastrar", action: "Ventana y nivel del corte", scope: "raton" },
  { id: "raton-pan", keys: "Mayús+arrastrar o botón central", action: "Desplazar el corte", scope: "raton" },
  { id: "raton-wl-reset", keys: "Doble clic en W/L", action: "Volver a la ventana del estudio", scope: "raton" },
  { id: "raton-principal", keys: "Doble clic", action: "Hacer principal una vista pequeña", scope: "raton" },
  { id: "raton-celda", keys: "Arrastrar la celda", action: "Intercambiar dos vistas (desde el borde de arriba de la celda)", scope: "raton" },
  { id: "raton-divisor", keys: "Arrastrar el divisor", action: "Repartir el sitio entre la principal y las demás", scope: "raton" },
  { id: "raton-divisor-reset", keys: "Doble clic en el divisor", action: "Volver al reparto por defecto", scope: "raton" },
];

const PRESET_BY_CODE: Record<string, string> = {
  Digit1: "preset-sola", Digit2: "preset-derecha", Digit3: "preset-abajo", Digit4: "preset-cuatro",
};
const CELL_KEYS: Record<string, string> = {
  ArrowUp: "slice-up", ArrowRight: "slice-up", ArrowDown: "slice-down", ArrowLeft: "slice-down",
  PageUp: "page-up", PageDown: "page-down", Home: "home", End: "end",
};

/** El id del atajo que pide una tecla, o null. Nunca con el foco donde se
 *  escribe: teclear «s» en un campo no puede apagar VINCULAR.
 *  Letras, dígitos y espacio por `code` (la tecla física: en AZERTY la fila de
 *  números no da dígitos sin mayúsculas); «?», «+» y «−» por `key`, porque su
 *  tecla física cambia con la distribución (en un teclado español «?» es
 *  Mayús+' y «+» tiene tecla propia). */
export function matchShortcut(
  e: { key: string; code: string; altKey: boolean; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean },
  target: EventTarget | null,
): string | null {
  if (isTextEntryTarget(target)) return null;
  // Con un diálogo de confirmación delante, lo de detrás no atiende teclas: un
  // segundo Supr apilaba otra pregunta de borrar, y P o los dígitos cambiaban
  // la pantalla tapada. Escape e Intro ya se los queda el diálogo.
  if (isConfirmDialogOpen()) return null;
  // Ctrl/Cmd son del navegador y del sistema (copiar, guardar, recargar).
  if (e.ctrlKey || e.metaKey) return null;
  if (e.key === "Escape") return "escape";
  if (e.altKey) return PRESET_BY_CODE[e.code] ?? null;
  if (e.key === "?") return "help";
  if (e.key === "+" || e.code === "NumpadAdd") return "cine-faster";
  if (e.key === "-" || e.key === "−" || e.code === "NumpadSubtract") return "cine-slower";
  if (e.code === "Space") {
    // Sobre un botón o un enlace el espacio es pulsarlo: los del HUD (la propia
    // barra del cine, VINCULAR…) se siguen manejando con el teclado.
    const tag = (target as HTMLElement | null)?.tagName;
    return tag === "BUTTON" || tag === "A" ? null : "cine-toggle";
  }
  if (e.code === "KeyS") return "sync";
  if (e.code === "KeyL") return "center-lesion";
  if (e.code === "KeyH") return "hud-cycle";
  if (e.code === "KeyC") return "center";
  if (e.code === "KeyP") return "panel-toggle";
  // Anotaciones: R/A/G/T arman la herramienta; Supr borra la seleccionada y
  // Retroceso quita el último punto. Si hay algo que hacer lo decide el visor.
  if (e.code === "KeyR") return "anot-regla";
  if (e.code === "KeyA") return "anot-angulo";
  if (e.code === "KeyG") return "anot-region";
  if (e.code === "KeyT") return "anot-marcador";
  if (e.key === "Delete") return "anot-borrar";
  if (e.key === "Backspace") return "anot-deshacer-punto";
  // En el teclado numérico la tecla física no basta: con Bloq Num apagado,
  // Numpad8 manda ArrowUp y Numpad1 End. Sin mirar `key`, la misma pulsación
  // movería el corte en la celda y saltaría de paso a la vez.
  const digit = /^(?:Digit|Numpad)([1-9])$/.exec(e.code);
  if (digit && !e.shiftKey && (e.code.startsWith("Digit") || /^[1-9]$/.test(e.key))) {
    const n = Number(digit[1]);
    return n <= STEP_COUNT ? `step-${n}` : null;
  }
  return CELL_KEYS[e.key] ?? null;
}

export function shortcutsByScope(): Record<ShortcutScope, Shortcut[]> {
  const out: Record<ShortcutScope, Shortcut[]> = { visor: [], celda: [], flujo: [], raton: [] };
  for (const s of SHORTCUTS) out[s.scope].push(s);
  return out;
}
