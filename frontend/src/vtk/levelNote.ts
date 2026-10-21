/* Rótulo del nivel del volumen en el cliente.

   El grueso siempre es resolución reducida. El completo también lo es cuando
   el servidor lo manda con stride en el plano (volúmenes muy grandes): un TC
   de 512×512×1030 llega a 256² y, sin rótulo, los bordes parecerían nativos.

   F1-113: decía «RESOLUCIÓN REDUCIDA · 4/12». La cuenta de bloques no le
   sirve a nadie y «reducida» se leía como «las medidas son peores»; las
   medidas salen del volumen del servidor, no de esta vista previa, así que
   el aviso lo dice. */

export type ClientLevel = "coarse" | "full" | null;

export function levelNoteFor(
  level: ClientLevel,
  stride: number,
  error: string | null,
  short = false,
): string | null {
  if (level === "coarse") return short ? "BAJA RESOLUCIÓN" : "Vista previa en baja resolución; las medidas no cambian";
  if (level === "full" && stride > 1) {
    return short ? `1:${stride}` : `Vista previa 1:${stride}; las medidas no cambian`;
  }
  if (error) return short ? "SIN COMPLETO" : "SIN VOLUMEN COMPLETO";
  return null;
}

/** Qué dice una celda sin volumen todavía. F1-119: decía «SIN VOLUMEN» mientras
 *  la meta aún se estaba pidiendo, y parecía un estudio vacío o un fallo. Ahora
 *  «SIN VOLUMEN» solo cuando no lo habrá: falló, el navegador no tiene WebGL2
 *  (el volumen vive en el cliente) o no hay serie que cargar. */
export function volumeStateLabel({ series, webgl2, error }: { series: boolean; webgl2: boolean; error: string | null }): string {
  if (!series) return "SIN VOLUMEN";
  if (!webgl2) return "SIN VOLUMEN · SIN WEBGL2";
  if (error) return "SIN VOLUMEN";
  return "CARGANDO VOLUMEN…";
}
