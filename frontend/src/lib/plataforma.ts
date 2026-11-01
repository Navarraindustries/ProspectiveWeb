/* Plataforma del navegador, para rotular el atajo de la paleta: «⌘K» en macOS
   (y iOS), «Ctrl K» en el resto. Sin `window` (SSR) o con un navegador vacío
   (jsdom) cuenta como «no Mac». */

export type NavegadorMin = { platform?: string; userAgent?: string; userAgentData?: { platform?: string } };

function navegadorActual(): NavegadorMin | undefined {
  return typeof navigator === "undefined" ? undefined : (navigator as NavegadorMin);
}

/** macOS, iPhone o iPad: userAgentData.platform, si no navigator.platform, si no el userAgent. */
export function esMac(nav: NavegadorMin | undefined = navegadorActual()): boolean {
  if (!nav) return false;
  const texto = nav.userAgentData?.platform || nav.platform || nav.userAgent || "";
  return /mac|iphone|ipad|ipod/i.test(texto);
}

/** Rótulo visible del atajo: «⌘K» en Mac, «Ctrl K» en el resto. */
export function atajoPaleta(nav?: NavegadorMin): "⌘K" | "Ctrl K" {
  return esMac(nav ?? navegadorActual()) ? "⌘K" : "Ctrl K";
}

/** Nombre accesible del botón de la paleta. */
export function rotuloPaleta(nav?: NavegadorMin): string {
  return `Abrir la paleta de mandos (${esMac(nav ?? navegadorActual()) ? "⌘K" : "Ctrl+K"})`;
}

/** Valor de aria-keyshortcuts del botón de la paleta. */
export function teclasPaleta(nav?: NavegadorMin): "Meta+K" | "Control+K" {
  return esMac(nav ?? navegadorActual()) ? "Meta+K" : "Control+K";
}
