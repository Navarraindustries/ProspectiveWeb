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
