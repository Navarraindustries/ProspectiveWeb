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

/** Sin ceros de relleno, con coma: `2` → «2», `2.5` → «2,5», `0.05` → «0,05».
 *  Para tallas de catálogo y umbrales que se citan tal como están definidos.
 *  Espejo de `cifra_corta` en `backend/services/numero.py`. */
export function cifraCorta(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const r = Math.round(v * 1e6) / 1e6;
  return (Object.is(r, -0) ? "0" : String(r)).replace(".", ",");
}

/** Lo que una persona va a leer FUERA de la pantalla (portapapeles, correo)
 *  y llega mezclado con textos del backend: las cifras con punto pasan a
 *  coma. Solo toca un punto entre dígitos, así que «v2.0» de un número de
 *  versión también cambiaría: no usar sobre identificadores. */
export function comaDecimal(texto: string): string {
  return texto.replace(/(\d)\.(\d)/g, "$1,$2");
}

/** `11` → «11,0 mm»; sin valor → «—» (sin unidad). */
export function mm(v: number | null | undefined, decimales = 1): string {
  const t = cifra(v, decimales);
  return t === "—" ? t : `${t} mm`;
}

/** «(1,2; 4,6; −7,9)»: tres ejes separados por «; » para que la coma de los
 *  decimales no se confunda con la que separa x, y, z. Sin valor, «—». */
export function coordenadas(v: readonly number[] | null | undefined, decimales = 1): string {
  if (!v) return "—";
  return `(${v.map((x) => cifra(x, decimales, { menosTipografico: true })).join("; ")})`;
}
