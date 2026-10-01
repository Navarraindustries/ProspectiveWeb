/* La tarjeta de idoneidad del clip: lo que el mapa de calor pinta, dicho en
   cifras. Cuánto cuello cierra la hoja, qué presión estima frente a la ventana
   de la banda, y con qué fuerza se ha calculado — porque una presión sin decir
   de qué fuerza sale aparenta una medida que no es. */

import type { ClipFieldSummary } from "../../api/types";
import { Metric } from "../Metric";
import { Card, SectionLabel } from "../PanelHead";
import { CriterionChip } from "./ClipSelection";

type BadgeVariant = "success" | "warning" | "destructive";

const PRESSURE_BADGE: Record<ClipFieldSummary["pressure_verdict"], [string, BadgeVariant]> = {
  optima: ["Óptima", "success"],
  aceptable: ["Aceptable", "warning"],
  insuficiente: ["Insuficiente", "destructive"],
  exceso: ["Exceso", "destructive"],
  sin_contacto: ["Sin contacto", "destructive"],
  // Sin ficha no hay presión que juzgar: se dice, en vez de pintar un veredicto
  // sobre un número que no existe.
  sin_fuerza: ["Sin fuerza de catálogo", "warning"],
};

const f1 = (n: number) => n.toFixed(1);

export function ClipFieldCard({
  summary, show, onToggle,
}: {
  summary: ClipFieldSummary;
  show: boolean;
  onToggle: (v: boolean) => void;
}) {
  const s = summary;
  const [accLo, optLo, optHi, accHi] = s.window_g_mm2;
  const sinFuerza = s.pressure_verdict === "sin_fuerza";
  // Sin contacto no hay área: la presión y la ventana salen 0, y «óptima
  // 0.0–0.0» se leería como una medida. Se calla, igual que la leyenda del visor.
  const sinContacto = s.pressure_verdict === "sin_contacto";
  const matiz = [
    s.force_is_band_min && "fuerza mínima de la banda",
    s.force_provisional && "provisional",
  ].filter(Boolean).join(", ");

  return (
    <Card style={{ marginTop: 14 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        <SectionLabel style={{ flex: 1 }}>Mapa de calor del clip</SectionLabel>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--muted-foreground)", cursor: "pointer" }}>
          <input type="checkbox" aria-label="Mapa de calor" checked={show} onChange={(e) => onToggle(e.target.checked)} />
          Mostrar en el visor
        </label>
      </div>

      {/* El valor y su unidad en un solo texto: así se lee (y se busca) «92.0 %». */}
      <Metric label="Cobertura" value={`${f1(s.covered_pct)} %`} />
      <Metric label="Cuello residual" value={`${f1(s.residual_pct)} %`} />
      <Metric label="No alcanzado" value={`${f1(s.unreached_pct)} %`} />
      <Metric
        label="Presión estimada"
        value={sinFuerza || sinContacto ? "—" : `${f1(s.pressure_g_mm2)} g/mm²`}
        badge={PRESSURE_BADGE[s.pressure_verdict]}
      />
      {!sinContacto && (
        <div style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--muted-foreground)", marginTop: 6 }}>
          óptima {f1(optLo)}–{f1(optHi)} · aceptable {f1(accLo)}–{f1(accHi)} g/mm²
        </div>
      )}
      {!sinFuerza && (
        <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 4 }}>
          Fuerza: {s.force_g.toFixed(0)} g{matiz && ` (${matiz})`}
        </div>
      )}

      {s.criteria.length > 0 && (
        <div style={{ marginTop: 8, paddingTop: 6, borderTop: "1px solid var(--border)" }}>
          {s.criteria.map((c) => <CriterionChip key={c.key} c={c} />)}
        </div>
      )}

      <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 8, lineHeight: 1.45 }}>
        {s.note}
      </div>
    </Card>
  );
}
