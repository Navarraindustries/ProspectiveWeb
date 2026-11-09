/* Localiza el elemento de una parada del recorrido: el primer
   [data-tour="id"] de la lista que se vea de verdad (con área y sin
   display:none ni visibility:hidden). Varios ids permiten alternativas
   por disposición (p. ej. barra lateral frente a barra inferior). */

function visible(el: HTMLElement): boolean {
  const r = el.getBoundingClientRect();
  if (!(r.width > 0 && r.height > 0)) return false;
  const e = el.style;
  if (e.display === "none" || e.visibility === "hidden") return false;
  if (typeof getComputedStyle === "function") {
    const c = getComputedStyle(el);
    if (c.display === "none" || c.visibility === "hidden") return false;
  }
  return true;
}

export function resolverObjetivo(ids: string[], raiz: ParentNode = document): HTMLElement | null {
  for (const id of ids) {
    const seguro = id.replace(/["\\]/g, "\\$&");
    const candidatos = raiz.querySelectorAll<HTMLElement>(`[data-tour="${seguro}"]`);
    for (const el of Array.from(candidatos)) if (visible(el)) return el;
  }
  return null;
}
