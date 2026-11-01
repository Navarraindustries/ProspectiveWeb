import { useCallback, useRef, useState } from "react";
import { HudHeadingTape } from "./HudHeadingTape";
import { headingPlacement } from "./headingPlacement";

/* Capa sin altura que mide el ancho de la celda y coloca la cinta de rumbo
   fuera de las lecturas, o la omite si no cabe. */
export function HudHeadingSlot({ tl, tr, azimuthDeg, elevationDeg, known }: {
  tl: string[]; tr: string[]; azimuthDeg: number; elevationDeg: number; known: boolean;
}) {
  // Sin medida (jsdom, oculta) se asume ancho: como en ViewerHeader.
  const [width, setWidth] = useState(Number.POSITIVE_INFINITY);
  const obs = useRef<ResizeObserver | null>(null);
  const ref = useCallback((el: HTMLDivElement | null) => {
    obs.current?.disconnect();
    obs.current = null;
    if (!el || typeof ResizeObserver === "undefined") return;
    const medir = () => setWidth(el.clientWidth > 0 ? el.clientWidth : Number.POSITIVE_INFINITY);
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    obs.current = ro;
    medir();
  }, []);
  const p = headingPlacement(width, tl, tr);
  return (
    <div ref={ref} data-testid="heading-slot" style={{ position: "absolute", top: 0, left: 0, right: 0, height: 0, pointerEvents: "none" }}>
      {p && (
        <HudHeadingTape azimuthDeg={azimuthDeg} elevationDeg={elevationDeg} known={known}
          top={p.top} left={Math.round(p.left)} right={Math.round(p.right)} />
      )}
    </div>
  );
}
