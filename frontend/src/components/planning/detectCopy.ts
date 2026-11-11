/* Textos del panel de detección. Puro: sin React ni estado, para que la copia
   se pruebe y se cambie en un solo sitio. */
import { cifra } from "../../lib/numero";
import type { AneurysmCandidate } from "../../api/types";

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

/** El nombre del candidato en la posición `idx` de «aceptados seguidos de
 *  descartados» (el índice de `selectedCandidate`); null si no hay tal. */
export function candidateNameAt(
  accepted: readonly AneurysmCandidate[], rejected: readonly AneurysmCandidate[], idx: number,
): string | null {
  const isRej = idx >= accepted.length;
  const i = isRej ? idx - accepted.length : idx;
  const c = isRej ? rejected[i] : accepted[i];
  return c ? candidateName(c, isRej, i) : null;
}

/** Nombre que lee una persona: nunca el id interno («cand-001»). Sigue la
 *  numeración de las etiquetas del 3D (`candidateLabel`): «Candidato 1» y, si
 *  está descartado, «Descartado D1». Sin `rank` (sesiones antiguas) se deduce
 *  del id; un descartado sin puesto no tiene número fiable y no lo lleva. */
export function candidateName(
  c: { id: string; rank?: number | null; patch_kind?: string | null; channels?: readonly string[] | null },
  rejected = false,
  index?: number | null,
): string {
  if (isManual(c)) return "Marcado a mano";
  if (c.rank != null && c.rank > 0) return rejected ? `Descartado D${c.rank}` : `Candidato ${c.rank}`;
  // Sin puesto: la posición en su lista, como `candidateLabel` del 3D.
  if (index != null && index >= 0) return rejected ? `Descartado D${index + 1}` : `Candidato ${index + 1}`;
  const m = /^cand-(\d+)$/.exec(c.id);
  if (!m) return "Candidato";
  return rejected ? "Candidato descartado" : `Candidato ${Number(m[1])}`;
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
  "Es una lista para recorrer, no un veredicto: se llena hasta 5 aunque el estudio esté sano, así que no dice si hay aneurisma o no, y su orden no está validado contra casos anotados.",
  "Lo que se pinta de azul no es el saco: señala dónde mirar.",
];

/** Lo que se despliega con «Más». */
export const DETECT_MORE: readonly string[] = [
  "Curvatura: la superficie se abomba. Calibre: más gruesa que el resto de la vasculatura. Cociente: más gruesa que el vaso de al lado.",
  "«Saco pequeño» es una cuota, no un cuarto voto: si ninguno de los 5 primeros es un saco de 3 – 5 mm con forma de esfera, el mejor de ellos ocupa el 5.º puesto. No mueve a los otros cuatro.",
  "Cuando lo encontró la curvatura, el azul es la región detectada; cuando lo encontró el calibre, es una bola alrededor del punto que incluye pared de vaso. El grosor es una estimación local.",
  "Tejido (solo TC): HU medio y máximo en 2 mm alrededor del punto. «Hueso o calcio» puede ser el cráneo o la pared calcificada de una lesión real; «sin contraste», partes blandas o trombo. Describe, no filtra.",
  "La medida real la da Morfometría, marcando el cuello y el ápice: se vuelve a aislar el saco desde el volumen, así que nada de esto altera los números.",
];

/** Lo que hay alrededor del candidato (HU en 2 mm, solo TC), en una línea;
 *  null sin medir (3DRA, sesiones antiguas, marcados a mano). Dice la cifra
 *  que decidió la etiqueta: el máximo para hueso y «sin contraste», la media
 *  para el vaso con contraste. */
export function tissueLabel(
  c: { tissue?: string | null; hu_mean?: number | null; hu_max?: number | null },
): string | null {
  if (c.tissue === "hueso") return `hueso o calcio cerca · máx ${cifra(c.hu_max, 0)} HU`;
  if (c.tissue === "contraste") return `vaso con contraste · ${cifra(c.hu_mean, 0)} HU`;
  if (c.tissue === "otro") return `sin contraste · máx ${cifra(c.hu_max, 0)} HU`;
  return null;
}

/** Explicación al pasar el ratón sobre el tejido. */
export function tissueTitle(tissue?: string | null): string | undefined {
  if (tissue === "hueso") return "La bola de 2 mm toca ≥ 700 HU: hueso, o el calcio de la pared de una lesión real. No descarta el candidato.";
  if (tissue === "contraste") return "Vaso con contraste alrededor (máximo ≥ 150 HU y media ≥ 100 HU).";
  if (tissue === "otro") return "Ni hueso ni contraste: partes blandas o trombo (una lesión trombosada puede salir así).";
  return undefined;
}

/** F1-143: «Ø 3.7 mm est.» se leía como el diámetro del aneurisma, y es el
 *  grosor que el detector estimó en ese punto. Coma decimal, como el resto
 *  de la copia en español. */
export function thicknessLabel(mm: number): string {
  return `≈${cifra(mm)} mm de grosor local`;
}

/** Canal del saco pequeño (30-10, informe §4.20): el consenso le reserva el
 *  5.º puesto si ningún candidato anterior lleva su etiqueta. No vota. */
export const SMALL_SAC_CHANNEL = "saco";

/** Nombre del canal en la insignia: el canal de la cuota se llama «saco» en la
 *  API y «saco pequeño» delante del clínico; los demás, tal cual. */
export function channelLabel(ch: string): string {
  return ch === SMALL_SAC_CHANNEL ? "saco pequeño" : ch;
}

/** Explicación al pasar el ratón, en palabras de la consulta (auditoría F3:
 *  «cociente» es la menos clínica de las tres y no decía nada). */
const CHANNEL_TITLE: Record<string, string> = {
  [SMALL_SAC_CHANNEL]: "Cuota del 5.º puesto: el mejor saco de 3 – 5 mm con forma de esfera cuando ninguno estaba entre los 5. No vota ni mueve a los demás.",
  curvatura: "La superficie se abomba.",
  calibre: "Más gruesa que el resto de la vasculatura.",
  cociente: "Más gruesa que el vaso de al lado.",
};

export function channelTitle(ch: string): string | undefined {
  return CHANNEL_TITLE[ch];
}

/** Canal (y `patch_kind`) de un candidato que viene de un punto marcado a
 *  mano y confirmado, no del detector (F1-146). */
export const MANUAL_CHANNEL = "manual";

/** Insignia de ese candidato en la lista. */
export const MANUAL_BADGE = "marcado a mano";

/** F1-146: qué hacer cuando el detector no encontró la lesión. */
export const MANUAL_HINT = "Una lesión que el detector no encontró se mide en Morfometría marcando el cuello y el ápice; el punto confirmado queda como candidato «marcado a mano».";

/** Lo que responde la morfometría automática sobre un marcado a mano (el
 *  mismo texto que el 422 del backend, `routers/detect.MANUAL_NO_SAC`). En
 *  Morfometría se enseña como información, encima de los controles de cuello
 *  y ápice: no es un fallo, es el camino. */
export const MANUAL_NO_SAC = "Candidato marcado a mano: no hay saco detectado que aislar. Mide en Morfometría marcando el cuello y el ápice.";

/** F1-148: lo que se pierde sin estudio archivado, dicho en lo que importa. */
export const UNARCHIVED_NOTE = "Sin archivar, esta confirmación no queda ligada al paciente ni sirve para evaluar versiones futuras del detector";

/** ¿Es un candidato marcado a mano? Por el tipo de parche o por el canal. */
export function isManual(c: { patch_kind?: string | null; channels?: readonly string[] | null }): boolean {
  return c.patch_kind === MANUAL_CHANNEL || (c.channels ?? []).includes(MANUAL_CHANNEL);
}
