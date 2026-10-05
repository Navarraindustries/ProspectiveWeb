/* Dimensionado de flow-diverter: calibre de los anclajes y medida de catálogo.

   Lo que el neurointervencionista mide a mano antes de elegir: el vaso justo
   antes y justo después del cuello. Diámetro por el anclaje mayor, longitud
   etiquetada que cubre cuello más anclajes. No simula la trenza ni predice
   la longitud desplegada. Ver backend/services/fd_sizing.py. */

import { useState } from "react";
import { api } from "../../api/client";
import type { FdLandingZone, FdSizingResult } from "../../api/types";
import { Button } from "../Button";
import { Card, ErrorNote, SectionLabel } from "../PanelHead";

function zona(nombre: string, z: FdLandingZone) {
  return (
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 11, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: ".04em" }}>
        {nombre}
      </div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 16, fontWeight: 700 }}>
        {z.diameter_mm > 0 ? `${z.diameter_mm.toFixed(2)} mm` : "sin medir"}
      </div>
      {z.diameter_mm > 0 && (
        <div style={{ fontSize: 10.5, color: "var(--muted-foreground)" }}>
          {z.min_mm.toFixed(2)}–{z.max_mm.toFixed(2)} · {z.n_sections} cortes
        </div>
      )}
    </div>
  );
}

export function FdSizing({
  sessionId,
  onApply,
}: {
  sessionId: string;
  /** Lleva la opción elegida al despliegue sobre la línea central. */
  onApply: (diameterMm: number, startArcMm: number, endArcMm: number) => void;
}) {
  const [r, setR] = useState<FdSizingResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      setR(await api.fdSizing(sessionId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo dimensionar");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ marginBottom: 18 }}>
      <SectionLabel>Dimensionado de flow-diverter</SectionLabel>
      <div style={{ fontSize: 12, color: "var(--muted-foreground)", margin: "6px 0 10px", lineHeight: 1.5 }}>
        Mide el vaso antes y después del cuello y propone diámetro y longitud de
        cada flow-diverter del catálogo. Necesita la morfometría.
      </div>
      <Button variant="outline" style={{ width: "100%" }} onClick={() => void run()} disabled={busy}>
        {busy ? "Midiendo anclajes…" : r ? "Volver a medir" : "Dimensionar"}
      </Button>
      <ErrorNote>{error}</ErrorNote>

      {r && (
        <Card style={{ marginTop: 12 }}>
          <div style={{ display: "flex", gap: 12, marginBottom: 8 }}>
            {zona("Anclaje proximal", r.proximal)}
            {zona("Anclaje distal", r.distal)}
          </div>
          <div style={{ fontSize: 12, color: "var(--muted-foreground)", lineHeight: 1.5 }}>
            Cuello a lo largo del vaso: {r.neck_arc_mm[0].toFixed(1)}–{r.neck_arc_mm[1].toFixed(1)} mm
            {r.neck_from_rim ? " (del borde marcado)" : " (del ancho del cuello)"}.
            Hace falta cubrir <b style={{ color: "var(--foreground)" }}>{r.required_length_mm.toFixed(0)} mm</b>
            {r.mismatch_mm > 0 ? `; diferencia proximal–distal ${r.mismatch_mm.toFixed(2)} mm.` : "."}
          </div>

          {r.warnings.map((w) => (
            <div key={w} role="alert" style={{ fontSize: 12, color: "var(--warning)", marginTop: 8, lineHeight: 1.5 }}>{w}</div>
          ))}

          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
            {r.options.map((o) => (
              <div key={o.device_id} style={{
                border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: "10px 12px",
                opacity: o.fits ? 1 : 0.7,
              }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                  <b style={{ fontSize: 13 }}>{o.name}</b>
                  <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>{o.manufacturer}</span>
                  <div style={{ flex: 1 }} />
                  {o.fits && (
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 13 }}>
                      Ø{o.diameter_mm.toFixed(2)} × {o.length_mm.toFixed(0)} mm
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 11.5, color: "var(--muted-foreground)", marginTop: 4, lineHeight: 1.5 }}>{o.reason}</div>
                {o.neck_note && (
                  <div style={{ fontSize: 11.5, marginTop: 4, lineHeight: 1.5 }}><b>En el cuello:</b> {o.neck_note}</div>
                )}
                {o.narrow_end_note && (
                  <div style={{ fontSize: 11.5, marginTop: 4, lineHeight: 1.5 }}><b>En el anclaje estrecho:</b> {o.narrow_end_note}</div>
                )}
                {o.fits && (
                  <Button size="sm" variant="ghost" style={{ marginTop: 6 }}
                          onClick={() => onApply(o.diameter_mm, o.deploy_arc_mm[0], o.deploy_arc_mm[1])}>
                    Usar en el despliegue
                  </Button>
                )}
              </div>
            ))}
          </div>

          {r.notes.map((n) => (
            <div key={n} style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 8, lineHeight: 1.5 }}>{n}</div>
          ))}
          <details style={{ marginTop: 8, fontSize: 11, color: "var(--muted-foreground)" }}>
            <summary style={{ cursor: "pointer" }}>Fuentes</summary>
            <ul style={{ margin: "6px 0 0", paddingLeft: 16, lineHeight: 1.5 }}>
              {r.sources.map((s) => <li key={s}>{s}</li>)}
            </ul>
          </details>
        </Card>
      )}
    </div>
  );
}
