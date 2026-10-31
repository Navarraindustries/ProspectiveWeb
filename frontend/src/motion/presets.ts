import type { Variants } from "motion/react";
import { DUR, EASE } from "./tokens";

export { DUR, EASE };

// Prensado de botones: respuesta inmediata al pulsar.
export const pressable = {
  whileTap: { scale: 0.98 },
  transition: { duration: DUR.respuesta, ease: EASE },
};

// Cruce de paneles (pestañas): entra 8 px desde la derecha y sale 8 px a la izquierda.
export const panelSwap: Variants = {
  initial: { opacity: 0, x: 8 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -8 },
};
export const panelTransition = { duration: DUR.estado, ease: EASE };

// Hoja lateral: desliza desde el borde derecho.
export const sheetSlide: Variants = {
  initial: { x: "100%" },
  animate: { x: 0 },
  exit: { x: "100%" },
};
export const sheetTransition = { duration: DUR.panel, ease: EASE };

// Velo detrás de la hoja.
export const scrimFade: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};
