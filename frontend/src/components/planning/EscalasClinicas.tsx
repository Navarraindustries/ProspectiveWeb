/* Escalas de riesgo (PHASES, ELAPSS, UIATS) en el paso Decisión.

   Estaban como pestañas de Morfometría, mezcladas con las medidas de forma,
   aunque no son morfometría: piden datos del paciente y se usan para decidir
   (auditoría F3, fila «Métricas, Índices, PHASES, ELAPSS, UIATS, Seguimiento»;
   decidido el 11-11). Morfometría se queda con Métricas, Índices y Seguimiento.
   Los calculadores son los mismos; aquí solo cambia dónde se montan. */

import { useState } from "react";
import { Tabs } from "../Tabs";
import { usePlanning } from "../../store/planning";
import { isProvisional } from "../morphometry/diameterCut";
import { PhasesCalculator } from "../morphometry/PhasesCalculator";
import { ElapssCalculator } from "../morphometry/ElapssCalculator";
import { UiatsCalculator } from "../morphometry/UiatsCalculator";

export const ESCALAS = ["PHASES", "ELAPSS", "UIATS"] as const;
type Escala = (typeof ESCALAS)[number];

export function EscalasClinicas() {
  const planning = usePlanning();
  const { sessionId } = planning;
  const m = planning.morphometry;
  const [tab, setTab] = useState<Escala>("PHASES");
  if (!m) return null;
  // Mismo criterio que tenía Morfometría: una medida que incluye vaso padre es
  // provisional, y el Ø del cuerpo se ofrece aparte.
  const provisional = isProvisional(m.warning);
  const bodyMm = m.body_max_diameter_mm ?? null;
  return (
    <div>
      <Tabs tabs={ESCALAS} value={tab} onChange={(t) => setTab(t as Escala)} />
      <div style={{ marginTop: 12 }}>
        {tab === "PHASES" && (
          <PhasesCalculator maxDiameterMm={m.max_diameter_mm} sessionId={sessionId}
                            bodyDiameterMm={bodyMm} provisional={provisional} />
        )}
        {tab === "ELAPSS" && (
          <ElapssCalculator maxDiameterMm={m.max_diameter_mm} sessionId={sessionId} dob={planning.patient?.dob}
                            bodyDiameterMm={bodyMm} provisional={provisional}
                            measuredUi={m.volume_valid ? m.ui : null} />
        )}
        {tab === "UIATS" && (
          <UiatsCalculator m={m} sessionId={sessionId} dob={planning.patient?.dob} />
        )}
      </div>
    </div>
  );
}
