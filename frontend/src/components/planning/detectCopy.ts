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

/** F1-142: la explicación de la lista, en tres líneas. Antes eran tres
 *  párrafos delante de los candidatos, con una cifra fija («en los dos casos
 *  con diagnóstico que tenemos…») que dejó de ser verdad: la cifra viva es la
 *  de las lesiones confirmadas, que enseña «¿Cuál es la lesión?». */
export const DETECT_LINES: readonly string[] = [
  "Tres criterios buscan por separado (curvatura, calibre y cociente); cada candidato dice cuáles lo encontraron.",
  "Es una lista para recorrer, no un veredicto: el orden no está validado contra casos anotados.",
  "Lo que se pinta de azul no es el saco: señala dónde mirar.",
];

/** Lo que se despliega con «Más». */
export const DETECT_MORE: readonly string[] = [
  "Curvatura: la superficie se abomba. Calibre: más gruesa que el resto de la vasculatura. Cociente: más gruesa que el vaso de al lado.",
  "Cuando lo encontró la curvatura, el azul es la región detectada; cuando lo encontró el calibre, es una bola alrededor del punto que incluye pared de vaso. El grosor es una estimación local.",
  "La medida real la da Morfometría, marcando el cuello y el ápice: se vuelve a aislar el saco desde el volumen, así que nada de esto altera los números.",
];

/** F1-143: «Ø 3.7 mm est.» se leía como el diámetro del aneurisma, y es el
 *  grosor que el detector estimó en ese punto. Coma decimal, como el resto
 *  de la copia en español. */
export function thicknessLabel(mm: number): string {
  const n = mm.toLocaleString("es", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return `≈${n} mm de grosor local`;
}

/** Canal (y `patch_kind`) de un candidato que viene de un punto marcado a
 *  mano y confirmado, no del detector (F1-146). */
export const MANUAL_CHANNEL = "manual";

/** Insignia de ese candidato en la lista. */
export const MANUAL_BADGE = "marcado a mano";

/** F1-146: qué hacer cuando el detector no encontró la lesión. */
export const MANUAL_HINT = "Una lesión que el detector no encontró se mide en Morfometría marcando el cuello y el ápice; el punto confirmado queda como candidato «marcado a mano».";

/** F1-148: lo que se pierde sin estudio archivado, dicho en lo que importa. */
export const UNARCHIVED_NOTE = "Sin archivar, esta confirmación no queda ligada al paciente ni sirve para evaluar versiones futuras del detector";

/** ¿Es un candidato marcado a mano? Por el tipo de parche o por el canal. */
export function isManual(c: { patch_kind?: string | null; channels?: readonly string[] | null }): boolean {
  return c.patch_kind === MANUAL_CHANNEL || (c.channels ?? []).includes(MANUAL_CHANNEL);
}
