/* Los nombres de las cinco vistas en la banda, y los niveles de la banda. */
import type { PaneId } from "./layout";
export const MAIN_LABELS: Record<PaneId, string> = { scene: "3D", axial: "AX", coronal: "COR", sagital: "SAG", mip: "VOLUMEN" };
/** Nombres enteros para el desplegable del nivel iconos, que sí tiene sitio. */
export const MAIN_NAMES: Record<PaneId, string> = { scene: "3D", axial: "AXIAL", coronal: "CORONAL", sagital: "SAGITAL", mip: "VOLUMEN" };

/* Niveles de la banda de cabecera según lo que mide la banda (no la ventana).
   Cifras estimadas a 11 px mono con `.08em` (≈ 7,5 px por carácter), con
   REFERENCIAS · VINCULAR · CALOR · «?» encendidos:
     ancho    ≥ 1400  las vistas y sus mandos, COMPLETO ESENCIAL LIMPIO y el
                      aviso de nivel en texto entero (≈ 1360). El
                      aviso no se recorta con elipsis en la misma fila: si no
                      cabe, el grupo derecho entero baja a una segunda fila
                      (decisión aceptada).
     medio    1100–1399  igual, pero el aviso es un botón ⚠ que despliega el
                      texto en una línea debajo (≈ 1075).
     estrecho 800–1099  mandos abreviados, C E L y el aviso ⚠ (≈ 790).
     iconos   < 800 o pantalla táctil (≤ 1024): las vistas y botones de
                      icono de 44 px en táctil (ViewerHeaderIconos).
   Si una cifra falla, la estructura de la banda (flex-wrap, grupo izquierdo
   rígido, derecho elástico) baja a otra línea en vez de pisar. El título de
   cada botón sigue diciendo el nombre entero. */
/** «PLANOS» se entendía a medias y apagarlo quita también los cruces y el
 *  teñido (auditoría F3): en radiología son «líneas de referencia». */
export const REFERENCIAS_TITLE = "Líneas de referencia en el 3D: rectángulos de los cortes, sus cruces y el teñido de la malla";

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
