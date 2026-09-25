/** Lectura de esquina del MIP. En la celda de la franja va en una sola
    línea corta (la larga se cortaba y pisaba el icono del maniquí); el
    sentido y el umbral se leen al maximizar. */
export function mipReadoutLines(o: {
  mode: "acumulado" | "lamina"; reverse: boolean; index: number; count: number;
  slabMm: number; threshold: number; compact: boolean;
}): string[] {
  if (o.compact) return [o.mode === "acumulado" ? `ACUM ${o.index + 1}/${o.count}` : `LÁMINA ±${o.slabMm}`];
  return [
    o.mode === "acumulado" ? `ACUMULADO ${o.reverse ? "DESDE" : "HASTA"} ${o.index + 1}/${o.count}` : `LÁMINA ±${o.slabMm} mm`,
    `UMBRAL ${Math.round(o.threshold)}`,
  ];
}
