import type { ReactNode } from "react";

/** Marco HUD: cuatro marcas de esquina, rótulo arriba y lo que se le meta dentro. */
export function HudFrame({ active = false, label, children }: { active?: boolean; label?: string; children?: ReactNode }) {
  return (
    <div className={`hud${active ? " active" : ""}`} aria-hidden={label ? undefined : true}>
      <span className="hud-corner tl" /><span className="hud-corner tr" />
      <span className="hud-corner bl" /><span className="hud-corner br" />
      {label && <span className="hud-label">{label}</span>}
      {children}
    </div>
  );
}
