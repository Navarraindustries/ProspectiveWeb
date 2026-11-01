/* Puntos de corte del quirófano para móvil y pantallas táctiles: re-exporta
   los comunes de `styles/puntosCorte`. L5 (≤ 1280) sigue en `hooks/useEstrecho`. */
import { CONSULTA } from "../styles/puntosCorte";

export const MQ_MOVIL = CONSULTA.movil;
export const MQ_TACTIL = CONSULTA.tableta;
/** Lado mínimo de un objetivo táctil. */
export const OBJETIVO_TACTIL_PX = 44;
