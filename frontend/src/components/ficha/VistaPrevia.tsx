/* Vista previa — la última columna de la ficha en cascada: la sesión guardada
   elegida con la miniatura de su estudio (o «Sin vista previa»), el paso en el
   que se guardó, el diámetro máximo y el riesgo si se midieron, y «Reanudar»
   como acción principal. */

import type { PatientSessionInfo, StudyCard } from "../../api/types";
import { fechaHora } from "../../lib/fecha";
import { STEP_LABELS, clampStep } from "../../pipeline/steps";
import { Button } from "../Button";
import { Icon } from "../Icon";
import { MorphoRiskBadge } from "../morphometry/MorphoRiskBadge";
import { MiniaturaEstudio } from "./ColumnaEstudios";
import { etiquetaGuardada, milimetros } from "./ColumnaSesiones";
import "./ficha.css";

/** F1-69: qué hace «Reanudar» y que no es instantáneo (copia cientos de MB). */
const reanudarTitle = (paso: string) =>
  `Vuelve a abrir la sesión en «${paso}» con lo que tenía guardado: el estudio, la segmentación, la detección, las medidas y la decisión. Tarda unos segundos.`;

export function VistaPrevia({
  sesion,
  estudio,
  nombrePaciente,
  onResume,
}: {
  sesion: PatientSessionInfo;
  /** El estudio de imagen de la sesión, si se conoce (null = sin vista previa). */
  estudio: StudyCard | null;
  nombrePaciente: string;
  /** Sin él (no se sabe a qué paciente llevarla) no hay «Reanudar». */
  onResume?: (sessionId: string) => void;
}) {
  const step = clampStep(sesion.current_step);
  const paso = STEP_LABELS[step];
  return (
    <div className="fc-vista">
      <MiniaturaEstudio estudio={estudio} grande />
      <h3 className="fc-vista-nombre">{etiquetaGuardada(sesion, nombrePaciente)}</h3>
      <div className="fc-vista-datos">
        <span>{`Paso ${step + 1} · ${paso}`}</span>
        {sesion.max_diameter_mm != null && (
          <span>{`Ø máximo ${milimetros(sesion.max_diameter_mm)}`}</span>
        )}
        <span className="fc-fila-meta fc-fila-mono">{`Guardada ${fechaHora(sesion.updated_at)}`}</span>
      </div>
      {sesion.rupture_risk_label && (
        <div><MorphoRiskBadge label={sesion.rupture_risk_label} /></div>
      )}
      {onResume && (
        <Button type="button" leadingIcon={<Icon name="RESUME" />} title={reanudarTitle(paso)}
                onClick={() => onResume(sesion.session_id)}>
          Reanudar
        </Button>
      )}
    </div>
  );
}
