import type { ReactNode } from "react";
import type { Plane } from "../planeColors";

/** Marco HUD: cuatro marcas de esquina, rótulo arriba y lo que se le meta dentro. */
export function HudFrame({ active = false, label, labelPlane, children }: { active?: boolean; label?: string; labelPlane?: Plane; children?: ReactNode }) {
  return (
    <div className={`hud${active ? " active" : ""}`}>
      <span className="hud-corner tl" aria-hidden="true" /><span className="hud-corner tr" aria-hidden="true" />
      <span className="hud-corner bl" aria-hidden="true" /><span className="hud-corner br" aria-hidden="true" />
      {label && <span className="hud-label" data-plane={labelPlane}>{label}</span>}
      {children}
    </div>
  );
}
