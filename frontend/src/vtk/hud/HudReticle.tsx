/** Retícula HUD en px del contenedor. `mmPerPx` da las marcas cada 10 mm. */
export function HudReticle({ cx, cy, mmPerPx, label }: { cx: number; cy: number; mmPerPx: number; label?: string }) {
  const gap = 7;                                   // medio hueco central
  const tick = mmPerPx > 0 ? 10 / mmPerPx : 0;     // px por 10 mm
  const marks: number[] = [];
  if (tick >= 6) for (let d = tick; d < 2000; d += tick) marks.push(d);
  const line = { position: "absolute" as const, background: "var(--hud-dim)" };
  return (
    <>
      <div style={{ ...line, left: 0, width: `calc(${cx}px - ${gap}px)`, top: cy, height: 1 } as React.CSSProperties} />
      <div style={{ ...line, left: cx + gap, right: 0, top: cy, height: 1 }} />
      <div style={{ ...line, top: 0, height: `calc(${cy}px - ${gap}px)`, left: cx, width: 1 } as React.CSSProperties} />
      <div style={{ ...line, top: cy + gap, bottom: 0, left: cx, width: 1 }} />
      {marks.slice(0, 40).map((d) => (
        <span key={d}>
          <span style={{ ...line, left: cx + d, top: cy - 3, width: 1, height: 7 }} />
          <span style={{ ...line, left: cx - d, top: cy - 3, width: 1, height: 7 }} />
          <span style={{ ...line, top: cy + d, left: cx - 3, height: 1, width: 7 }} />
          <span style={{ ...line, top: cy - d, left: cx - 3, height: 1, width: 7 }} />
        </span>
      ))}
      {label && (
        <span style={{ position: "absolute", left: cx + 10, top: cy + 6, fontSize: 10, color: "var(--hud)" }}>{label}</span>
      )}
    </>
  );
}
