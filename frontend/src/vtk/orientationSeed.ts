/* Siembra de la orientación fijada a mano al abrir una sesión.

   Vive en el estado de sesión y llega con la meta; el store la guarda para
   todo el visor. Se siembra una sola vez por sesión (después manda lo que el
   usuario fije) y SOLO con la meta de esa sesión: al cambiar de sesión la
   meta anterior puede seguir en memoria un render, y sembrar con ella hacía
   heredar la orientación del estudio anterior como si fuera la del nuevo y
   marcaba la sesión como sembrada, así que la suya ya no entraba nunca. */

import type { ManualOrientationBody } from "../api/types";
import type { ManualOrientation } from "./geometry";

export function shouldSeed(seededFor: string | null, sessionId: string | null, metaFor: string | null): boolean {
  return !!sessionId && metaFor === sessionId && seededFor !== sessionId;
}

/** Cuerpo de la API → store. null si la sesión no tiene ninguna fijada. */
export function manualFromMeta(m: ManualOrientationBody | null | undefined): ManualOrientation | null {
  return m ? { anteriorEdge: m.anterior_edge, firstSliceSuperior: m.first_slice_superior } : null;
}
