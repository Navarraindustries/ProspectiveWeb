/* Los colores de las marcas de cuello, ápice y borde en la escena 3D.

   Fuera de Viewer.tsx porque el panel de Morfometría pinta la misma muestra
   junto a «Marcar cuello» y «Marcar ápice del domo» (F1-153): sin ella, en la
   escena había dos bolas y nada decía cuál era cuál. Importar Viewer.tsx desde
   el panel arrastraría vtk.js entero. */
export type Rgb = [number, number, number];

export const NECK_ORIGIN_COLOR: Rgb = [0.85, 0.35, 0.85]; // magenta — punto del plano de cuello
export const NECK_DOME_COLOR: Rgb = [0.36, 0.85, 0.86];   // cian — ápice del domo
export const NECK_RIM_COLOR: Rgb = [0.90, 0.45, 0.95];    // violeta — borde del cuello marcado

/** El mismo color en CSS, para la muestra del panel. */
export function rgbCss([r, g, b]: Rgb): string {
  return `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;
}
