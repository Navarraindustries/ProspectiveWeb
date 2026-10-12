/* La etiqueta de forma (Alto / Moderado / Bajo) dicha como lo que es.

   «Riesgo Alto» a secas, en la cabecera de Morfometría y en la ficha del
   paciente, se leía como riesgo de rotura —que es el PHASES— y es una etiqueta
   heurística de los índices de forma (F1-68, F1-151). */

import { Badge, riskVariant } from "../Badge";

/** El criterio que decide la etiqueta (backend/services/morphometrics.py, rupture_risk). */
export const MORPHO_RISK_CRITERIA =
  "Etiqueta de forma, no una probabilidad de rotura. Alto si AR ≥ 1,6, DNR ≥ 2,0, " +
  "ondulación ≥ 0,25 o cociente de tamaño ≥ 3,0; Moderado si AR ≥ 1,3, DNR ≥ 1,6, " +
  "elipticidad ≥ 0,35, ondulación ≥ 0,10 o cociente de tamaño ≥ 2,0; si no, Bajo.";

export function MorphoRiskBadge({ label, measured = true }: { label: string; measured?: boolean }) {
  if (!measured) {
    return (
      <span title="Sin índices de forma medidos no hay etiqueta: marca el cuello para medir el saco.">
        <Badge variant="outline">Sin medir</Badge>
      </span>
    );
  }
  return (
    <span title={MORPHO_RISK_CRITERIA}>
      <Badge variant={riskVariant(label)}>{`Riesgo morfométrico ${label.toLowerCase()}`}</Badge>
    </span>
  );
}
