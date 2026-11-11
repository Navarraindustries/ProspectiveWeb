/** Cinta de rumbo: hacia qué cara del paciente mira la cámara (ANT, IZQ,
 *  POST, DER). Sin la cifra «AZ …° · EL …°»: un dato de la cámara que el
 *  clínico no usa (auditoría F3, fila «AZ · EL»; decidido el 11-11). La
 *  elevación sigue entrando para quien llame, pero ya no se pinta. */
const POINTS: [number, string][] = [[0, "ANT"], [90, "IZQ"], [180, "POST"], [-90, "DER"]];

export function HudHeadingTape({ azimuthDeg, known, top = 6, left = "20%", right = "20%" }: {
  azimuthDeg: number; elevationDeg: number; known: boolean; top?: number; left?: number | string; right?: number | string;
}) {
  const wrap = (s: string) => (known ? s : `[${s}]`);
  const norm = (a: number) => ((a + 540) % 360) - 180;
  const pxPerDeg = 2;
  return (
    <div className="hud-decor" style={{ position: "absolute", top, left, right, height: 22, borderBottom: "var(--hud-line) solid var(--hud-text-dim)" }}>
      <div data-testid="heading-band" style={{ position: "absolute", top: 0, bottom: 0, left: 0, right: 0, overflow: "hidden" }}>
        {POINTS.map(([deg, name]) => {
          const off = norm(deg - azimuthDeg) * pxPerDeg;
          return (
            <span key={name} style={{ position: "absolute", left: `calc(50% + ${off}px)`, transform: "translateX(-50%)", top: 2, fontSize: 10, letterSpacing: ".08em", whiteSpace: "nowrap", color: Math.abs(off) < 8 ? "var(--hud-text)" : "var(--hud-text-dim)" }}>
              {wrap(name)}
            </span>
          );
        })}
        <span style={{ position: "absolute", left: "50%", top: 0, width: 1, height: 22, background: "var(--hud-text)" }} />
      </div>
    </div>
  );
}
