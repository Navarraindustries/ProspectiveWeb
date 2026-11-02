/* Los ocho índices de la portada y las cotas del saco que usa cada uno. Los
   cortes se importan de `thresholds`, no se copian: la portada no puede decir
   un umbral distinto del que aplica la aplicación. Cada corte con coma decimal
   y sus decimales (2,0 y no 2), vía lib/numero. */

import {
  AR_HIGH, BF_WIDE, DNR_HIGH, EI_MOD, SR_HIGH, UI_HIGH,
} from "../morphometry/thresholds";
import { cifra } from "../../lib/numero";

export type Cota = "cuello" | "altura" | "anchura" | "dmax" | "madre" | "contorno" | "elipse" | "esfera";

export const NOMBRE_COTA: Record<Cota, string> = {
  cuello: "cuello",
  altura: "altura",
  anchura: "Ø domo",
  dmax: "Ø máx",
  madre: "Ø arteria madre",
  contorno: "envolvente convexa",
  elipse: "elipse ajustada",
  esfera: "esfera de igual volumen",
};

export interface IndiceMorfo {
  abbr: string;
  titulo: string;
  detalle: string;
  cotas: readonly Cota[];
}

// El texto del BF estaba invertido (F1-162): un BF alto es un cuello
// relativamente estrecho, nunca lo contrario. El NSI no tiene corte.
export const INDICES: readonly IndiceMorfo[] = [
  { abbr: "DNR", titulo: "Relación domo-cuello (DNR)", detalle: `Ø máx / cuello · riesgo ↑ si ≥ ${cifra(DNR_HIGH, 1)}`, cotas: ["dmax", "cuello"] },
  { abbr: "AR", titulo: "Relación de aspecto (AR)", detalle: `altura de domo / cuello · riesgo ↑ si ≥ ${cifra(AR_HIGH, 1)}`, cotas: ["altura", "cuello"] },
  { abbr: "BF", titulo: "Factor de cuello (BF)", detalle: `Ø domo / cuello · cuello estrecho si > ${cifra(BF_WIDE, 1)}`, cotas: ["anchura", "cuello"] },
  { abbr: "UI", titulo: "Índice de ondulación (UI)", detalle: `irregularidad del domo · alto si ≥ ${cifra(UI_HIGH, 2)}`, cotas: ["contorno"] },
  { abbr: "EI", titulo: "Índice de elipticidad (EI)", detalle: `desviación elíptica · alto si ≥ ${cifra(EI_MOD, 2)}`, cotas: ["elipse"] },
  { abbr: "NSI", titulo: "Índice de no esfericidad (NSI)", detalle: "1 − esfericidad de Wadell · sin corte", cotas: ["esfera"] },
  { abbr: "SR", titulo: "Relación de tamaño (SR)", detalle: `Ø máx / arteria madre · alto si ≥ ${cifra(SR_HIGH, 1)}`, cotas: ["dmax", "madre"] },
  { abbr: "PHASES", titulo: "Riesgo en aneurismas no rotos", detalle: "escala de Greving et al., Lancet Neurology 2014", cotas: ["dmax"] },
];
