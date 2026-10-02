/* Las cinco vistas del visor como opciones del selector «PRINCIPAL». El rótulo
   es corto porque va en la cabecera junto a los presets; el título explica. */
import type { PaneId } from "./layout";
export const MAIN_LABELS: Record<PaneId, string> = { scene: "3D", axial: "AX", coronal: "COR", sagital: "SAG", mip: "VOL" };
const ORDER: PaneId[] = ["scene", "axial", "coronal", "sagital", "mip"];
const TITLES: Record<PaneId, string> = {
  scene: "Hacer principal la escena 3D", axial: "Hacer principal el corte axial", coronal: "Hacer principal el corte coronal",
  sagital: "Hacer principal el corte sagital", mip: "Hacer principal la vista de volumen (MIP / compuesto)",
};
export function mainOptions() { return ORDER.map((key) => ({ key, label: MAIN_LABELS[key], title: TITLES[key] })); }

/* Por debajo de 800 px de banda de cabecera (un portátil de 1280 deja ~740
   entre el flujo y el panel lateral) los dos grupos no caben enteros: los
   presets se abrevian para ganar sitio. El título sigue diciendo el nombre. */
export const NARROW_HEADER_PX = 800;
export function presetOptions(bandWidth: number) {
  const short = bandWidth < NARROW_HEADER_PX;
  return [
    { key: "derecha", label: short ? "DER" : "DERECHA", title: "Vista principal y las otras cuatro en columna (Alt+2)" },
    { key: "abajo", label: short ? "ABA" : "ABAJO", title: "Vista principal y las otras cuatro en franja (Alt+3)" },
    { key: "cuatro", label: short ? "4" : "CUATRO", title: "Axial, coronal, sagital y 3D a cuartos (Alt+4)" },
    { key: "sola", label: "SOLA", title: "Solo la vista principal (Alt+1)" },
  ];
}

/** Rótulo del selector de la principal: «PRINCIPAL» con sitio, «▸» en una
 *  banda estrecha (el título del elemento dice «Vista principal»). */
export function headerLabels(bandWidth: number) {
  return { mainCaption: bandWidth < NARROW_HEADER_PX ? "▸" : "PRINCIPAL" };
}
