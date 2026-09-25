/** Cinta de rumbo: azimut y elevación de la cámara respecto al paciente. */
const POINTS: [number, string][] = [[0, "ANT"], [90, "IZQ"], [180, "POST"], [-90, "DER"]];

export function HudHeadingTape({ azimuthDeg, elevationDeg, known }: { azimuthDeg: number; elevationDeg: number; known: boolean }) {
  const wrap = (s: string) => (known ? s : `[${s}]`);
  const norm = (a: number) => ((a + 540) % 360) - 180;
  const pxPerDeg = 2;
  return (
    <div style={{ position: "absolute", top: 6, left: "20%", right: "20%", height: 22, overflow: "hidden", borderBottom: "var(--hud-line) solid var(--hud-dim)" }}>
      {POINTS.map(([deg, name]) => {
        const off = norm(deg - azimuthDeg) * pxPerDeg;
        return (
          <span key={name} style={{ position: "absolute", left: `calc(50% + ${off}px)`, transform: "translateX(-50%)", top: 2, fontSize: 10, letterSpacing: ".08em", color: Math.abs(off) < 8 ? "var(--hud)" : "var(--hud-dim)" }}>
            {wrap(name)}
          </span>
        );
      })}
      <span style={{ position: "absolute", left: "50%", top: 0, width: 1, height: 22, background: "var(--hud)" }} />
      <span style={{ position: "absolute", right: 0, top: 3, fontSize: 10, color: "var(--hud-dim)" }}>
        AZ {Math.round(norm(azimuthDeg))}° · EL {Math.round(elevationDeg)}°
      </span>
    </div>
  );
}
