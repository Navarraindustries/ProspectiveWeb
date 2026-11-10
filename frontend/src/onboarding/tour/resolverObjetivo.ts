/* Localiza el elemento de una parada del recorrido: el primer
   [data-tour="id"] de la lista que se vea de verdad (con área y sin
   display:none ni visibility:hidden). Varios ids permiten alternativas
   por disposición (p. ej. barra lateral frente a barra inferior).
   Una alternativa «a+b» resalta varios elementos a la vez (el foco abarca
   los dos): solo vale si se ven todos; si no, se prueba la siguiente. */

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

function uno(id: string, raiz: ParentNode): HTMLElement | null {
  const seguro = id.replace(/["\\]/g, "\\$&");
  const candidatos = raiz.querySelectorAll<HTMLElement>(`[data-tour="${seguro}"]`);
  for (const el of Array.from(candidatos)) if (visible(el)) return el;
  return null;
}

/** Los elementos de la primera alternativa que se ve entera; [] si ninguna. */
export function resolverObjetivos(ids: string[], raiz: ParentNode = document): HTMLElement[] {
  for (const id of ids) {
    const partes = id.split("+").map((p) => uno(p, raiz));
    if (partes.every((el): el is HTMLElement => el !== null)) return partes;
  }
  return [];
}

export function resolverObjetivo(ids: string[], raiz: ParentNode = document): HTMLElement | null {
  return resolverObjetivos(ids, raiz)[0] ?? null;
}

/** Rectángulo que abarca todos los elementos (null si no hay ninguno). */
export function rectQueAbarca(els: HTMLElement[]): DOMRect | null {
  if (!els.length) return null;
  const rs = els.map((el) => el.getBoundingClientRect());
  if (rs.length === 1) return rs[0];
  const left = Math.min(...rs.map((r) => r.left)), top = Math.min(...rs.map((r) => r.top));
  const right = Math.max(...rs.map((r) => r.right)), bottom = Math.max(...rs.map((r) => r.bottom));
  const r = { x: left, y: top, left, top, right, bottom, width: right - left, height: bottom - top };
  return { ...r, toJSON: () => r } as DOMRect;
}
