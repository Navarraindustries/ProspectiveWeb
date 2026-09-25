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
