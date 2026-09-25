/* Rótulo del nivel del volumen en el cliente.

   El grueso siempre es resolución reducida. El completo también lo es cuando
   el servidor lo manda con stride en el plano (volúmenes muy grandes): un TC
   de 512×512×1030 llega a 256² y, sin rótulo, las medidas y los bordes
   parecerían nativos. */

export type ClientLevel = "coarse" | "full" | null;

export function levelNoteFor(
  level: ClientLevel,
  stride: number,
  progress: { done: number; total: number } | null,
  error: string | null,
  short = false,
): string | null {
  if (level === "coarse") {
    const p = progress ? (short ? ` ${progress.done}/${progress.total}` : ` · ${progress.done}/${progress.total}`) : "";
    return `${short ? "REDUCIDA" : "RESOLUCIÓN REDUCIDA"}${p}`;
  }
  if (level === "full" && stride > 1) {
    return short ? `REDUCIDA 1:${stride}` : `RESOLUCIÓN REDUCIDA · 1:${stride}`;
  }
  if (error) return short ? "SIN COMPLETO" : "SIN VOLUMEN COMPLETO";
  return null;
}
