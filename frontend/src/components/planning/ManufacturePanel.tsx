/* Fabricación — la pieza que hay que mandar a hacer, y el pedido.

   Vive fuera del paso de Dispositivos a propósito. Todo lo que hay allí responde
   a «¿qué le pongo a este paciente y dónde?»: pasa en una sentada, dentro de la
   sesión. Esto responde a «¿cómo consigo la pieza?»: tarda semanas, hay un
   taller externo de por medio, el registro vive fuera de la sesión y sigue vivo
   después de que el plan esté cerrado —la pieza llega, se mide, se acepta—. No
   es que estorbara: es que ni siquiera es la misma sesión de trabajo.

   El paso es OPCIONAL. La mayoría de casos se resuelven con un clip del
   catálogo y nunca pasan por aquí. */

import { useCallback, useEffect, useState } from "react";
import { api } from "../../api/client";
import type { ClipSelectionResult, ManufactureSpecOut } from "../../api/types";
import { Button } from "../Button";
import { Icon } from "../Icon";
import { Card, ErrorNote, PanelHead, SectionLabel } from "../PanelHead";
import { usePlanning } from "../../store/planning";
import { ClipOrderForm, ClipOrderList } from "./ClipOrderForm";


function ManufactureSheet({
  spec, sessionId, caseId,
}: {
  spec: ManufactureSpecOut;
  sessionId: string;
  caseId?: number | null;
}) {
  const [built, setBuilt] = useState<ManufactureSpecOut | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const shown = built ?? spec;

  const rows: [string, string][] = [
    ["Forma", `${shown.shape}${shown.angle_deg ? ` · ${shown.angle_deg.toFixed(0)}°` : ""}`],
    ["Longitud de hoja", `${shown.blade_length_mm.toFixed(1)} mm`],
    ["Anchura de hoja", `${shown.blade_width_mm.toFixed(2)} mm`],
    ["Altura de hoja", `${shown.blade_height_mm.toFixed(2)} mm`],
    ["Longitud de muelle", `${shown.spring_length_mm.toFixed(1)} mm`],
    ["Fuerza de cierre", `${shown.closing_force_g.toFixed(0)} g`],
    ...(shown.fenestration_mm > 0
      ? ([["Ventana (interior)", `${shown.fenestration_mm.toFixed(1)} mm`]] as [string, string][])
      : []),
    ["Cuello medido", `${shown.neck_mm.toFixed(2)} mm`],
  ];

  const generate = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      setBuilt(await api.clipManufacture(sessionId, caseId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo generar el STL");
    } finally {
      setBusy(false);
    }
  }, [sessionId, caseId]);

  const copy = () => {
    const text = [
      `Clip a medida — ${shown.label}`,
      ...rows.map(([k, v]) => `${k}: ${v}`),
      "",
      "Motivo:",
      ...shown.reasons.map((r) => `- ${r}`),
      "",
      "A confirmar antes de fabricar:",
      ...shown.confidence_notes.map((n) => `- ${n}`),
    ].join("\n");
    void navigator.clipboard?.writeText(text);
  };

  return (
    <Card>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: "var(--foreground)", flex: 1, minWidth: 0 }}>
          {shown.piece_label || `Clip a medida · ${shown.label}`}
        </div>
        {shown.part_no && (
          <span style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--muted-foreground)" }}>
            {shown.part_no}
          </span>
        )}
      </div>

      {/* De dónde sale la pieza. Un clip de catálogo se compra y no lleva STL:
          ofrecer uno sería decir que se fabrica algo que no se fabrica. */}
      {shown.source && shown.source !== "navarro" && (
        <div style={{
          fontSize: 11, lineHeight: 1.5, marginTop: 6, padding: "8px 10px",
          borderRadius: "var(--radius-sm)",
          background: "color-mix(in srgb, var(--warning) 12%, transparent)",
          color: "var(--warning)",
        }}>
          {shown.fallback_reason}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "2px 12px", marginTop: 10 }}>
        {rows.map(([k, v]) => (
          <div key={k} style={{ display: "contents" }}>
            <div style={{ fontSize: 11, color: "var(--muted-foreground)" }}>{k}</div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--foreground)", fontFamily: "var(--font-mono)" }}>
              {v}
            </div>
          </div>
        ))}
      </div>

      {shown.reasons.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <SectionLabel>Por qué no sirve el inventario</SectionLabel>
          <ul style={{ margin: "4px 0 0", paddingLeft: 18, fontSize: 11, color: "var(--muted-foreground)", lineHeight: 1.5 }}>
            {shown.reasons.map((r) => <li key={r}>{r}</li>)}
          </ul>
        </div>
      )}

      {/* Lo que la ficha NO sabe. Una especificación que esconde sus supuestos
          es peor que una que los declara: aquí es lo que un taller tiene que
          confirmar antes de mecanizar nada. */}
      {shown.confidence_notes.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <SectionLabel>A confirmar antes de fabricar</SectionLabel>
          <ul style={{ margin: "4px 0 0", paddingLeft: 18, fontSize: 11, color: "var(--warning)", lineHeight: 1.5 }}>
            {shown.confidence_notes.map((n) => <li key={n}>{n}</li>)}
          </ul>
        </div>
      )}

      <ErrorNote>{error}</ErrorNote>

      <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
        <Button size="sm" onClick={() => void generate()} disabled={busy}>
          {busy ? "Generando…"
            : shown.part_no ? "Regenerar STL y dossiers"
            : "Generar STL y dossiers"}
        </Button>
        {shown.stl_url && (
          <Button size="sm" variant="ghost" onClick={() => window.open(shown.stl_url!, "_blank")}>
            Descargar STL
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={copy}>Copiar especificación</Button>
      </div>

      {/* Dos documentos, y la diferencia importa: el del taller no lleva ningún
          dato de paciente, por construcción. */}
      {(shown.dossier_internal_url || shown.dossier_workshop_url) && (
        <div style={{ marginTop: 12, borderTop: "1px solid var(--border)", paddingTop: 10 }}>
          <SectionLabel>Dossier de fabricación</SectionLabel>
          <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
            {shown.dossier_internal_url && (
              <Button size="sm" variant="ghost"
                      onClick={() => window.open(shown.dossier_internal_url!, "_blank")}>
                Copia interna (PDF)
              </Button>
            )}
            {shown.dossier_workshop_url && (
              <Button size="sm" variant="ghost"
                      onClick={() => window.open(shown.dossier_workshop_url!, "_blank")}>
                Para el taller (PDF)
              </Button>
            )}
          </div>
          <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 6, lineHeight: 1.5 }}>
            La copia interna lleva el paciente, el caso y las medidas de las que
            sale el pedido. La del taller no lleva ningún dato de paciente: solo
            cotas, tolerancias, material y las verificaciones a realizar.
          </div>
        </div>
      )}
    </Card>
  );
}


/* ── El paso ─────────────────────────────────────────────────────────────── */

export function ManufacturePanel({ onNext }: { onNext: () => void }) {
  const { sessionId, caseId } = usePlanning();
  const [sel, setSel] = useState<ClipSelectionResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ordersKey, setOrdersKey] = useState(0);

  useEffect(() => {
    if (!sessionId) { setLoading(false); return; }
    setLoading(true);
    // `verify: false` — aquí no se coloca nada, así que la comprobación
    // geométrica contra la malla no aporta y cuesta segundos.
    api.clipSelection(sessionId, caseId, false)
      .then(setSel)
      .catch((e) => setError(e instanceof Error ? e.message : "No se pudo leer la selección de clip"))
      .finally(() => setLoading(false));
  }, [sessionId, caseId]);

  return (
    <div className="fade-rise">
      <PanelHead
        title="Fabricación"
        desc="Manda a hacer un clip a medida: especificación, STL, dossiers y seguimiento del pedido."
      />

      <div style={{
        fontSize: 11, lineHeight: 1.5, color: "var(--muted-foreground)",
        padding: "8px 10px", borderRadius: "var(--radius-md)",
        background: "var(--muted)", marginBottom: 14,
      }}>
        <b>Paso opcional.</b> La mayoría de los casos se resuelven con un clip del
        catálogo y no pasan por aquí. Un pedido tarda semanas, así que el informe
        del caso se genera sin esperarlo.
      </div>

      {!sessionId && (
        <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
          Abre o reanuda una sesión para pedir una pieza.
        </div>
      )}

      {loading && sessionId && (
        <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>Leyendo el caso…</div>
      )}

      <ErrorNote>{error}</ErrorNote>

      {sessionId && !loading && sel?.manufacture && (
        <div style={{ marginBottom: 14 }}>
          <SectionLabel>
            {sel.outcome === "manufacture" ? "Especificación de fabricación"
              : sel.outcome === "stock" ? "Clip ideal a medida (opcional)"
              : "Alternativa a medida"}
          </SectionLabel>
          {sel.outcome === "stock" && (
            <div style={{ fontSize: 11, color: "var(--muted-foreground)", margin: "4px 0 6px", lineHeight: 1.5 }}>
              Ya hay clips del inventario que cumplen todos los criterios. Esta es
              la pieza que se ajustaría exactamente al cuello, por si se prefiere
              mandarla a fabricar.
            </div>
          )}
          <ManufactureSheet spec={sel.manufacture} sessionId={sessionId} caseId={caseId} />
        </div>
      )}

      {sessionId && !loading && !sel?.manufacture && !error && (
        <div style={{ fontSize: 12, color: "var(--muted-foreground)", marginBottom: 14, lineHeight: 1.5 }}>
          Todavía no hay especificación de pieza para este caso. Sale de la
          morfometría: marca el cuello en Morfometría y vuelve.
        </div>
      )}

      {sessionId && (
        <>
          <ClipOrderForm
            sessionId={sessionId}
            caseId={caseId}
            onPlaced={() => setOrdersKey((k) => k + 1)}
          />
          <ClipOrderList sessionId={sessionId} refreshKey={ordersKey} />
        </>
      )}

      <Button
        variant="outline"
        style={{ marginTop: 18, width: "100%" }}
        onClick={onNext}
        trailingIcon={<Icon name="STEP_EXPORT" />}
      >
        Continuar al informe
      </Button>
    </div>
  );
}
