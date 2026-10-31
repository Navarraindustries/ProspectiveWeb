/* La columna del panel del paso, plegable a una tira de 28 px.

   Plegada no se desmonta: solo se oculta. Una nota a medio escribir, un
   desplegable abierto o el scroll del panel siguen donde estaban al volver;
   desmontarla los perdería sin aviso. */

import { useEffect, type ReactNode } from "react";
import { Icon } from "./Icon";
import { AnimatePresence, motion, panelSwap, panelTransition } from "../motion";

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
  stepKey,
  wide,
  badge,
  children,
}: {
  collapsed: boolean;
  onToggle: () => void;
  stepLabel: string;
  /** Identifica el paso: al cambiar, el cuerpo cruza en fundido. */
  stepKey: string;
  /** Pasos con tablas o informe: 520 px en vez de 380. */
  wide: boolean;
  /** Algo que avisar aun plegado (p. ej. cuántas anotaciones hay). */
  badge?: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      <div
        data-panel-column
        data-panel-wide={wide ? "true" : "false"}
        style={{
          display: collapsed ? "none" : "flex",
          position: "relative", width: wide ? 520 : 380, flexShrink: 0,
          transition: "width var(--dur-2) var(--ease-out)",
        }}
      >
        {/* Pestaña pegada al borde izquierdo del panel: pliega sin buscar la tecla P. */}
        <button type="button" className="ws-panel-fold" onClick={onToggle}
                aria-label="Plegar el panel del paso (P)" title="Plegar el panel del paso (P)">
          <Icon name="CHEVRON_RIGHT" size={14} />
        </button>
        <div
          style={{
            flex: 1, minWidth: 0, background: "var(--background)",
            borderLeft: "1px solid var(--border)", overflow: "hidden", minHeight: 0,
            display: "flex", flexDirection: "column",
          }}
        >
          {/* Cruce en fundido entre pasos; el primer pintado no anima. */}
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={stepKey}
              className="ws-panel-body"
              variants={panelSwap}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={panelTransition}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </div>
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
