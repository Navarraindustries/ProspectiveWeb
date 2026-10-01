/** Lectura de esquina del MIP. En la celda de la franja va en una sola
    línea corta (la larga se cortaba y pisaba el icono del maniquí); el
    sentido y el umbral se leen al maximizar. En compuesto la primera línea
    nombra el preajuste en lugar del umbral, que solo gobierna el MIP. */
export function mipReadoutLines(o: {
  mode: "acumulado" | "lamina"; reverse: boolean; index: number; count: number;
  slabMm: number; threshold: number; compact: boolean;
  render?: "mip" | "compuesto"; preset?: string;
}): string[] {
  if (o.render === "compuesto") {
    if (o.compact) return [o.mode === "acumulado" ? `COMP ${o.index + 1}/${o.count}` : `COMP ±${o.slabMm}`];
    return [`COMPUESTO · ${(o.preset ?? "").toUpperCase()}`, cutLine(o)];
  }
  if (o.compact) return [o.mode === "acumulado" ? `ACUM ${o.index + 1}/${o.count}` : `LÁMINA ±${o.slabMm}`];
  return [cutLine(o), `UMBRAL ${Math.round(o.threshold)}`];
}

function cutLine(o: { mode: "acumulado" | "lamina"; reverse: boolean; index: number; count: number; slabMm: number }): string {
  return o.mode === "acumulado" ? `ACUMULADO ${o.reverse ? "DESDE" : "HASTA"} ${o.index + 1}/${o.count}` : `LÁMINA ±${o.slabMm} mm`;
}
