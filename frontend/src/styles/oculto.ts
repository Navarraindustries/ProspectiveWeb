/* Texto solo para lectores de pantalla: fuera de la vista, dentro del árbol
   accesible. Un solo estilo para toda la app. */
import type { CSSProperties } from "react";

export const TEXTO_OCULTO: CSSProperties = {
  position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap",
};
