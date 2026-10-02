/* Atajos de teclado de la distribución del visor: Alt+1 sola, Alt+2 derecha,
   Alt+3 abajo, Alt+4 cuatro. Con Alt porque los dígitos solos ya saltan de paso en el flujo
   (Workspace): el mismo «2» no puede significar dos cosas. Puro para poder
   probarlo sin montar el visor. */
import type { LayoutPreset } from "./layout";

// Por `KeyboardEvent.code` (la tecla física), no por `key`: en macOS
// Option+1 escribe «¡» y el `key` ya no es «1»; en un teclado AZERTY la fila
// de números da «&» sin mayúsculas. La tecla física es la misma en todos.
const CODES: Record<string, LayoutPreset> = { Digit1: "sola", Digit2: "derecha", Digit3: "abajo", Digit4: "cuatro" };

/** Un atajo numérico nunca debe robarle la tecla a un campo donde se escribe:
 *  escribir en el umbral de segmentación no puede cambiar la distribución. */
export function presetForKey(code: string, target: EventTarget | null, altKey: boolean): LayoutPreset | null {
  if (!altKey || isTextEntryTarget(target)) return null;
  return CODES[code] ?? null;
}

/** ¿Se está escribiendo ahí? Campo, área, selector o algo editable. La usan
 *  también los atajos de una letra (shortcuts.ts): una sola regla para todos. */
export function isTextEntryTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  const tag = el?.tagName?.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  // Editable también por herencia (un nodo dentro de un contenteditable).
  return !!el?.closest?.('[contenteditable]:not([contenteditable="false"])');
}
