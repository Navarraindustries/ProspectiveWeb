/* «Volver» al paso anterior, en un solo sitio.

   Workspace sabe en qué paso se está; el pie común de los paneles (PanelFooter)
   pinta el botón. Va por contexto para no pasar otro `onBack` a ocho paneles.
   Sin proveedor (un panel suelto, las pruebas) no hay botón. */

import { createContext, useContext } from "react";
import { STEPS } from "./steps";

export interface StepNav {
  /** El paso anterior, o null en el primero. */
  back: { label: string; go: () => void } | null;
}

const StepNavContext = createContext<StepNav | null>(null);

export const StepNavProvider = StepNavContext.Provider;

export function useStepNav(): StepNav | null {
  return useContext(StepNavContext);
}

/** «Volver a segmentación»: el rótulo del paso, en minúscula como en «Continuar a…».
 *  Las siglas (DICOM) no se tocan: solo baja la inicial. */
export function backLabel(stepIdx: number): string | null {
  const prev = STEPS[stepIdx - 1];
  if (!prev) return null;
  return `Volver a ${prev.label.charAt(0).toLocaleLowerCase("es")}${prev.label.slice(1)}`;
}
