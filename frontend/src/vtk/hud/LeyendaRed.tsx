/* La leyenda de la red de vasos (redVasos.ts): cuántos tramos y bifurcaciones
   tiene y cuánto mide en total. Mientras el servidor la calcula lo dice; si
   falla, lo explica. Va en la columna de leyendas (LeyendasEscena). */
import type { VesselNetworkResult } from "../../api/types";
import { cifra } from "../../lib/numero";

export type EstadoRed = { estado: "cargando" } | { estado: "error" } | { estado: "listo"; resumen: VesselNetworkResult };

const CAJA = { position: "static" } as const;

export function LeyendaRed({ red }: { red: EstadoRed }) {
  if (red.estado === "cargando") {
    return <div className="hud-readout" style={CAJA} role="status">RED · trazando los ejes del árbol…</div>;
  }
  if (red.estado === "error") {
    return <div className="hud-readout hud-warn" style={{ ...CAJA, color: "var(--hud-amber)" }} role="status">RED · no se pudo extraer</div>;
  }
  const r = red.resumen;
  return (
    <div className="hud-readout" style={CAJA} data-testid="leyenda-red"
         aria-label={`Red de vasos: ${r.tramos} tramos, ${r.uniones} bifurcaciones, ${cifra(r.largo_total_mm, 0)} mm en total.`}>
      RED · {r.tramos} tramos · {r.uniones} bifurcaciones · {cifra(r.largo_total_mm, 0)} mm
    </div>
  );
}
