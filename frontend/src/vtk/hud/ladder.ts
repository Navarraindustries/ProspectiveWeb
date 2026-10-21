/** Marcas de la escalera de cortes: el índice actual en el centro, una marca
 *  por corte cada `pxPerTick`, mayores cada 10. Índices mayores quedan arriba. */
export function ladderTicks(count: number, index: number, heightPx: number, pxPerTick = 8) {
  const out: { y: number; index: number; major: boolean }[] = [];
  const half = Math.ceil(heightPx / 2 / pxPerTick) + 1;
  for (let k = -half; k <= half; k++) {
    const i = index + k;
    if (i < 0 || i >= count) continue;
    out.push({ y: heightPx / 2 - k * pxPerTick, index: i, major: i % 10 === 0 });
  }
  return out;
}

/** Inversa de `ladderTicks`: el corte que queda a la altura `y` de la escalera,
 *  con el índice actual en el centro. Acotado al rango de cortes. */
export function indexAtY(y: number, count: number, index: number, heightPx: number, pxPerTick = 8): number {
  const i = Math.round(index + (heightPx / 2 - y) / pxPerTick);
  return Math.max(0, Math.min(count - 1, i));
}
