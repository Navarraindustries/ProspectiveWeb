/* Hoja «Atajos»: todas las teclas del visor en una tarjeta, en tres columnas
   por ámbito. Sale de la misma tabla que atiende las teclas (shortcuts.ts),
   así que no puede quedarse desfasada. Sustituye a la pista efímera que «?»
   volvía a mostrar: aquella solo enseñaba los gestos de la celda principal. */
import { useEffect } from "react";
import { shortcutsByScope, type Shortcut, type ShortcutScope } from "../shortcuts";

const HEADINGS: [ShortcutScope, string][] = [["visor", "Visor"], ["celda", "Celda"], ["flujo", "Flujo"]];

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
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "?") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  const groups = shortcutsByScope();
  return (
    <div data-testid="shortcuts-backdrop" onClick={onClose}
         style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div role="dialog" aria-modal="true" aria-label="Atajos" onClick={(e) => e.stopPropagation()}
           style={{ background: "#000", border: "1px solid var(--hud-dim)", color: "var(--hud)", fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: ".04em", padding: "14px 18px 16px", maxWidth: 920, width: "100%", maxHeight: "100%", overflow: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
          <span style={{ letterSpacing: ".08em" }}>ATAJOS</span>
          <span style={{ color: "var(--hud-dim)" }}>ESC · ? · CLIC FUERA PARA CERRAR</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "12px 24px" }}>
          {HEADINGS.map(([scope, title]) => (
            <section key={scope}>
              <h3 style={{ margin: "0 0 6px", fontSize: 10, fontWeight: 400, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--hud-dim)", borderBottom: "1px solid var(--hud-dim)", paddingBottom: 3 }}>{title}</h3>
              <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 12px" }}>
                {rows(groups[scope]).map((r) => (
                  <div key={r.keys} style={{ display: "contents" }}>
                    <dt style={{ color: "var(--hud)", whiteSpace: "nowrap" }}>{r.keys}</dt>
                    <dd style={{ margin: 0, color: "var(--hud-dim)" }}>{r.action}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
