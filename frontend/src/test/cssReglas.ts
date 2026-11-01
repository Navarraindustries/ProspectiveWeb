/* Lector mínimo de CSS para tests de maquetación: no valida ni calcula la
   cascada, solo localiza reglas por selector. */

export interface Regla {
  selectores: string[];
  cuerpo: string;
}

const espacios = (s: string) => s.replace(/\s+/g, " ").trim();

/* Separa por las comas de nivel superior (fuera de paréntesis y corchetes). */
function separar(lista: string): string[] {
  const salida: string[] = [];
  let nivel = 0;
  let actual = "";
  for (const c of lista) {
    if (c === "(" || c === "[") nivel++;
    else if (c === ")" || c === "]") nivel--;
    if (c === "," && nivel === 0) {
      salida.push(espacios(actual));
      actual = "";
    } else actual += c;
  }
  if (actual.trim()) salida.push(espacios(actual));
  return salida;
}

/** Cada `selector { cuerpo }` sin llaves anidadas, también dentro de un
    `@media`. Quita los comentarios. */
export function reglas(css: string): Regla[] {
  const limpio = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const salida: Regla[] = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(limpio))) {
    const cabecera = m[1].trim();
    if (cabecera.startsWith("@")) continue;
    salida.push({ selectores: separar(cabecera), cuerpo: m[2] });
  }
  return salida;
}

/** Hay una regla cuya lista contiene exactamente `selector` y cuyo cuerpo
    contiene `declaracion` (comparados sin diferencias de espacios). */
export function tieneDeclaracion(css: string, selector: string, declaracion: string): boolean {
  const sel = espacios(selector);
  const dec = espacios(declaracion);
  return reglas(css).some((r) => r.selectores.includes(sel) && espacios(r.cuerpo).includes(dec));
}
