/* UNI-135 · Qué variante tipográfica se está mirando.

   Las variantes (styles/tokens/variantes-tipograficas.css) cuelgan de
   `data-tipografia` en <html>. Se eligen con `?tipografia=a|b|c` en cualquier
   URL de la aplicación y se recuerdan en este navegador para poder navegar
   entre pantallas sin repetir el parámetro; `?tipografia=actual` vuelve a la
   identidad y oculta el selector. Sin parámetro y sin nada guardado no se toca
   nada: es la aplicación de siempre. */

export const VARIANTES = ["actual", "a", "b", "c"] as const;
export type Variante = (typeof VARIANTES)[number];

export const ETIQUETAS: Record<Variante, string> = {
  actual: "Actual · Inter + JetBrains Mono",
  a: "A · Helvetica",
  b: "B · Cifras de puntos",
  c: "C · Helvetica + puntos",
};

const CLAVE = "prospective.tipografia";

function esVariante(v: unknown): v is Variante {
  return typeof v === "string" && (VARIANTES as readonly string[]).includes(v);
}

/** La variante pedida en la URL, o null si no se pide ninguna (o es basura). */
export function deLaUrl(search: string): Variante | null {
  const v = new URLSearchParams(search).get("tipografia");
  return esVariante(v?.toLowerCase()) ? (v!.toLowerCase() as Variante) : null;
}

function leer(): Variante | null {
  try {
    const v = window.localStorage.getItem(CLAVE);
    return esVariante(v) ? v : null;
  } catch {
    return null;
  }
}

function guardar(v: Variante): void {
  try {
    if (v === "actual") window.localStorage.removeItem(CLAVE);
    else window.localStorage.setItem(CLAVE, v);
  } catch {
    /* Sin almacenamiento (ventana privada): vale para esta página. */
  }
}

/** Pone la variante en <html> y la recuerda. «actual» quita el atributo. */
export function aplicar(v: Variante, raiz: HTMLElement = document.documentElement): void {
  if (v === "actual") delete raiz.dataset.tipografia;
  else raiz.dataset.tipografia = v;
  guardar(v);
}

/** Al arrancar: la de la URL manda; si no hay, la guardada; si no, ninguna.
 *  Devuelve la variante activa, o null si el modo de variantes está apagado. */
export function iniciar(search: string = window.location.search): Variante | null {
  const pedida = deLaUrl(search);
  if (pedida) {
    aplicar(pedida);
    return pedida === "actual" ? null : pedida;
  }
  const guardada = leer();
  if (guardada) aplicar(guardada);
  return guardada;
}
