/* DiameterChart — inline SVG profile of vessel diameter (mm) vs arc position
   along the centreline. Highlights the narrowest point (stenosis). Theme-aware. */

export function DiameterChart({ arc, diameters, meanDiameter, onPick, cursorArcMm = null }: {
  arc: number[]; diameters: number[]; meanDiameter: number;
  /** Clic o flechas sobre el trazado: posición en mm a lo largo del vaso (spec §7.2). */
  onPick?: (arcMm: number) => void;
  /** Dónde está el punto compartido sobre el vaso; null si no está sobre él. */
  cursorArcMm?: number | null;
}) {
  if (arc.length < 2) return null;

  const W = 320;
  const H = 150;
  const P = { t: 10, r: 10, b: 24, l: 30 };
  const iw = W - P.l - P.r;
  const ih = H - P.t - P.b;

  const x0 = arc[0];
  const x1 = arc[arc.length - 1];
  const dMin = Math.min(...diameters);
  const dMax = Math.max(...diameters);
  const yLo = Math.max(0, dMin - 0.5);
  const yHi = dMax + 0.5;

  const sx = (v: number) => P.l + ((v - x0) / (x1 - x0 || 1)) * iw;
  const sy = (v: number) => P.t + (1 - (v - yLo) / (yHi - yLo || 1)) * ih;

  const path = diameters.map((d, i) => `${i === 0 ? "M" : "L"}${sx(arc[i]).toFixed(1)},${sy(d).toFixed(1)}`).join(" ");
  const minIdx = diameters.indexOf(dMin);

  // De píxeles de pantalla a mm: el viewBox es fijo, así que el ancho real escala x.
  const mmAt = (e: React.MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const vx = ((e.clientX - r.left) / (r.width || 1)) * W;
    const f = Math.min(1, Math.max(0, (vx - P.l) / iw));
    return x0 + f * (x1 - x0);
  };
  const cursorIdx = cursorArcMm === null ? minIdx : arc.reduce((b, a, i) => (Math.abs(a - cursorArcMm) < Math.abs(arc[b] - cursorArcMm) ? i : b), 0);
  const onKey = (e: React.KeyboardEvent<SVGSVGElement>) => {
    if (!onPick) return;
    const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    onPick(arc[Math.max(0, Math.min(arc.length - 1, cursorIdx + d))]);
  };

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} role={onPick ? "slider" : "img"} aria-label="Perfil de diámetro"
      aria-valuemin={x0} aria-valuemax={x1} aria-valuenow={cursorArcMm ?? undefined}
      tabIndex={onPick ? 0 : undefined} onClick={onPick ? (e) => onPick(mmAt(e)) : undefined} onKeyDown={onKey}
      style={{ display: "block", marginTop: 8, cursor: onPick ? "crosshair" : undefined }}>
      {/* frame */}
      <line x1={P.l} y1={P.t} x2={P.l} y2={P.t + ih} stroke="var(--border)" strokeWidth={1} />
      <line x1={P.l} y1={P.t + ih} x2={P.l + iw} y2={P.t + ih} stroke="var(--border)" strokeWidth={1} />

      {/* mean reference line */}
      <line x1={P.l} y1={sy(meanDiameter)} x2={P.l + iw} y2={sy(meanDiameter)} stroke="var(--muted-foreground)" strokeWidth={1} strokeDasharray="3 3" opacity={0.5} />
      <text x={P.l + iw} y={sy(meanDiameter) - 3} textAnchor="end" fontSize={9} fill="var(--muted-foreground)">
        media {meanDiameter.toFixed(1)}
      </text>

      {/* diameter profile */}
      <path d={path} fill="none" stroke="var(--brand-mist, #8B9BAA)" strokeWidth={2} strokeLinejoin="round" />

      {/* narrowest point */}
      <circle cx={sx(arc[minIdx])} cy={sy(dMin)} r={3.5} fill="var(--destructive)" />
      <text x={sx(arc[minIdx])} y={sy(dMin) + 14} textAnchor="middle" fontSize={9} fill="var(--destructive)">
        {dMin.toFixed(1)} mm
      </text>

      {/* y ticks */}
      <text x={P.l - 4} y={sy(yLo) + 3} textAnchor="end" fontSize={9} fill="var(--muted-foreground)">{yLo.toFixed(0)}</text>
      <text x={P.l - 4} y={sy(yHi) + 3} textAnchor="end" fontSize={9} fill="var(--muted-foreground)">{yHi.toFixed(0)}</text>

      {/* x axis label */}
      <text x={P.l + iw / 2} y={H - 4} textAnchor="middle" fontSize={9} fill="var(--muted-foreground)">
        posición a lo largo del vaso (mm)
      </text>

      {/* El punto compartido sobre el vaso. */}
      {cursorArcMm !== null && (
        <line data-t="cursor" x1={sx(cursorArcMm)} y1={P.t} x2={sx(cursorArcMm)} y2={P.t + ih} stroke="var(--brand)" strokeWidth={1.5} strokeDasharray="2 2" />
      )}
    </svg>
  );
}
