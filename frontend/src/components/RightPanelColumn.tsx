/* La columna del panel del paso, plegable a una tira de 28 px.

   Plegada no se desmonta: solo se oculta. Una nota a medio escribir, un
   desplegable abierto o el scroll del panel siguen donde estaban al volver;
   desmontarla los perdería sin aviso. */

import type { ReactNode } from "react";

/** Plegado o no es una manera de trabajar de quien mira, como el nivel del HUD. */
export const PREF_PANEL_COLLAPSED = "ws.panelCollapsed";

export function RightPanelColumn({
  collapsed,
  onToggle,
  stepLabel,
  badge,
  children,
}: {
  collapsed: boolean;
  onToggle: () => void;
  stepLabel: string;
  /** Algo que avisar aun plegado (p. ej. cuántas anotaciones hay). */
  badge?: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      <div
        data-panel-column
        style={{
          display: collapsed ? "none" : undefined,
          width: "clamp(300px, 27vw, 384px)", flexShrink: 0, background: "var(--background)",
          borderLeft: "1px solid var(--border)", overflowY: "auto", padding: "20px 18px 40px",
        }}
      >
        {children}
      </div>
      {collapsed && (
        <aside className="ws-panel-strip" aria-label="Panel del paso plegado">
          <button
            type="button"
            className="ws-panel-strip-btn"
            onClick={onToggle}
            aria-expanded={!collapsed}
            title="Mostrar el panel del paso (P)"
          >
            PANEL ▸ {stepLabel}
          </button>
          {badge && <div className="ws-panel-strip-badge">{badge}</div>}
        </aside>
      )}
    </>
  );
}
