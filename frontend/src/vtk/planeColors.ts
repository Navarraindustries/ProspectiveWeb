/* Un color por plano de corte, el mismo en todas partes: el rótulo del corte,
   sus líneas de referencia en los otros cortes, la traza del MIP y su rectángulo
   en el 3D. Elegidos para no chocar con los colores que ya significan algo:
   ámbar (avisos), verde del HUD, magenta (cuello residual), gris (no alcanzado),
   verde del saco y dorado del clip. */
import type { Plane } from "./geometry";
export type { Plane };

export const PLANE_HEX: Record<Plane, string> = { axial: "#4cc9f0", coronal: "#80ed99", sagital: "#f4a261" };
export const PLANE_CSS_VAR: Record<Plane, string> = {
  axial: "var(--plane-axial)", coronal: "var(--plane-coronal)", sagital: "var(--plane-sagital)",
};
/** --hud: el verde del HUD, y del punto compartido de los cortes en el 3D.
 *  Una sola fuente en TypeScript; la prueba lo ata a colors.css. */
export const HUD_HEX = "#8cff9e";
/** Ámbar y verde del HUD, magenta y gris del mapa de calor, verde del saco, dorado del clip. */
export const RESERVED_HEX = ["#ffc857", HUD_HEX, "#d946ef", "#6b7280", "#40cc73", "#ebd173"];

/** «#rrggbb» a RGB 0–1, lo que piden los colores de vtk.js. */
export function hexToRgb01(hex: string): [number, number, number] {
  const h = hex.slice(1);
  return [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255];
}

export function planeRgb01(p: Plane): [number, number, number] {
  return hexToRgb01(PLANE_HEX[p]);
}

/** En un corte, la línea vertical (u) y la horizontal (v) son la huella de los
 *  otros dos planos; ver `planeCfg` en Viewer.tsx. */
export function referencePlanes(plane: Plane): { u: Plane; v: Plane } {
  if (plane === "axial") return { u: "sagital", v: "coronal" };
  if (plane === "coronal") return { u: "sagital", v: "axial" };
  return { u: "coronal", v: "axial" };
}
