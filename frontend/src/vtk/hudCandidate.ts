/* La línea del candidato arriba a la izquierda del visor.

   F1-158: decía «cand-001 · Ø 3.7 mm» —la estimación del detector— también
   después de medir el saco, mientras la tabla de Morfometría daba 10,9 mm. Dos
   cifras para el mismo aneurisma, y la del visor era la peor. Ahora lleva la
   medida si la hay y, si no, la estimación marcada «est.».

   F1-156: tras medir alrededor de las marcas (cuello y ápice, o el borde) el
   visor no decía que la cifra salía de un saco medido a mano; la persona lo
   confundía con la medida automática que acababa de fallar. Puro, sin vtk,
   para probarlo. */
import type { AneurysmCandidate, MorphometryResult } from "../api/types";
import { cifra } from "../lib/numero";
import { candidateName, isManual } from "../components/planning/detectCopy";

const es1 = (x: number) => cifra(x, 1);

type Cand = Pick<AneurysmCandidate, "id" | "max_diameter_mm" | "patch_kind" | "rank" | "channels">;
type Morph = Pick<MorphometryResult, "max_diameter_mm" | "neck_source" | "candidate_id">;

/** La medida es de este candidato: sin `candidate_id` (sesiones antiguas) se
 *  da por suya, porque el store vacía la medida al cambiar de candidato. */
function measures(candidate: Cand, m: Morph | null | undefined): m is Morph {
  return !!m && m.max_diameter_mm > 0 && (!m.candidate_id || m.candidate_id === candidate.id);
}

/** «Candidato 1 · Ø 10,9 mm» con medida; «Candidato 1 · Ø 3,7 mm est.» sin ella;
 *  «Marcado a mano» (A65: nunca el id interno). */
export function hudCandidateLine(candidate: Cand, morphometry: Morph | null | undefined, rejected = false, index?: number | null): string {
  const name = candidateName(candidate, rejected, index);
  if (measures(candidate, morphometry)) return `${name} · Ø ${es1(morphometry.max_diameter_mm)} mm`;
  // Un candidato marcado a mano (F1-146) no tiene grosor estimado: «Ø 0,0 mm» mentiría.
  if (isManual(candidate)) return name;
  return `${name} · Ø ${es1(candidate.max_diameter_mm)} mm est.`;
}

/** «MEDIDA MANUAL» cuando el saco se midió alrededor de las marcas; null si no. */
export function hudManualTag(morphometry: Pick<MorphometryResult, "neck_source"> | null | undefined): string | null {
  return morphometry?.neck_source === "manual" || morphometry?.neck_source === "rim" ? "MEDIDA MANUAL" : null;
}
