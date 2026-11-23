/* La etiqueta de forma (Alto / Moderado / Bajo) dicha como lo que es.

   «Riesgo Alto» a secas, en la cabecera de Morfometría y en la ficha del
   paciente, se leía como riesgo de rotura —que es el PHASES— y es una etiqueta
   heurística de los índices de forma (F1-68, F1-151). */

import { Badge, riskVariant } from "../Badge";

/** El criterio que decide la etiqueta (backend/services/morphometrics.py, rupture_risk).
 *  Los cortes son los de thresholds.ts: los mismos que las insignias (F1-161). */
export const MORPHO_RISK_CRITERIA =
  "Etiqueta de forma, no una probabilidad de rotura: una regla de umbrales sin validar como " +
  "predicción. Alto si AR ≥ 1,6, DNR ≥ 2,0, " +
  "ondulación ≥ 0,25 o cociente de tamaño ≥ 3,0; Moderado si AR ≥ 1,2, DNR ≥ 1,6, " +
  "elipticidad ≥ 0,35, ondulación ≥ 0,10 o cociente de tamaño ≥ 2,0; si no, Bajo.";

/** La etiqueta solo si hay algún índice de forma medido (volumen o cuello
 *  válidos; las medidas antiguas solo traen `reliable`). Sin ninguno el backend
 *  manda «Bajo» con los índices a cero, y la cabecera decía «Forma: bajo»
 *  mientras el panel decía «Sin medir» (F1-151, Case 3 22-11). */
export function etiquetaFormaMedida(m: {
  rupture_risk_label?: string | null; reliable?: boolean;
  volume_valid?: boolean | null; neck_valid?: boolean | null;
} | null | undefined): string | null {
  if (!m) return null;
  const medido = (m.volume_valid ?? m.reliable) || (m.neck_valid ?? m.reliable);
  return medido ? (m.rupture_risk_label ?? null) : null;
}

/** `corto`: «Forma: alto», para la barra superior y las miniaturas (P16: allí
 *  salía «Alto» o «Riesgo alto» a secas, sin decir de qué). */
export function MorphoRiskBadge({ label, measured = true, corto = false }: {
  label: string; measured?: boolean; corto?: boolean;
}) {
  if (!measured) {
    return (
      <span title="Sin índices de forma medidos no hay etiqueta: marca el cuello para medir el saco.">
        <Badge variant="outline">Sin medir</Badge>
      </span>
    );
  }
  return (
    <span title={MORPHO_RISK_CRITERIA}>
      <Badge variant={riskVariant(label)}>
        {corto ? `Forma: ${label.toLowerCase()}` : `Riesgo morfométrico ${label.toLowerCase()}`}
      </Badge>
    </span>
  );
}
