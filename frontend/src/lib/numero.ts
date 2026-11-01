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
 *  Espejo de `cifra_corta` en `backend/services/numero.py`, con la misma regla:
 *  `toFixed(6)` sin los ceros finales. Nunca notación científica
 *  (1234567 → «1234567», 1e-5 → «0,00001», −1e-9 → «0»). */
export function cifraCorta(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  // `toFixed` pasa a exponente desde 1e21; ahí no hay decimales que escribir.
  let txt = Math.abs(v) >= 1e21
    ? v.toLocaleString("en-US", { useGrouping: false, maximumFractionDigits: 0 })
    : v.toFixed(6);
  if (txt.includes(".")) txt = txt.replace(/0+$/, "").replace(/\.$/, "");
  if (txt === "-0") txt = "0";
  return txt.replace(".", ",");
}

/** Lo que una persona va a leer FUERA de la pantalla (portapapeles, correo)
 *  y llega mezclado con textos del backend: las cifras con punto pasan a
 *  coma. Solo un número suelto: no precedido de letra, dígito ni «dígito.», y
 *  no seguido de otro «.dígito». Así «T1.2», «v1.2.3», «1.2.3» o una fecha
 *  «2024.10.31» quedan como están. Una designación como `0.014"` sí cambiaría:
 *  no usar sobre identificadores ni referencias de producto. */
export function comaDecimal(texto: string): string {
  return texto.replace(/(?<![\p{L}\d]|\d\.)(\d+)\.(\d+)(?!\d|\.\d)/gu, "$1,$2");
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
