/** Una línea de lectura: texto, o texto con la muestra del color con el que
 *  la escena dibuja lo que nombra (el color es dato de la escena, no cromo). */
export type HudLine = string | HudTextLine;
/** La forma objeto de la línea. Sin color no lleva muestra: el resumen bajo una
 *  leyenda (p. ej. la presión del mapa de calor del clip) no nombra nada que la
 *  escena pinte, y una muestra vacía diría que sí. */
export interface HudTextLine { text: string; color?: string }

export function HudReadout({ at, lines, tone }: { at: "tl" | "tr" | "bl" | "br"; lines: HudLine[]; tone?: "warn" | "err" }) {
  return (
    <div className={`hud-readout ${at}${tone ? ` hud-${tone}` : ""}`}>
      {lines.map((l, i) => (
        <span key={i}>
          {i > 0 && "\n"}
          {typeof l === "string" ? l : !l.color ? l.text : (
            <>
              <span
                className="hud-swatch"
                aria-hidden="true"
                style={{ display: "inline-block", width: 9, height: 9, background: l.color, border: "var(--hud-line) solid var(--hud-dim)", marginRight: 6, verticalAlign: "-1px" }}
              />
              {l.text}
            </>
          )}
        </span>
      ))}
    </div>
  );
}
