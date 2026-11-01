/** Cifras clínicas visibles con coma decimal, una sola fuente para todo el
 *  panel. Solo para texto que una persona lee: lo que viaja a la API, a un
 *  fichero o a un `<input type="number">` conserva el punto (`toFixed`). */

export interface OpcionesCifra {
  /** Pinta el signo negativo con «−» (U+2212) en lugar de «-». */
  menosTipografico?: boolean;
}

/** `11` → «11,0». `null`, `undefined`, NaN e infinitos → «—». `-0` y los
 *  valores que se redondean a cero → sin signo («0,0», nunca «-0,0»). */
export function cifra(v: number | null | undefined, decimales = 1, opciones?: OpcionesCifra): string {
  if (v == null || !Number.isFinite(v)) return "—";
  let txt = v.toFixed(decimales);
  if (/^-0(\.0*)?$/.test(txt)) txt = txt.slice(1);
  txt = txt.replace(".", ",");
  return opciones?.menosTipografico ? txt.replace("-", "−") : txt;
}

/** `11` → «11,0 mm»; sin valor → «—» (sin unidad). */
export function mm(v: number | null | undefined, decimales = 1): string {
  const t = cifra(v, decimales);
  return t === "—" ? t : `${t} mm`;
}
