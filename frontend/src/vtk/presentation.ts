/* Modo presentación (sesión clínica): qué escenas tiene el caso y qué cifras
   se enseñan en grande. Puro; Viewer lo pone en pantalla y mueve la cámara. */
import type { AneurysmCandidate, MorphometryResult } from "../api/types";
import { cifra } from "../lib/numero";

export type EscenaId = "arbol" | "lesion" | "abordaje" | "dentro";

export interface Escena { id: EscenaId; titulo: string; detalle: string }

/** Giro lento de la escena mientras se habla: una vuelta cada 40 s. */
export const GIRO_PRESENTACION_GRADOS_S = 9;

/** Las escenas que el caso puede enseñar, en el orden de una presentación:
 *  de lo general (el árbol) a lo concreto (la lesión, cómo se llega, por dentro). */
export function escenasDisponibles(hay: { lesion: boolean; abordaje: boolean; linea: boolean }): Escena[] {
  const out: Escena[] = [{ id: "arbol", titulo: "Árbol vascular", detalle: "Vista completa de la segmentación" }];
  if (hay.lesion) out.push({ id: "lesion", titulo: "Lesión", detalle: "El candidato elegido, de cerca" });
  if (hay.abordaje) out.push({ id: "abordaje", titulo: "Abordaje", detalle: "Mirando por el corredor hacia la diana" });
  if (hay.linea) out.push({ id: "dentro", titulo: "Por dentro del vaso", detalle: "Recorrido por la línea central" });
  return out;
}

/** La escena siguiente o anterior, sin dar la vuelta: al final se queda. */
export const escenaVecina = (i: number, d: 1 | -1, n: number): number => Math.min(n - 1, Math.max(0, i + d));

export interface CifraClave { etiqueta: string; valor: string; unidad: string; estimada?: boolean }

/** Las cifras de la lesión que se leen desde el fondo de la sala. Con la
 *  morfometría hecha, sus medidas (las del cuello solo si el cuello se pudo
 *  medir, como en la leyenda del 3D); sin ella, el tamaño que estimó el
 *  detector, marcado como estimación. Nada que no esté medido. */
export function cifrasClave(m: MorphometryResult | null | undefined, c: AneurysmCandidate | null | undefined): CifraClave[] {
  if (m) {
    const out: CifraClave[] = [{ etiqueta: "Ø máximo", valor: cifra(m.max_diameter_mm, 1), unidad: "mm" }];
    if (m.neck_valid !== false) {
      out.push(
        { etiqueta: "Cuello", valor: cifra(m.neck_mm, 1), unidad: "mm" },
        { etiqueta: "Altura del domo", valor: cifra(m.dome_height_mm, 1), unidad: "mm" },
        { etiqueta: "Relación de aspecto", valor: cifra(m.ar, 2), unidad: "" },
      );
    }
    return out;
  }
  if (c && Number.isFinite(c.max_diameter_mm) && c.max_diameter_mm > 0) {
    return [{ etiqueta: "Ø máximo", valor: cifra(c.max_diameter_mm, 1), unidad: "mm", estimada: true }];
  }
  return [];
}
