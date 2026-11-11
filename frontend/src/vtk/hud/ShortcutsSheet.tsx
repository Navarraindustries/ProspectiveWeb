/* Hoja «Atajos»: todas las teclas del visor en una tarjeta, en columnas por
   ámbito, y al final los gestos del ratón (F1-120: la rueda, el arrastre de
   celdas y del divisor y los dobles clics no estaban escritos en ningún
   sitio). Sale de la misma tabla que atiende las teclas (shortcuts.ts),
   así que no puede quedarse desfasada. Sustituye a la pista efímera que «?»
   volvía a mostrar: aquella solo enseñaba los gestos de la celda principal. */
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Icon } from "../../components/Icon";
import { useMediaQuery } from "../../hooks/useEstrecho";
import { MQ_MOVIL, MQ_TACTIL, OBJETIVO_TACTIL_PX } from "../../pipeline/puntosCorte";
import { shortcutsByScope, type Shortcut, type ShortcutScope } from "../shortcuts";

/** Con una línea debajo: «L» (todas las vistas) y «C» (solo la enfocada) no
 *  se distinguían por el título de la columna (auditoría F3). */
const HEADINGS: [ShortcutScope, string, string][] = [
  ["visor", "Visor", "todas las vistas"],
  ["celda", "Celda", "solo la vista con el foco"],
  ["flujo", "Flujo", "pasos y panel"],
  ["raton", "Ratón", "gestos sobre las vistas"],
];

/** Los ocho saltos de paso son una sola fila «1 … 8 · Ir al paso N»: ocho filas
 *  iguales salvo el número tapaban el resto de la columna. */
function rows(list: Shortcut[]): { keys: string; action: string }[] {
  const steps = list.filter((s) => s.id.startsWith("step-"));
  const out: { keys: string; action: string }[] = [];
  for (const s of list) {
    if (!s.id.startsWith("step-")) out.push(s);
    else if (s === steps[0]) out.push({ keys: `${steps[0].keys} … ${steps[steps.length - 1].keys}`, action: "Ir a ese paso del flujo" });
  }
  return out;
}

export function ShortcutsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  // Esc y «?» cierran. El «?» que la abrió no la cierra: Viewer solo ABRE con
  // «help» y deja el cierre a esta escucha (ver Viewer, sheetOpenRef).
  // La hoja es modal también para el teclado: escucha en la fase de captura
  // de `window`, antes que nadie, y se traga toda tecla salvo Tab. Si no, Esc
  // cancelaría además el modo de marcado de Workspace y los dígitos saltarían
  // de paso detrás de la hoja.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Tab") return;
      e.stopImmediatePropagation();
      if (e.key === "Escape" || e.key === "?") onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);
  // El foco entra en la tarjeta al abrir y vuelve a donde estaba al cerrar:
  // si se quedara en el cuerpo, las teclas de corte (que atiende la celda con
  // el foco) dejarían de funcionar tras cerrar la hoja.
  const cardRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    cardRef.current?.focus({ preventScroll: true });
    return () => { if (prev?.isConnected) prev.focus({ preventScroll: true }); };
  }, [open]);
  const movil = useMediaQuery(MQ_MOVIL);
  const tactil = useMediaQuery(MQ_TACTIL);
  if (!open) return null;
  const groups = shortcutsByScope();
  // En un portal a <body>: el visor vive en la zona libre del quirófano, que
  // aísla sus capas (isolation: isolate); dentro de ella su z 50 no pasaría de
  // la zona y la hoja quedaría bajo las pastillas, el dock y el inspector.
  return createPortal(
    <div data-testid="shortcuts-backdrop" onClick={onClose}
         style={{ position: "fixed", inset: 0, zIndex: 50, background: "var(--scrim)", display: "flex", alignItems: "center", justifyContent: "center", padding: movil ? 0 : 16 }}>
      <div ref={cardRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Atajos" data-movil={movil ? "true" : undefined} onClick={(e) => e.stopPropagation()}
           style={{ background: "var(--viewer-bg)", border: movil ? "none" : "1px solid var(--hud-text-dim)", color: "var(--hud-text)", fontFamily: "var(--font-mono)", fontSize: tactil ? 13 : 11, letterSpacing: ".04em", padding: "14px 18px 16px", boxSizing: "border-box", width: "100%", ...(movil ? { height: "100%" } : { maxWidth: 920 }), maxHeight: "100%", overflow: "auto", outline: "none" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <span style={{ letterSpacing: ".08em" }}>ATAJOS</span>
          <span style={{ color: "var(--hud-text-dim)", flex: 1, textAlign: "right" }}>{tactil ? "" : "ESC · ? · CLIC FUERA PARA CERRAR"}</span>
          <button type="button" aria-label="Cerrar" onClick={onClose}
                  style={{ width: tactil ? OBJETIVO_TACTIL_PX : 24, height: tactil ? OBJETIVO_TACTIL_PX : 24, display: "inline-flex", alignItems: "center", justifyContent: "center", padding: 0, background: "transparent", border: "1px solid var(--hud-text-dim)", color: "var(--hud-text)", cursor: "pointer", flexShrink: 0 }}>
            <Icon name="CLOSE" size={tactil ? 18 : 12} />
          </button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 360px), 1fr))", gap: "12px 24px" }}>
          {HEADINGS.map(([scope, title, sub]) => (
            <section key={scope}>
              <h3 style={{ margin: "0 0 6px", fontSize: tactil ? 13 : 10, fontWeight: 400, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--hud-text-dim)", borderBottom: "1px solid var(--hud-text-dim)", paddingBottom: 3 }}>{title}</h3>
              <div style={{ margin: "-3px 0 6px", fontSize: tactil ? 12 : 10, color: "var(--hud-text-dim)" }}>{sub}</div>
              <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "minmax(0, 22ch) minmax(0, 1fr)", gap: "4px 12px" }}>
                {rows(groups[scope]).map((r) => (
                  <div key={r.keys} style={{ display: "contents" }}>
                    <dt style={{ color: "var(--hud-text)" }}>{r.keys}</dt>
                    <dd style={{ margin: 0, color: "var(--hud-text-dim)" }}>{r.action}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
