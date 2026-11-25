/* UX-5: con una hoja o un diálogo abiertos, el tabulador salía de ellos y
   recorría la página de debajo, que el velo tapa. Esto lo mantiene dentro:
   del último control vuelve al primero y al revés. */

const ENFOCABLES = [
  "a[href]", "button:not([disabled])", "input:not([disabled]):not([type=\"hidden\"])",
  "select:not([disabled])", "textarea:not([disabled])", "[tabindex]:not([tabindex=\"-1\"])",
].join(", ");

export function enfocables(contenedor: HTMLElement): HTMLElement[] {
  return Array.from(contenedor.querySelectorAll<HTMLElement>(ENFOCABLES))
    .filter((el) => !el.hasAttribute("inert") && el.getAttribute("aria-hidden") !== "true");
}

/** Llamar desde el keydown del diálogo. Devuelve true si movió el foco. */
export function atraparTab(e: KeyboardEvent, contenedor: HTMLElement | null): boolean {
  if (e.key !== "Tab" || !contenedor) return false;
  const lista = enfocables(contenedor);
  if (lista.length === 0) {
    e.preventDefault();
    contenedor.focus();
    return true;
  }
  const primero = lista[0];
  const ultimo = lista[lista.length - 1];
  const activo = document.activeElement as HTMLElement | null;
  const dentro = activo != null && contenedor.contains(activo);
  if (e.shiftKey && (!dentro || activo === primero || activo === contenedor)) {
    e.preventDefault();
    ultimo.focus();
    return true;
  }
  if (!e.shiftKey && (!dentro || activo === ultimo)) {
    e.preventDefault();
    primero.focus();
    return true;
  }
  return false;
}
