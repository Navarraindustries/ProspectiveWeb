/* Estado del guardado en la barra superior del pipeline: un punto de 8 px y una
   frase. Sustituye al punto y a la hora que llevaba el botón «Guardar progreso». */

import { hora } from "../../lib/fecha";
import { TEXTO_OCULTO } from "../../styles/oculto";

export type SaveState = "saving" | "dirty" | "saved" | "clean";

/** `compacta` (táctil y móvil): el punto y un texto corto a 13 px —«12:03 ✓»,
 *  «Sin guardar», «…»— para que el estado no dependa solo del color del punto.
 *  La frase entera queda para lectores y como `title`.
 *  `punto` (móvil, R13): solo el punto; la frase va en `aria-label`, en
 *  `title` y como texto oculto (lo que anuncia la región `status`). A 360 px
 *  «Sin guardar» empujaba las acciones encima de «Volver». */
export function SaveStatus({ state, savedAt, compacta = false, punto = false }: {
  state: SaveState; savedAt?: Date | null; compacta?: boolean; punto?: boolean;
}) {
  const guardado = state === "saved" && savedAt;
  const text = state === "saving" ? "Guardando…"
    : state === "dirty" ? "Cambios sin guardar"
    : guardado ? `Guardado ${hora(guardado)}`
    : "Sin guardar";
  // Forma del punto (no solo color): anillo hueco = sin guardar, lleno = guardado, pulso = guardando.
  const forma = state === "saving" ? "pulso" : guardado ? "lleno" : "anillo";
  const corto = state === "saving" ? "…" : guardado ? `${hora(guardado)} ✓` : "Sin guardar";
  if (punto) {
    return (
      <span role="status" className="ws-save-status" data-state={state} data-punto aria-label={text} title={text}>
        <span className="ws-save-dot" data-forma={forma} aria-hidden />
        <span style={TEXTO_OCULTO}>{text}</span>
      </span>
    );
  }
  return (
    <span role="status" className="ws-save-status" data-state={state} title={compacta ? text : undefined}
          style={compacta ? { fontSize: 13 } : undefined}>
      <span className="ws-save-dot" data-forma={forma} aria-hidden />
      {compacta
        ? <>
            <span aria-hidden data-corto>{corto}</span>
            <span style={TEXTO_OCULTO}>{text}</span>
          </>
        : text}
    </span>
  );
}
