/* Color de marca para las escenas de la landing.

   Las escenas de three.js y los degradados de canvas no leen CSS, así que el
   azul de la identidad (`--primary`) se lee una vez por uso desde el DOM. Se
   consulta el contenedor de la landing, que fija data-theme="dark", y no el
   <html>: con el tema claro guardado, el <html> daría el azul del claro y las
   escenas, que siempre van sobre fondo oscuro, perderían contraste. */

/** Respaldo del token `--primary` oscuro (colors.css). Solo se usa si el DOM no
 *  lo resuelve (pruebas sin hoja de estilos); es la única copia del literal. */
const PRIMARY_FALLBACK = "#3B8BFF";

function primaryHex(): string {
  if (typeof document === "undefined") return PRIMARY_FALLBACK;
  const host = document.querySelector(".landing-stitch") ?? document.documentElement;
  const v = getComputedStyle(host).getPropertyValue("--primary").trim();
  return /^#[0-9a-f]{6}$/i.test(v) ? v : PRIMARY_FALLBACK;
}

/** Número 0xRRGGBB para los materiales y las luces de three.js. */
export function brandColor(): number {
  return parseInt(primaryHex().slice(1), 16);
}

/** `rgba(...)` con el azul de marca para los degradados de canvas. */
export function brandRgba(alpha: number): string {
  const n = brandColor();
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}
