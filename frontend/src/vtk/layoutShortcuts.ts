/* Atajos de teclado de la distribución del visor: 1 sola, 2 derecha, 3 abajo.
   Puro para poder probarlo sin montar el visor. */
import type { LayoutPreset } from "./layout";

const KEYS: Record<string, LayoutPreset> = { "1": "sola", "2": "derecha", "3": "abajo" };

/** Un atajo numérico nunca debe robarle la tecla a un campo donde se escribe:
 *  escribir «2» en el umbral de segmentación no puede cambiar la distribución. */
export function presetForKey(key: string, target: EventTarget | null): LayoutPreset | null {
  const el = target as HTMLElement | null;
  const tag = el?.tagName?.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return null;
  // Editable también por herencia (un nodo dentro de un contenteditable).
  if (el?.closest?.('[contenteditable]:not([contenteditable="false"])')) return null;
  return KEYS[key] ?? null;
}
