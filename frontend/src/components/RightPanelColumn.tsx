/* El inspector flotante del paso: cristal sobre la imagen, plegable a una pastilla.

   Plegada no se desmonta: solo se oculta. Una nota a medio escribir, un
   desplegable abierto o el scroll del panel siguen donde estaban al volver;
   desmontarla los perdería sin aviso. */

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./Icon";
import { BottomSheet, type AlturaHoja } from "./BottomSheet";
import { AnimatePresence, motion, panelSwap, panelTransition } from "../motion";
import { glass } from "../styles/glass";
import { BANDA_SUPERIOR, MARGEN_INSPECTOR } from "../pipeline/zonaLibre";

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
  stepIndex,
  stepKey,
  wide,
  badge,
  estrecho = false,
  altura = "media",
  onAltura = () => {},
  children,
}: {
  collapsed: boolean;
  onToggle: () => void;
  stepLabel: string;
  /** Posición del paso (desde 0) para el rótulo «PASO n». */
  stepIndex: number;
  /** Identifica el paso: al cambiar, el cuerpo cruza en fundido. */
  stepKey: string;
  /** Pasos con tablas o informe: 520 px en vez de 380. */
  wide: boolean;
  /** Algo que avisar aun plegado (p. ej. cuántas anotaciones hay). */
  badge?: ReactNode;
  /** Pantalla de hasta 1280 px: el panel va en una hoja inferior en vez de flotar a la derecha. */
  estrecho?: boolean;
  altura?: AlturaHoja;
  onAltura?: (a: AlturaHoja) => void;
  children: ReactNode;
}) {
  /* El cuerpo se pinta una sola vez, en un nodo propio (`host`) que se mueve entre
     el panel flotante y la hoja. Dos copias, o un cambio de tipo de contenedor,
     desmontarían los campos y perderían lo escrito y el scroll. */
  const [host] = useState(() => {
    const d = document.createElement("div");
    d.style.cssText = "flex:1;min-height:0;min-width:0;display:flex;flex-direction:column";
    return d;
  });
  const [ranuraPanel, setRanuraPanel] = useState<HTMLElement | null>(null);
  const [ranuraHoja, setRanuraHoja] = useState<HTMLElement | null>(null);
  // El scroll se pierde al desprender el nodo: se anota en cada render, antes de mover nada.
  const scrollAnotado = useRef(0);
  if (host.isConnected) scrollAnotado.current = host.querySelector<HTMLElement>(".ws-panel-body")?.scrollTop ?? 0;
  const destino = estrecho ? ranuraHoja : ranuraPanel;
  useLayoutEffect(() => {
    if (!destino || host.parentElement === destino) return;
    destino.appendChild(host);
    const cuerpo = host.querySelector<HTMLElement>(".ws-panel-body");
    if (cuerpo) cuerpo.scrollTop = scrollAnotado.current;
  }, [destino, host]);

  const ranura = (ref: (el: HTMLDivElement | null) => void) => (
    <div ref={ref} style={{ flex: 1, minHeight: 0, minWidth: 0, display: "flex", flexDirection: "column" }} />
  );

  const cuerpo = createPortal(
    <>
      <div
        style={{
          flex: "none", padding: "14px 18px 0", fontFamily: "var(--font-mono)",
          fontSize: "var(--text-eyebrow)", letterSpacing: "var(--tracking-eyebrow)",
          color: "var(--muted-foreground)",
        }}
      >
        {`Paso ${stepIndex + 1} · ${stepLabel}`.toLocaleUpperCase("es")}
      </div>
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
    </>,
    host,
  );

  if (estrecho) {
    return (
      <>
        <BottomSheet altura={altura} onAltura={onAltura} titulo="Panel del paso">
          {ranura(setRanuraHoja)}
        </BottomSheet>
        {cuerpo}
      </>
    );
  }

  return (
    <>
      <div
        data-panel-column
        data-panel-wide={wide ? "true" : "false"}
        style={{
          display: collapsed ? "none" : "flex",
          position: "absolute", top: BANDA_SUPERIOR, right: MARGEN_INSPECTOR, bottom: MARGEN_INSPECTOR,
          width: wide ? 520 : 380, zIndex: 2,
          transition: "width var(--dur-2) var(--ease-out)",
        }}
      >
        {/* Pestaña pegada al borde izquierdo del panel: pliega sin buscar la tecla P. */}
        <button type="button" className="ws-panel-fold" onClick={onToggle}
                aria-label="Plegar el panel del paso (P)" title="Plegar el panel del paso (P)">
          <Icon name="CHEVRON_RIGHT" size={14} />
        </button>
        <div
          data-glass
          style={{
            ...glass("dense"),
            flex: 1, minWidth: 0, borderRadius: "var(--radius-xl)", overflow: "hidden", minHeight: 0,
            display: "flex", flexDirection: "column",
          }}
        >
          {ranura(setRanuraPanel)}
        </div>
      </div>
      {cuerpo}
      {collapsed && (
        <aside className="ws-panel-strip" aria-label="Panel del paso plegado" data-glass
               style={{ ...glass("dense"), top: BANDA_SUPERIOR, right: MARGEN_INSPECTOR }}>
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
