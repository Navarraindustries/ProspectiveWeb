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

// Planeo de superficies de cristal: entran desde abajo con un ligero escalado.
export const glide: Variants = {
  initial: { opacity: 0, scale: 0.96, y: 14 },
  animate: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.98, y: 8 },
};
export const glideTransition = { duration: DUR.panel, ease: EASE };

// Con movimiento reducido solo queda la opacidad: se funde en lugar de saltar
// (una duración 0 es un salto, no una versión sin movimiento).
export const fundido: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};
export const fundidoTransition = { duration: DUR.estado, ease: EASE };

// Lente: el elemento crece al pasar el cursor.
export const lens = {
  whileHover: { scale: 1.06 },
  transition: { duration: DUR.estado, ease: EASE },
};
export const lensCard = {
  whileHover: { scale: 1.02 },
  transition: { duration: DUR.estado, ease: EASE },
};
