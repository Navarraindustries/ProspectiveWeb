/* Textos del panel de detección. Puro: sin React ni estado, para que la copia
   se pruebe y se cambie en un solo sitio. */

/** Nota bajo un candidato descartado cuando es el elegido. */
export const VETO_HINT = "Descartado por un criterio geométrico: compruébalo en el 3D antes de medir.";

/** Aviso cuando el backend limpió la morfometría porque el elegido cambió. */
export const MORPHO_INVALIDATED = "La morfometría se ha limpiado: el candidato elegido cambió al re-detectar.";

/** Puesto de un aceptado en la lista: «Puesto #3». */
export function rankLabel(rank: number): string {
  return `Puesto #${rank}`;
}

/** Título del desplegable de descartados: «Descartados (3)». */
export function rejectedSummary(n: number): string {
  return `Descartados (${n})`;
}
