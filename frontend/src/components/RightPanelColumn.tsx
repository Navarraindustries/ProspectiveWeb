/* La columna del panel del paso, plegable a una tira de 28 px.

   Plegada no se desmonta: solo se oculta. Una nota a medio escribir, un
   desplegable abierto o el scroll del panel siguen donde estaban al volver;
   desmontarla los perdería sin aviso. */

import { useEffect, type ReactNode } from "react";

/** Plegado o no es una manera de trabajar de quien mira, como el nivel del HUD. */
export const PREF_PANEL_COLLAPSED = "ws.panelCollapsed";

/** Plegado efectivo de la columna: una nota que espera el foco la despliega.

    WHY: un marcador recién puesto pide el foco para su nota (spec E2 §3); con
    la columna en display:none el campo no puede recibirlo y lo tecleado iría a
    los atajos del visor. En el mismo render en que llega la petición la
    columna ya se pinta visible (así el efecto del panel encuentra el campo
    enfocable), y el efecto deja el panel desplegado de forma duradera. */
export function useUnfoldForNote(
  collapsed: boolean,
  setCollapsed: (v: boolean) => void,
  noteFocusRequest: string | null,
): boolean {
  useEffect(() => {
    if (noteFocusRequest !== null) setCollapsed(false);
  }, [noteFocusRequest, setCollapsed]);
  return collapsed && noteFocusRequest === null;
}

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
