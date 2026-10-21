/* El Ø que entra en PHASES, ELAPSS y UIATS, y lo cerca que está de un corte.

   Case 3 mide 10,9 mm de Ø máximo y 9,5 de cuerpo: con uno el PHASES suma 10
   puntos y con el otro 7, y la pantalla daba la cifra sin decir cuál tomaba ni
   que a menos de 1 mm de un corte un error de medida cambia el tramo (F1-13,
   F1-14, F1-15). */

/* Todas las tablas de puntos y cortes viven aquí y solo aquí: el aviso de corte
   se da ANTES de «Calcular», así que si estas cifras se separan de las del
   backend la pantalla diría «baja de 10 a 7 puntos» y el cálculo otra cosa.
   backend/test_frontend_points_parity.py las lee de este archivo y las compara
   con services/phases.py, elapss.py y uiats.py. */

/** Cortes de tamaño de cada escala, en mm (backend/services/phases.py, elapss.py, uiats.py). */
export const PHASES_CUTS = [7, 10, 20] as const;
/** Puntos de tamaño PHASES por tramo: < 7, 7–9,9, 10–19,9, ≥ 20. */
export const PHASES_SIZE_PTS = [0, 3, 6, 10] as const;
export const PHASES_HTN_PTS = 1;
export const PHASES_AGE_MIN = 70;
export const PHASES_AGE_PTS = 1;
export const PHASES_SAH_PTS = 1;
export const ELAPSS_CUTS = [3, 5, 7, 10] as const;
/** UIATS usa el diámetro dos veces: puntos por diámetro y riesgo por tamaño. */
export const UIATS_DIAMETER_CUTS = [4, 7, 13, 25] as const;
export const UIATS_SIZE_RISK_CUTS = [6, 10, 20] as const;
export const UIATS_CUTS = [...new Set([...UIATS_DIAMETER_CUTS, ...UIATS_SIZE_RISK_CUTS])].sort((a, b) => a - b);

/** Distancia a un corte por debajo de la cual se avisa: el orden del error de medida. */
export const CUT_MARGIN_MM = 1;

/** «10,9»: coma decimal, como lee la cifra el clínico. */
export const mm = (x: number) => x.toFixed(1).replace(".", ",");

/** El corte más cercano a menos de 1 mm, o null. */
export function nearCut(x: number, cuts: readonly number[]): number | null {
  if (!(x > 0)) return null;
  let best: number | null = null;
  for (const c of cuts) {
    if (Math.abs(x - c) < CUT_MARGIN_MM && (best === null || Math.abs(x - c) < Math.abs(x - best))) best = c;
  }
  return best;
}

/** El corte que queda entre dos diámetros (el del cuerpo y el máximo), o null. */
export function crossedCut(a: number, b: number, cuts: readonly number[]): number | null {
  if (!(a > 0) || !(b > 0)) return null;
  const lo = Math.min(a, b), hi = Math.max(a, b);
  return cuts.find((c) => lo < c && c <= hi) ?? null;
}

/** El aviso del backend (routers/detect.py) cuando el saco aislado llega al
 *  límite del recorte: Ø, volumen e índices miden también vaso padre. */
export function isProvisional(warning: string | null | undefined): boolean {
  return !!warning && warning.includes("límite del recorte");
}

/** Puntos de tamaño PHASES (Greving 2014), los mismos que backend/services/phases.py.
 *  Se repiten aquí solo para poder decir ANTES de calcular cuántos puntos
 *  cambia el corte; la cifra que se guarda sigue saliendo del backend. */
export function phasesSizePoints(x: number): number {
  const tramo = PHASES_CUTS.filter((c) => x >= c).length;
  return PHASES_SIZE_PTS[tramo]!;
}

export const PHASES_POP_PTS = { other: 0, japan: 3, finland: 5 } as const;
export const PHASES_SITE_PTS = { ica: 0, mca: 2, aca_pcom_posterior: 4 } as const;

/** «PHASES n · x,x % a 5 años (Greving 2014)», el rótulo de Decisión y del PDF. */
export function phasesLabel(score: number, riskPct: number): string {
  return `PHASES ${score} · ${mm(riskPct)} % a 5 años (Greving 2014)`;
}
