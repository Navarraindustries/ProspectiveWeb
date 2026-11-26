/* UX-6: dónde montar lo que flota (diálogos, hojas, menús, avisos).

   En pantalla completa el navegador solo pinta el elemento que la ocupa (la
   escena del modo presentación). Montado en document.body, un diálogo se
   abría fuera: no se veía, pero se quedaba con el foco y las teclas. */
export function destinoCapa(): HTMLElement {
  if (typeof document === "undefined") return undefined as unknown as HTMLElement;
  return (document.fullscreenElement as HTMLElement | null) ?? document.body;
}
