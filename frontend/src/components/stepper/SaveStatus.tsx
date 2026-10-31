/* Estado del guardado en la barra superior del pipeline: un punto de 8 px y una
   frase. Sustituye al punto y a la hora que llevaba el botón «Guardar progreso». */

import { hora } from "../../lib/fecha";

export type SaveState = "saving" | "dirty" | "saved" | "clean";

export function SaveStatus({ state, savedAt }: { state: SaveState; savedAt?: Date | null }) {
  const text = state === "saving" ? "Guardando…"
    : state === "dirty" ? "Cambios sin guardar"
    : state === "saved" && savedAt ? `Guardado ${hora(savedAt)}`
    : "Sin guardar";
  return (
    <span role="status" className="ws-save-status" data-state={state}>
      <span className="ws-save-dot" aria-hidden />
      {text}
    </span>
  );
}
