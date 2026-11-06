/* El inspector flotante del paso: cristal sobre la imagen, plegable a una pastilla.

   Plegada no se desmonta: solo se oculta. Una nota a medio escribir, un
   desplegable abierto o el scroll del panel siguen donde estaban al volver;
   desmontarla los perdería sin aviso. */

import { useEffect, type ReactNode } from "react";
import { Icon } from "./Icon";
import { Tirador, useHojaInferior, type AlturaHoja } from "./BottomSheet";
import { AnimatePresence, motion, panelSwap, panelTransition } from "../motion";
import { tramoDePaso } from "../lib/pacientes";
import { glass } from "../styles/glass";
import { useCompacto } from "../hooks/useEstrecho";
import { anchoInspector, BANDA_SUPERIOR, MARGEN_INSPECTOR } from "../pipeline/zonaLibre";

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
  const compacto = useCompacto();
  /* Un solo contenedor en los dos modos, siempre en el mismo sitio del árbol:
     solo cambia su estilo (panel flotante a la derecha o hoja inferior). El
     cuerpo no se desmonta ni se mueve, así que cruzar 1280 px conserva el
     foco, el scroll y lo escrito. El tirador y la pestaña de borde son
     hermanos condicionales delante del cuerpo y no lo desplazan. */
  const hoja = useHojaInferior({ activa: estrecho, altura, onAltura });
  const plegada = collapsed && !estrecho;

  return (
    <>
      <section
        ref={hoja.ref}
        data-panel-column
        data-panel-wide={wide ? "true" : "false"}
        {...(estrecho
          ? { "data-glass": true, "aria-label": "Panel del paso", role: "region", tabIndex: -1 }
          : {})}
        style={estrecho ? hoja.style : {
          display: plegada ? "none" : "flex",
          position: "absolute", top: BANDA_SUPERIOR, right: MARGEN_INSPECTOR, bottom: MARGEN_INSPECTOR,
          width: anchoInspector(wide, compacto), zIndex: 2,
          transition: "width var(--dur-2) var(--ease-out)",
        }}
      >
        {estrecho ? (
          <Tirador props={hoja.tirador} />
        ) : (
          /* Pestaña pegada al borde izquierdo del panel: pliega sin buscar la tecla P. */
          <button type="button" className="ws-panel-fold" onClick={onToggle}
                  aria-label="Plegar el panel del paso (P)" title="Plegar el panel del paso (P)">
            <Icon name="CHEVRON_RIGHT" size={14} />
          </button>
        )}
        <div
          {...(estrecho ? {} : { "data-glass": true })}
          style={estrecho
            ? { flex: 1, minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column" }
            : {
              ...glass("dense"),
              flex: 1, minWidth: 0, borderRadius: "var(--radius-xl)", overflow: "hidden", minHeight: 0,
              display: "flex", flexDirection: "column",
            }}
        >
          <div
            style={{
              flex: "none", display: "flex", alignItems: "center", gap: 8,
              padding: "14px 18px 12px", fontFamily: "var(--font-mono)",
              fontSize: "var(--text-eyebrow)", letterSpacing: "var(--tracking-eyebrow)",
              color: "var(--foreground)",
            }}
          >
            <span aria-hidden="true" style={{ width: 8, height: 8, flex: "none", borderRadius: "50%", background: `var(--tramo-${tramoDePaso(stepIndex + 1)})` }} />
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
        </div>
      </section>
      {plegada && (
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
