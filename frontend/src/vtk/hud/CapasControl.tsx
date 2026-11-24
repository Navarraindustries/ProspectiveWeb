/* UNI-175: el control «Capas» de la cabecera del visor.

   Un botón que despliega una casilla por capa, y a su lado, en ámbar, cuántas
   hay ocultas: un clip escondido no debe pasar por quitado. Presentacional:
   el estado vive en el visor (ver capas.ts). */

import { useEffect, useId, useRef, useState } from "react";
import { contarOcultas, textoOcultas, type Capa, type EstadoCapa } from "../capas";

export function CapasControl({ capas, onChange, corto = false }: {
  capas: EstadoCapa[];
  onChange: (capa: Capa, visible: boolean) => void;
  /** Banda estrecha o de iconos: «CAP» y el número solo. */
  corto?: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const id = useId();
  const raiz = useRef<HTMLDivElement>(null);
  const ocultas = contarOcultas(capas);

  // Clic fuera o Escape lo pliegan.
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: PointerEvent) => { if (!raiz.current?.contains(e.target as Node)) setAbierto(false); };
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); setAbierto(false); } };
    window.addEventListener("pointerdown", fuera, true);
    window.addEventListener("keydown", tecla, true);
    return () => {
      window.removeEventListener("pointerdown", fuera, true);
      window.removeEventListener("keydown", tecla, true);
    };
  }, [abierto]);

  return (
    <div ref={raiz} className="hud-toggle hud-capas" style={{ position: "relative", display: "inline-flex", alignItems: "center", gap: 6 }}>
      <button type="button" aria-expanded={abierto} aria-controls={id} title="Qué se ve en la escena 3D: ocultar no cambia ni las medidas ni el plan"
              onClick={() => setAbierto((a) => !a)}>
        {abierto ? `[ ${corto ? "CAP" : "CAPAS"} ▾ ]` : `${corto ? "CAP" : "CAPAS"} ▾`}
      </button>
      {ocultas > 0 && (
        <span role="status" data-testid="capas-ocultas" title={textoOcultas(ocultas)}
              style={{ color: "var(--hud-amber)", fontSize: 11, letterSpacing: ".08em" }}>
          {corto ? `${ocultas} OCULTA${ocultas > 1 ? "S" : ""}` : textoOcultas(ocultas).toUpperCase()}
        </span>
      )}
      {abierto && (
        <div id={id} role="group" aria-label="Capas de la escena 3D"
             style={{ position: "absolute", top: "100%", right: 0, zIndex: 30, marginTop: 4, padding: "8px 10px", minWidth: 220,
                      display: "flex", flexDirection: "column", gap: 4, whiteSpace: "nowrap",
                      background: "var(--viewer-bg)", border: "1px solid var(--hud-text-dim)", borderRadius: 6 }}>
          {capas.map((c) => (
            <label key={c.id} title={c.disponible ? c.titulo : `${c.titulo}: no hay en este paso`}
                   style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, letterSpacing: ".04em",
                            color: c.disponible ? "var(--hud-text)" : "var(--hud-text-dim)", cursor: c.disponible ? "pointer" : "default" }}>
              <input type="checkbox" checked={c.visible} disabled={!c.disponible}
                     onChange={(e) => onChange(c.id, e.target.checked)} />
              {c.rotulo}
            </label>
          ))}
          <span style={{ fontSize: 10, color: "var(--hud-text-dim)", whiteSpace: "normal", marginTop: 4, lineHeight: 1.4 }}>
            Solo cambia lo que se ve: las medidas, el plan y el informe siguen igual.
          </span>
        </div>
      )}
    </div>
  );
}
