/* DiameterChart — inline SVG profile of vessel diameter (mm) vs arc position
   along the centreline. Highlights the narrowest point (stenosis). Theme-aware. */
import { useRef } from "react";

// El panel lleva el cursor al punto de la línea central más cercano (remuestreada
// cada 0,5 mm), así que tras elegir una muestra el cursor puede quedar hasta
// 0,25 mm de ella; con este margen se sigue reconociendo como la elegida.
const SNAP_MM = 0.5;

export function DiameterChart({ arc, diameters, meanDiameter, onPick, cursorArcMm = null }: {
  arc: number[]; diameters: number[]; meanDiameter: number;
  /** Clic, arrastre o flechas sobre el trazado: posición en mm a lo largo del vaso (spec §7.2). */
  onPick?: (arcMm: number) => void;
  /** Dónde está el punto compartido sobre el vaso; null si no está sobre él. */
  cursorArcMm?: number | null;
}) {
  // Un clic de ratón ya eligió en el pointerdown: el click que le sigue no repite.
  const pressed = useRef(false);
  // Última muestra elegida con flechas. Si el cursor volvió al mismo punto de la
  // línea central (muestras más juntas que sus puntos), se avanza desde ella y
  // no desde el cursor, o la flecha no se movería nunca.
  const keyIdx = useRef<number | null>(null);
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
  const last = arc.length - 1;
  const clampIdx = (i: number) => Math.max(0, Math.min(last, i));
  // La muestra siguiente es la primera estrictamente más allá del cursor: con la
  // más cercana, un cursor entre dos muestras juntas volvía a la misma.
  const stepIdx = (d: 1 | -1): number => {
    if (cursorArcMm === null) return clampIdx(minIdx + d);
    const k = keyIdx.current;
    if (k !== null && k <= last && Math.abs(arc[k] - cursorArcMm) <= SNAP_MM) return clampIdx(k + d);
    const eps = 1e-6;
    if (d > 0) { const i = arc.findIndex((a) => a > cursorArcMm + eps); return i < 0 ? last : i; }
    for (let i = last; i >= 0; i--) if (arc[i] < cursorArcMm - eps) return i;
    return 0;
  };
  const onKey = (e: React.KeyboardEvent<SVGSVGElement>) => {
    if (!onPick) return;
    const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const i = stepIdx(d);
    keyIdx.current = i;
    onPick(arc[i]);
  };
  const pickAt = (e: React.MouseEvent<SVGSVGElement>) => { keyIdx.current = null; onPick?.(mmAt(e)); };
  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    pressed.current = true;
    // Capturado, el arrastre sigue aunque el ratón salga de la gráfica.
    e.currentTarget.setPointerCapture?.(e.pointerId);
    pickAt(e);
  };
  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => { if (e.buttons & 1) pickAt(e); };
  const onClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (pressed.current) { pressed.current = false; return; }
    pickAt(e);
  };

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} role={onPick ? "slider" : "img"} aria-label="Perfil de diámetro"
      aria-valuemin={x0} aria-valuemax={x1} aria-valuenow={cursorArcMm ?? undefined}
      tabIndex={onPick ? 0 : undefined} onKeyDown={onKey}
      onPointerDown={onPick ? onPointerDown : undefined} onPointerMove={onPick ? onPointerMove : undefined}
      onClick={onPick ? onClick : undefined}
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
