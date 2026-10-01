/* Atajos de teclado de la distribución del visor: Alt+1 sola, Alt+2 derecha,
   Alt+3 abajo. Con Alt porque los dígitos solos ya saltan de paso en el flujo
   (Workspace): el mismo «2» no puede significar dos cosas. Puro para poder
   probarlo sin montar el visor. */
import type { LayoutPreset } from "./layout";

const KEYS: Record<string, LayoutPreset> = { "1": "sola", "2": "derecha", "3": "abajo" };

/** Un atajo numérico nunca debe robarle la tecla a un campo donde se escribe:
 *  escribir en el umbral de segmentación no puede cambiar la distribución. */
export function presetForKey(key: string, target: EventTarget | null, altKey: boolean): LayoutPreset | null {
  if (!altKey) return null;
  const el = target as HTMLElement | null;
  const tag = el?.tagName?.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return null;
  // Editable también por herencia (un nodo dentro de un contenteditable).
  if (el?.closest?.('[contenteditable]:not([contenteditable="false"])')) return null;
  return KEYS[key] ?? null;
}
