/* Qué necesita cada paso para abrirse, si ya tiene resultado y qué avisa al abrirse.
   Antes vivía dentro de Workspace; el dock y la paleta lo comparten. */

import { canAdvanceFromDetect } from "../components/planning/detectGate";
import type { usePlanning } from "../store/planning";
import { MORPHO_AUTO_HINT, NEEDS_MORPHOMETRY, STEPS } from "./steps";

export type GateState = Pick<
  ReturnType<typeof usePlanning>,
  "series" | "segmentation" | "candidates" | "rejectedCandidates" | "morphometry" | "treatment" | "clipPlan" | "plannedClips"
>;

/** What each step needs before it can say anything true, or null when it's ready.
 *
 *  The rail used to unlock a step just because it had been visited, so a resumed
 *  session whose detection replay failed landed on «Informe» fully unlocked and
 *  produced a PDF with no measurements in it. Gating on the actual results also
 *  turns the disabled state into an instruction instead of a dead end. */
export function stepMissing(i: number, p: GateState): string | null {
  switch (i) {
    case 0: return null;
    case 1: return p.series ? null : "Carga una serie DICOM primero";
    case 2: return p.segmentation ? null : "Segmenta el vaso primero";
    // Un descartado también se mide: con todo vetado el paso sigue abierto.
    case 3: return canAdvanceFromDetect(p.candidates, p.rejectedCandidates) ? null : "Detecta un candidato primero";
    default: return p.morphometry ? null : NEEDS_MORPHOMETRY;
  }
}

/** ¿El paso tiene resultado propio? Fabricación e Informe no: solo cuentan por orden. */
export function stepDone(i: number, p: GateState): boolean {
  switch (i) {
    case 0: return !!p.series;
    case 1: return !!p.segmentation;
    case 2: return canAdvanceFromDetect(p.candidates, p.rejectedCandidates);
    case 3: return !!p.morphometry;
    case 4: return !!p.treatment;
    case 5: return p.clipPlan != null || (p.plannedClips?.length ?? 0) > 0;
    default: return false;
  }
}

/** Lo que abrir el paso hace por su cuenta, si hay algo que avisar. */
export function stepAviso(i: number, p: GateState): string | null {
  return STEPS[i]?.key === "morpho" && !p.morphometry && stepMissing(i, p) === null ? MORPHO_AUTO_HINT : null;
}
