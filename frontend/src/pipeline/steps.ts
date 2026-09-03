/* Los pasos del flujo de planificación, en un solo sitio.

   Estaban escritos cuatro veces —el rail del workspace, la portada, la ficha de
   paciente y la galería de estudios— y las sesiones guardan el paso como un
   NÚMERO (`current_step`). Con cuatro listas sueltas, meter un paso en medio
   renumera unas vistas y otras no, y el botón «Reanudar» te deja en el sitio
   equivocado sin decir nada. Aquí solo hay una lista. */

import type { IconName } from "../components/Icon";

export interface PipelineStep {
  key: string;
  icon: IconName;
  label: string;
  /** Rótulo corto para la barra horizontal en pantallas estrechas. */
  short: string;
  /** Un paso opcional no impide llegar al informe: se puede saltar entero. */
  optional?: boolean;
}

export const STEPS: PipelineStep[] = [
  { key: "upload",      icon: "STEP_PATIENT", label: "Carga DICOM",   short: "Carga" },
  { key: "segment",     icon: "STEP_SEGMENT", label: "Segmentación",  short: "Segm." },
  { key: "detect",      icon: "STEP_DETECT",  label: "Detección",     short: "Detec." },
  { key: "morpho",      icon: "STEP_MORPHO",  label: "Morfometría",   short: "Morfo." },
  { key: "treatment",   icon: "STEP_PLAN",    label: "Decisión",      short: "Decis." },
  { key: "devices",     icon: "CLIPS",        label: "Dispositivos",  short: "Disp." },
  // Fabricar una pieza no es planificar un caso: pasa en semanas, con un taller
  // externo, y sigue después de que el plan esté cerrado. Por eso es su propio
  // paso y por eso es opcional — la mayoría de casos van con clip de catálogo.
  { key: "manufacture", icon: "SETTINGS",     label: "Fabricación",   short: "Fabric.", optional: true },
  { key: "report",      icon: "STEP_EXPORT",  label: "Informe",       short: "Informe" },
];

/** Etiquetas por índice, para las vistas que solo guardan el número. */
export const STEP_LABELS: string[] = STEPS.map((s) => s.label);

/** Índice del paso, por clave. -1 si no existe. */
export const stepIndex = (key: string): number => STEPS.findIndex((s) => s.key === key);
