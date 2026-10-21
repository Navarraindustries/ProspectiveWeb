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

const es1 = (x: number) => x.toFixed(1).replace(".", ",");

type Cand = Pick<AneurysmCandidate, "id" | "max_diameter_mm" | "patch_kind">;
type Morph = Pick<MorphometryResult, "max_diameter_mm" | "neck_source" | "candidate_id">;

/** La medida es de este candidato: sin `candidate_id` (sesiones antiguas) se
 *  da por suya, porque el store vacía la medida al cambiar de candidato. */
function measures(candidate: Cand, m: Morph | null | undefined): m is Morph {
  return !!m && m.max_diameter_mm > 0 && (!m.candidate_id || m.candidate_id === candidate.id);
}

/** «cand-001 · Ø 10,9 mm» con medida; «cand-001 · Ø 3,7 mm est.» sin ella. */
export function hudCandidateLine(candidate: Cand, morphometry: Morph | null | undefined): string {
  if (measures(candidate, morphometry)) return `${candidate.id} · Ø ${es1(morphometry.max_diameter_mm)} mm`;
  // Un candidato marcado a mano (F1-146) no tiene grosor estimado: «Ø 0,0 mm» mentiría.
  if (candidate.patch_kind === "manual") return `${candidate.id} · marcado a mano`;
  return `${candidate.id} · Ø ${es1(candidate.max_diameter_mm)} mm est.`;
}

/** «MEDIDA MANUAL» cuando el saco se midió alrededor de las marcas; null si no. */
export function hudManualTag(morphometry: Pick<MorphometryResult, "neck_source"> | null | undefined): string | null {
  return morphometry?.neck_source === "manual" || morphometry?.neck_source === "rim" ? "MEDIDA MANUAL" : null;
}
