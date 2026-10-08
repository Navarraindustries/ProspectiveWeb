import { useEffect, useRef, useState } from "react";
import { indexAtY, ladderTicks } from "./ladder";

/** Cinta vertical de cortes en el borde derecho, como la escalera de altitud.
 *  Con `onIndexChange` se puede pulsar o arrastrar: el corte bajo el puntero es
 *  el nuevo índice. */
export function HudLadder({ count, index, onIndexChange }: { count: number; index: number; onIndexChange?: (i: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const grabbed = useRef<number | null>(null);
  const [h, setH] = useState(0);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const ro = new ResizeObserver(() => setH(el.clientHeight));
    ro.observe(el); setH(el.clientHeight);
    return () => ro.disconnect();
  }, []);
  const ticks = h > 0 ? ladderTicks(count, index, h) : [];
  // El centro de la escalera es el índice ACTUAL: al arrastrar, el índice
  // cambia y el centro se mueve con él, así el gesto recorre los cortes
  // (scrub) en vez de quedarse en la posición del primer clic.
  const emit = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    onIndexChange?.(indexAtY(e.clientY - r.top, count, index, h));
  };
  return (
    <div ref={ref} className="hud-decor hud-ladder"
      onPointerDown={onIndexChange ? (e) => {
        if (e.button !== 0 || h <= 0) return;
        // La escalera es suya: que la celda no lo tome como arrastre de ventana/nivel.
        e.preventDefault(); e.stopPropagation();
        e.currentTarget.setPointerCapture(e.pointerId); grabbed.current = e.pointerId;
        // preventDefault anula los eventos de ratón de compatibilidad y con ellos el foco: sin
        // esto las teclas de página no responderían tras arrastrar hasta el siguiente clic.
        (e.currentTarget.closest("[tabindex]") as HTMLElement | null)?.focus({ preventScroll: true });
        emit(e);
      } : undefined}
      onPointerMove={onIndexChange ? (e) => { if (grabbed.current === e.pointerId) emit(e); } : undefined}
      onPointerUp={(e) => { if (grabbed.current === e.pointerId) grabbed.current = null; }}
      onLostPointerCapture={(e) => { if (grabbed.current === e.pointerId) grabbed.current = null; }}
      onMouseDown={onIndexChange ? (e) => e.stopPropagation() : undefined}
      style={{ position: "absolute", right: 0, top: 24, bottom: 24, width: 44, overflow: "hidden",
        ...(onIndexChange ? { pointerEvents: "auto", cursor: "ns-resize", touchAction: "none" } : null) }}>
      {ticks.map((t) => (
        <span key={t.index} style={{ position: "absolute", right: 0, top: t.y, width: t.major ? 14 : 7, height: 1, background: "var(--hud-dim)" }}>
          {t.major && <span style={{ position: "absolute", right: 16, top: -6, fontSize: 9, color: "var(--hud-dim)" }}>{t.index + 1}</span>}
        </span>
      ))}
      <span style={{ position: "absolute", right: 4, top: h / 2 - 8, padding: "1px 4px", fontSize: 10, color: "var(--hud)", border: "var(--hud-line) solid var(--hud)", background: "#000" }}>
        {index + 1}
      </span>
    </div>
  );
}
