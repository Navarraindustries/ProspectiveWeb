/* Puntos de corte de pantalla: la única fuente. CSS los repite como número en
   cada @media (las variables no valen ahí); `puntosCorte.audit.test.ts` vigila
   que no aparezcan números sueltos. Ver también tokens/breakpoints.css. */
export const PUNTOS_CORTE = { movil: 640, tableta: 1024, estrecho: 1280, compacto: 1366, grande: 1920 } as const;

export const CONSULTA = {
  movil: "(max-width: 640px)",
  tableta: "(max-width: 1024px)",
  estrecho: "(max-width: 1280px)",
  /** Escritorio con poco sitio: hasta 1366 de ancho o 768 de alto (styles/compacto.css). */
  compacto: "(min-width: 1025px) and (max-width: 1366px), (min-width: 1025px) and (max-height: 768px)",
  grande: "(min-width: 1920px)",
} as const;

/** movil ≤ 640 < tableta ≤ 1024 < estrecho ≤ 1280 < ancho < 1920 ≤ grande */
export type Tramo = "movil" | "tableta" | "estrecho" | "ancho" | "grande";
