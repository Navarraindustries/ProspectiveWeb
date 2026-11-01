/* Estado del guardado en la barra superior del pipeline: un punto de 8 px y una
   frase. Sustituye al punto y a la hora que llevaba el botón «Guardar progreso». */

import { hora } from "../../lib/fecha";
import { TEXTO_OCULTO } from "../../styles/oculto";

export type SaveState = "saving" | "dirty" | "saved" | "clean";

/** `compacta` (táctil y móvil): el punto y un texto corto a 13 px —«12:03 ✓»,
 *  «Sin guardar», «…»— para que el estado no dependa solo del color del punto.
 *  La frase entera queda para lectores y como `title`. */
export function SaveStatus({ state, savedAt, compacta = false }: { state: SaveState; savedAt?: Date | null; compacta?: boolean }) {
  const guardado = state === "saved" && savedAt;
  const text = state === "saving" ? "Guardando…"
    : state === "dirty" ? "Cambios sin guardar"
    : guardado ? `Guardado ${hora(guardado)}`
    : "Sin guardar";
  const corto = state === "saving" ? "…" : guardado ? `${hora(guardado)} ✓` : "Sin guardar";
  return (
    <span role="status" className="ws-save-status" data-state={state} title={compacta ? text : undefined}
          style={compacta ? { fontSize: 13 } : undefined}>
      <span className="ws-save-dot" aria-hidden />
      {compacta
        ? <>
            <span aria-hidden data-corto>{corto}</span>
            <span style={TEXTO_OCULTO}>{text}</span>
          </>
        : text}
    </span>
  );
}
