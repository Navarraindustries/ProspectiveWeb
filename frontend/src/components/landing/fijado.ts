/* UNI-132 · El dial de «Cómo funciona» se queda fijo mientras el scroll lo avanza.

   Un contenedor alto (`riel__recorrido`) da el recorrido; dentro, el dial va en
   `position: sticky` justo bajo la píldora de la nav (`DESFASE_NAV`). El
   progreso se mide sobre el contenedor desde que su borde de arriba llega al
   desfase (el dial empieza a estar fijo) hasta que su borde de abajo llega al
   fondo de la pantalla (el dial se suelta): 0 → 1 exactamente en el tramo fijo,
   así que al soltarse ya está en el último paso y no hay salto. */

import { DESFASE_NAV } from "./desplazamiento";

/** Cuánto scroll da cada paso del dial, en vh. Con 8 pasos, 7 × 45 vh. */
export const TRAMO_POR_PASO_VH = 45;

/** Lo que se deja libre alrededor del dial dentro del tramo fijo. */
const AIRE_DIAL_PX = 32;

/** Lado del dial a escala 1 (`.riel__marco[data-disposicion="horizontal"]`). */
export const LADO_DIAL_PX = 620;

/** El offset de `useScroll`: arranca cuando el contenedor toca el desfase de la
 *  nav y acaba cuando su borde de abajo toca el de la pantalla. */
export const OFFSET_FIJADO = [`start ${DESFASE_NAV}px`, "end end"] as const;

/** Alto del contenedor que da recorrido al dial. */
export function altoRecorrido(pasos: number): string {
  return `${100 + Math.max(pasos - 1, 0) * TRAMO_POR_PASO_VH}vh`;
}

/** Alto del tramo fijo (lo que se ve bajo la nav). */
export const ALTO_FIJO = `calc(100vh - ${DESFASE_NAV}px)`;

/** Px de scroll durante los que el dial está fijo, para una pantalla de
 *  `altoPantalla` px: alto del recorrido menos alto del tramo fijo. */
export function scrollFijado(pasos: number, altoPantalla: number): number {
  const recorrido = altoPantalla + (Math.max(pasos - 1, 0) * TRAMO_POR_PASO_VH * altoPantalla) / 100;
  return recorrido - (altoPantalla - DESFASE_NAV);
}

/** Escala del dial para que quepa en el tramo fijo de una pantalla baja. */
export function escalaDial(altoPantalla: number): number {
  const libre = altoPantalla - DESFASE_NAV - AIRE_DIAL_PX;
  return Math.max(0.6, Math.min(1, libre / LADO_DIAL_PX));
}
