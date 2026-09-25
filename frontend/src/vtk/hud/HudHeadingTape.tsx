/** Cinta de rumbo: azimut y elevación de la cámara respecto al paciente. */
const POINTS: [number, string][] = [[0, "ANT"], [90, "IZQ"], [180, "POST"], [-90, "DER"]];

/* Ancho reservado a la derecha para «AZ …° · EL …°». La banda que se desplaza
   termina antes y recorta lo que sale por su borde: sin esa zona propia, un
   rótulo cardinal que pasaba por la derecha se pintaba debajo de la lectura. */
export const HEADING_READOUT_PX = 110;

export function HudHeadingTape({ azimuthDeg, elevationDeg, known }: { azimuthDeg: number; elevationDeg: number; known: boolean }) {
  const wrap = (s: string) => (known ? s : `[${s}]`);
  const norm = (a: number) => ((a + 540) % 360) - 180;
  const pxPerDeg = 2;
  return (
    <div style={{ position: "absolute", top: 6, left: "20%", right: "20%", height: 22, borderBottom: "var(--hud-line) solid var(--hud-dim)" }}>
      <div data-testid="heading-band" style={{ position: "absolute", top: 0, bottom: 0, left: 0, right: HEADING_READOUT_PX, overflow: "hidden" }}>
        {POINTS.map(([deg, name]) => {
          const off = norm(deg - azimuthDeg) * pxPerDeg;
          return (
            <span key={name} style={{ position: "absolute", left: `calc(50% + ${off}px)`, transform: "translateX(-50%)", top: 2, fontSize: 10, letterSpacing: ".08em", whiteSpace: "nowrap", color: Math.abs(off) < 8 ? "var(--hud)" : "var(--hud-dim)" }}>
              {wrap(name)}
            </span>
          );
        })}
        <span style={{ position: "absolute", left: "50%", top: 0, width: 1, height: 22, background: "var(--hud)" }} />
      </div>
      <span data-testid="heading-readout" style={{ position: "absolute", right: 0, width: HEADING_READOUT_PX, textAlign: "right", top: 3, fontSize: 10, whiteSpace: "nowrap", color: "var(--hud-dim)" }}>
        {wrap(`AZ ${Math.round(norm(azimuthDeg))}° · EL ${Math.round(elevationDeg)}°`)}
      </span>
    </div>
  );
}
