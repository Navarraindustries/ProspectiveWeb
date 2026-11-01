/* Las cinco vistas del visor como opciones del selector «PRINCIPAL». El rótulo
   es corto porque va en la cabecera junto a los presets; el título explica.
   VOLUMEN va entero (F1-111): la celda se rotula «VOLUMEN» y «VOL» en la
   cabecera parecía otra vista distinta. */
import { CANONICAL_ORDER, type PaneId } from "./layout";
export const MAIN_LABELS: Record<PaneId, string> = { scene: "3D", axial: "AX", coronal: "COR", sagital: "SAG", mip: "VOLUMEN" };
const ORDER: PaneId[] = CANONICAL_ORDER;
const TITLES: Record<PaneId, string> = {
  scene: "Hacer principal la escena 3D", axial: "Hacer principal el corte axial", coronal: "Hacer principal el corte coronal",
  sagital: "Hacer principal el corte sagital", mip: "Hacer principal la vista de volumen (MIP / compuesto)",
};
export function mainOptions() { return ORDER.map((key) => ({ key, label: MAIN_LABELS[key], title: TITLES[key] })); }

/* Niveles de la banda de cabecera según lo que mide la banda (no la ventana).
   Cifras estimadas a 11 px mono con `.08em` (≈ 7,5 px por carácter), con
   PLANOS · VINCULAR · CALOR · «?» encendidos:
     ancho    ≥ 1400  PRINCIPAL, DERECHA ABAJO CUATRO SOLA, COMPLETO ESENCIAL
                      LIMPIO y el aviso de nivel en texto entero (≈ 1360). El
                      aviso no se recorta con elipsis en la misma fila: si no
                      cabe, el grupo derecho entero baja a una segunda fila
                      (decisión aceptada).
     medio    1100–1399  igual, pero el aviso es un botón ⚠ que despliega el
                      texto en una línea debajo (≈ 1075).
     estrecho 800–1099  «▸», DER ABA 4 SOLA, C E L y el aviso ⚠ (≈ 790).
     iconos   < 800 o pantalla táctil (≤ 1024): dos desplegables y botones
                      de icono de 44 px en táctil (ViewerHeaderIconos).
   Si una cifra falla, la estructura de la banda (flex-wrap, grupo izquierdo
   rígido, derecho elástico) baja a otra línea en vez de pisar. El título de
   cada botón sigue diciendo el nombre entero. */
export const WIDE_HEADER_PX = 1400;
export const NARROW_HEADER_PX = 1100;
export const ICON_HEADER_PX = 800;

export type BandTier = "ancho" | "medio" | "estrecho" | "iconos";

/** Nivel de la banda: en táctil siempre iconos (a 44 px los rótulos no caben
 *  en una fila); sin medida (Infinity) el nivel ancho, que no esconde nada. */
export function bandTier(bandWidth: number, touch: boolean): BandTier {
  if (touch) return "iconos";
  if (bandWidth >= WIDE_HEADER_PX) return "ancho";
  if (bandWidth >= NARROW_HEADER_PX) return "medio";
  if (bandWidth >= ICON_HEADER_PX) return "estrecho";
  return "iconos";
}

export function presetOptions(bandWidth: number) {
  const short = bandWidth < NARROW_HEADER_PX;
  return [
    { key: "derecha", label: short ? "DER" : "DERECHA", title: "Vista principal y las otras cuatro en columna (Alt+2)" },
    { key: "abajo", label: short ? "ABA" : "ABAJO", title: "Vista principal y las otras cuatro en franja (Alt+3)" },
    { key: "cuatro", label: short ? "4" : "CUATRO", title: "Axial, coronal, sagital y 3D a cuartos; VOLUMEN queda fuera (Alt+4)" },
    { key: "sola", label: "SOLA", title: "Solo la vista principal (Alt+1)" },
  ];
}

/** Rótulo del selector de la principal: «PRINCIPAL» con sitio, «▸» por debajo
 *  de NARROW_HEADER_PX (el título del elemento dice «Vista principal»). */
export function headerLabels(bandWidth: number) {
  return { mainCaption: bandWidth < NARROW_HEADER_PX ? "▸" : "PRINCIPAL" };
}
