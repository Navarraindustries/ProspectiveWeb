/* Textos del panel de detección. Puro: sin React ni estado, para que la copia
   se pruebe y se cambie en un solo sitio. */

/** Nota bajo un candidato descartado cuando es el elegido, con su motivo.
 *  La etiqueta va entre comillas y tal cual: algunas son frases («No es
 *  sacular») que en minúscula y sin comillas no se leerían como motivo. */
export function vetoHint(label?: string | null): string {
  const why = label ? `«${label}»` : "un criterio geométrico";
  return `Descartado por ${why}: compruébalo en el 3D antes de medir.`;
}

/** Cuando la detección solo dejó descartados: no es un vacío, hay sitios que
 *  revisar en la lista. */
export const ALL_REJECTED = "Todos los sitios encontrados se descartaron: revísalos en «Descartados» y elige uno si discrepas del veto.";

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
