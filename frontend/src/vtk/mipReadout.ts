import type { VolumeWindow } from "./volumePresets";

/** Lectura de esquina del MIP. En la celda de la franja va en una sola
    línea corta (la larga se cortaba y pisaba el icono del maniquí); el
    sentido y el umbral se leen al maximizar. En compuesto la primera línea
    nombra el preajuste en lugar del umbral, que solo gobierna el MIP. Con
    recorte libre la línea del corte dice el desplazamiento del plano (o el
    grosor de la lámina): el índice de un eje no describe un plano oblicuo.
    En compuesto ampliado se añade el nivel y la ventana del preajuste, que
    el botón derecho cambia; en la celda compacta no cabe. En MIP ampliado,
    con ventana, la segunda línea añade NIV · VENT (y conserva UMBRAL mientras
    la ventana sea la derivada). `unit` es « HU»
    en TC y vacío fuera (ver `unitFor`). */
function linesWithoutLocal(o: {
  mode: "acumulado" | "lamina"; reverse: boolean; index: number; count: number;
  slabMm: number; threshold: number; compact: boolean;
  render?: "mip" | "compuesto"; preset?: string;
  clip?: "eje" | "libre"; offsetMm?: number;
  window?: VolumeWindow; windowDerived?: boolean; unit?: string;
}): string[] {
  if (o.clip === "libre" && o.compact) return [o.mode === "acumulado" ? `LIB ${signedMm(o.offsetMm ?? 0)}` : `LIB ±${o.slabMm}`];
  if (o.render === "compuesto") {
    if (o.compact) return [o.mode === "acumulado" ? `COMP ${o.index + 1}/${o.count}` : `COMP ±${o.slabMm}`];
    const lines = [`COMPUESTO · ${(o.preset ?? "").toUpperCase()}`, cutLine(o)];
    if (o.window) lines.push(`NIV ${Math.round(o.window.wc)}${o.unit ?? ""} · VENT ${Math.round(o.window.ww)}${o.unit ?? ""}`);
    return lines;
  }
  if (o.compact) return [o.mode === "acumulado" ? `ACUM ${o.index + 1}/${o.count}` : `LÁMINA ±${o.slabMm}`];
  const umbral = `UMBRAL ${Math.round(o.threshold)}${o.unit ?? ""}`;
  if (!o.window) return [cutLine(o), umbral];
  const niv = `NIV ${Math.round(o.window.wc)}${o.unit ?? ""} · VENT ${Math.round(o.window.ww)}${o.unit ?? ""}`;
  // Mientras la ventana es la derivada del umbral, el umbral la explica; movida
  // a mano ya no describe la rampa y se calla.
  return [cutLine(o), o.windowDerived ? `${umbral} · ${niv}` : niv];
}

/** La línea del corte lleva « · LOCAL» con la caja activa: es la primera
 *  salvo en COMPUESTO ampliado, donde la primera nombra el preajuste. */
export function mipReadoutLines(o: Parameters<typeof linesWithoutLocal>[0] & { local?: boolean }): string[] {
  const lines = linesWithoutLocal(o);
  if (!o.local) return lines;
  const i = o.render === "compuesto" && !o.compact ? 1 : 0;
  lines[i] = `${lines[i]} · LOCAL`;
  return lines;
}

function cutLine(o: { mode: "acumulado" | "lamina"; reverse: boolean; index: number; count: number; slabMm: number; clip?: "eje" | "libre"; offsetMm?: number }): string {
  if (o.clip === "libre") return o.mode === "acumulado" ? `LIBRE ${signedMm(o.offsetMm ?? 0)} mm` : `LIBRE ±${o.slabMm} mm`;
  return o.mode === "acumulado" ? `ACUMULADO ${o.reverse ? "DESDE" : "HASTA"} ${o.index + 1}/${o.count}` : `LÁMINA ±${o.slabMm} mm`;
}

/** Una décima con coma y signo explícito; el signo se decide sobre el valor
 *  redondeado para no leer «−0,0». */
function signedMm(v: number): string {
  const r = Math.round(v * 10) / 10;
  return `${r < 0 ? "−" : "+"}${Math.abs(r).toFixed(1).replace(".", ",")}`;
}
