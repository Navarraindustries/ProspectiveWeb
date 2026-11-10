/* Cambiar de candidato desde el 3D pasa por la misma pregunta que desde la lista.

   Elegir otro candidato descarta la morfometría y la decisión. El panel de
   Detección pregunta antes; el clic sobre la malla iba directo al store y se
   las llevaba sin avisar. El panel registra aquí su selección con pregunta y
   el visor la usa cuando existe. */

let guarded: ((i: number) => void) | null = null;

/** El panel de Detección presta su «elegir candidato» mientras está montado. */
export function registerCandidateGuard(fn: ((i: number) => void) | null): void {
  guarded = fn;
}

/** Pide el cambio por el camino con pregunta. `false` si nadie lo atiende. */
export function requestCandidate(i: number): boolean {
  if (!guarded) return false;
  guarded(i);
  return true;
}
