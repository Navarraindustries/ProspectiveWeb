/** Una línea de lectura: texto, o texto con la muestra del color con el que
 *  la escena dibuja lo que nombra (el color es dato de la escena, no cromo). */
export type HudLine = string | { text: string; color: string };

export function HudReadout({ at, lines, tone }: { at: "tl" | "tr" | "bl" | "br"; lines: HudLine[]; tone?: "warn" | "err" }) {
  return (
    <div className={`hud-readout ${at}${tone ? ` hud-${tone}` : ""}`}>
      {lines.map((l, i) => (
        <span key={i}>
          {i > 0 && "\n"}
          {typeof l === "string" ? l : (
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
