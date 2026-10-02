/* Cuándo se puede pasar de Detección a Morfometría. Puro, para probarlo sin
   montar el workspace. */

import type { AneurysmCandidate } from "../../api/types";

/** Hay algo que medir si hay algún sitio, aceptado O descartado.
 *
 *  Antes solo contaban los aceptados: con todos los sitios vetados (el caso
 *  típico es recortar ajustado alrededor de la lesión, que entonces toca la
 *  cara del recorte) el flujo se quedaba bloqueado, aunque un descartado se
 *  puede elegir y medir igual que un aceptado. */
export function canAdvanceFromDetect(
  candidates: readonly AneurysmCandidate[],
  rejected: readonly AneurysmCandidate[],
): boolean {
  return candidates.length + rejected.length > 0;
}
