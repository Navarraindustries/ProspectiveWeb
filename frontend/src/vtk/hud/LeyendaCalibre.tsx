/* La leyenda del mapa de calibre (mapaCalibre.ts): la barra de color con los
   extremos de la escala y el resumen del árbol. Va en la columna de leyendas
   de arriba a la derecha (LeyendasEscena). Mientras el servidor calcula (unos
   segundos la primera vez) lo dice; si falla, el árbol se ve con su color de
   siempre y la leyenda lo explica en vez de desaparecer. */
import type { CalibreMeshResult } from "../../api/types";
import { cifra, mm } from "../../lib/numero";
import { degradadoSecuencial, RANGO_CALIBRE_MM } from "../mapaCalibre";

export type EstadoCalibre = { estado: "cargando" } | { estado: "error" } | { estado: "listo"; resumen: CalibreMeshResult };

// En flujo dentro de LeyendasEscena (que la coloca); `hud-readout` la
// posicionaría sola, así que se anula aquí.
const CAJA = {
  position: "static",
  display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3,
} as const;

export function LeyendaCalibre({ calibre }: { calibre: EstadoCalibre }) {
  const [desde, hasta] = RANGO_CALIBRE_MM;
  if (calibre.estado === "cargando") {
    return <div className="hud-readout" style={CAJA} role="status">CALIBRE · calculando el Ø local…</div>;
  }
  if (calibre.estado === "error") {
    return <div className="hud-readout hud-warn" style={{ ...CAJA, color: "var(--hud-amber)" }} role="status">CALIBRE · no se pudo calcular; se ve el árbol sin el mapa</div>;
  }
  const r = calibre.resumen;
  const texto = `Mapa de calibre: de violeta (${cifra(desde, 0)} mm) a amarillo (${cifra(hasta, 0)} mm o más). `
    + `Mediana del árbol ${mm(r.mediana_mm)}, percentil 95 ${mm(r.p95_mm)}.`;
  return (
    <div className="hud-readout" style={CAJA} role="img" aria-label={texto} data-testid="leyenda-calibre">
      <span>Ø LOCAL</span>
      <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span>{cifra(desde, 0)}</span>
        <span aria-hidden="true" style={{ display: "inline-block", width: 140, height: 8, background: degradadoSecuencial(),
                                          border: "var(--hud-line) solid var(--hud-text-dim)" }} />
        <span>{cifra(hasta, 0)}+ mm</span>
      </span>
      <span>mediana {mm(r.mediana_mm)} · p95 {mm(r.p95_mm)}</span>
    </div>
  );
}
