/* Estado del guardado en la barra superior del pipeline: un punto de 8 px y una
   frase. Sustituye al punto y a la hora que llevaba el botón «Guardar progreso». */

import { hora } from "../../lib/fecha";

export type SaveState = "saving" | "dirty" | "saved" | "clean";

/** `compacta`: solo el punto; el texto queda para lectores y como `title`. */
export function SaveStatus({ state, savedAt, compacta = false }: { state: SaveState; savedAt?: Date | null; compacta?: boolean }) {
  const text = state === "saving" ? "Guardando…"
    : state === "dirty" ? "Cambios sin guardar"
    : state === "saved" && savedAt ? `Guardado ${hora(savedAt)}`
    : "Sin guardar";
  return (
    <span role="status" className="ws-save-status" data-state={state} title={compacta ? text : undefined}>
      <span className="ws-save-dot" aria-hidden />
      {compacta
        ? <span style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap" }}>{text}</span>
        : text}
    </span>
  );
}
