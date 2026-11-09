/* Velo con un hueco sobre el elemento explicado. El hueco lleva borde
   --primary y su sombra gigante pinta el velo --scrim; cuatro tiras
   transparentes alrededor bloquean los clics de fuera. Sin rect solo hay
   velo (que también bloquea). */

import type { CSSProperties } from "react";
import "./tour.css";

const MARGEN = 6;

export function Foco({ rect }: { rect: DOMRect | null }) {
  if (!rect) return <div data-foco="velo" className="tour-foco tour-velo" aria-hidden="true" />;
  const x = rect.left - MARGEN, y = rect.top - MARGEN;
  const w = rect.width + MARGEN * 2, h = rect.height + MARGEN * 2;
  const tira = (clave: string, s: CSSProperties) => <div key={clave} className="tour-tira" style={s} />;
  return (
    <div data-foco="hueco" className="tour-foco" aria-hidden="true">
      {tira("n", { left: 0, top: 0, width: "100vw", height: Math.max(0, y) })}
      {tira("s", { left: 0, top: y + h, width: "100vw", height: `calc(100vh - ${Math.max(0, y + h)}px)` })}
      {tira("o", { left: 0, top: y, width: Math.max(0, x), height: h })}
      {tira("e", { left: x + w, top: y, width: `calc(100vw - ${Math.max(0, x + w)}px)`, height: h })}
      <div className="tour-hueco" style={{ left: x, top: y, width: w, height: h }} />
    </div>
  );
}
