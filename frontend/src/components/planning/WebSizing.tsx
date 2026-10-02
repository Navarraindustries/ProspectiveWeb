/* Dimensionado del WEB (Woven EndoBridge): anchura y altura del saco respecto
   al plano del cuello, y las medidas SL/SLS del catálogo que cumplen +1/−1.
   No decide: dice si el aneurisma cae en la indicación aprobada y avisa
   cuando el saco aislado no es un domo lleno. Ver backend/services/web_sizing.py. */

import { useState } from "react";
import { api } from "../../api/client";
import type { WebSizingResult } from "../../api/types";
import { Button } from "../Button";
import { Card, ErrorNote, SectionLabel } from "../PanelHead";

const mm = (v: number) => `${v.toFixed(1)} mm`;

export function WebSizing({ sessionId }: { sessionId: string }) {
  const [r, setR] = useState<WebSizingResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      setR(await api.webSizing(sessionId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo dimensionar");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ marginTop: 12 }}>
      <SectionLabel>Dimensionado de WEB</SectionLabel>
      <div style={{ fontSize: 12, color: "var(--muted-foreground)", margin: "6px 0 10px", lineHeight: 1.5 }}>
        Mide la anchura y la altura del saco respecto al plano del cuello y propone
        las medidas del catálogo con la regla +1/−1: un poco más ancho que el
        aneurisma y, en lo mismo, más bajo. Necesita la morfometría; con el cuello
        marcado a mano la medida es del saco aislado.
      </div>
      <Button variant="outline" style={{ width: "100%" }} onClick={() => void run()} disabled={busy}>
        {busy ? "Midiendo el saco…" : r ? "Volver a medir" : "Dimensionar"}
      </Button>
      <ErrorNote>{error}</ErrorNote>

      {r && (
        <Card style={{ marginTop: 12 }}>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 6 }}>
            <div>
              <div style={{ fontSize: 11, color: "var(--muted-foreground)" }}>ANCHURA MEDIA</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 16, fontWeight: 700 }}>{mm(r.dims.width_mm)}</div>
              <div style={{ fontSize: 10.5, color: "var(--muted-foreground)" }}>
                {r.dims.width_min_mm.toFixed(1)}–{r.dims.width_max_mm.toFixed(1)}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: "var(--muted-foreground)" }}>ALTURA</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 16, fontWeight: 700 }}>{mm(r.dims.height_mm)}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: "var(--muted-foreground)" }}>CUELLO</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 16, fontWeight: 700 }}>{mm(r.neck_mm)}</div>
              <div style={{ fontSize: 10.5, color: "var(--muted-foreground)" }}>domo/cuello {r.dnr.toFixed(2)}</div>
            </div>
          </div>
          <div style={{ fontSize: 12, fontWeight: 600, color: r.within_indication ? "var(--success)" : "var(--warning)" }}>
            {r.within_indication ? "Dentro de la indicación aprobada" : "Fuera de la indicación aprobada"}
          </div>

          {r.warnings.map((w) => (
            <div key={w} role="alert" style={{ fontSize: 12, color: "var(--warning)", marginTop: 8, lineHeight: 1.5 }}>{w}</div>
          ))}

          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 12 }}>
            {r.options.length === 0 && (
              <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>Ninguna medida del catálogo cumple la regla.</div>
            )}
            {r.options.map((o) => (
              <div key={o.label} style={{
                display: "flex", alignItems: "baseline", gap: 10, padding: "8px 10px",
                border: "1px solid var(--border)", borderRadius: "var(--radius-md)",
              }}>
                <b style={{ fontFamily: "var(--font-mono)", fontSize: 13 }}>{o.label}</b>
                <span style={{ fontSize: 11.5, color: "var(--muted-foreground)", flex: 1 }}>
                  {o.width_mm.toFixed(1)} × {o.height_mm.toFixed(1)} mm · +{o.added_mm.toFixed(1)} de anchura,
                  altura buscada {o.target_height_mm.toFixed(1)}
                </span>
                {o.dav != null && (
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 11.5 }}>DAV {o.dav.toFixed(2)}</span>
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
