/* La zona libre del visor: el rectángulo del lienzo que no queda bajo el
   inspector ni bajo las pastillas superiores. El visor ocupa la pantalla
   entera del quirófano y se coloca con estos insets; solo el dock (y, en
   modo estrecho, la hoja inferior) flota encima de la imagen. */

export interface Insets { top: number; right: number; bottom: number; left: number }

/** Alto reservado arriba para las pastillas (migas, estado, acciones). */
export const BANDA_SUPERIOR = 72;
/** Margen del inspector respecto al borde derecho y a la imagen. */
export const MARGEN_INSPECTOR = 24;
/** Alto de la hoja inferior asomada (modo estrecho). */
export const HOJA_ASOMAR = 96;
/** Ancho de la tira del inspector plegado (`.ws-panel-strip` en responsive.css). */
export const ANCHO_TIRA = 36;

const INSPECTOR = 380;
const INSPECTOR_ANCHO = 520;

export function zonaLibre(o: {
  estrecho: boolean;
  plegado: boolean;
  /** Inspector de 520 px (Decisión e Informe). */
  ancho: boolean;
  /** La hoja a media o completa altura flota encima: la zona no cambia. */
  hoja?: "asomar" | "media" | "completa";
}): Insets {
  if (o.estrecho) return { top: BANDA_SUPERIOR, right: 0, bottom: HOJA_ASOMAR, left: 0 };
  // Plegado, la tira se queda en su columna: sobre el lienzo tapaba la banda
  // del visor (botón «?», VINCULAR/CALOR) y la escalera de cortes.
  const inspector = (o.plegado ? ANCHO_TIRA : o.ancho ? INSPECTOR_ANCHO : INSPECTOR) + 2 * MARGEN_INSPECTOR;
  return { top: BANDA_SUPERIOR, right: inspector, bottom: 0, left: 0 };
}
