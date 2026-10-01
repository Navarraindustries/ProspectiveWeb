/* La tarjeta de idoneidad del clip: lo que el mapa de calor pinta, dicho en
   cifras. Cuánto del cuello cierran las hojas, qué fuerza tiene cada clip frente
   a la ventana de fuerza de ese cuello, y de dónde sale esa fuerza.

   La fuerza se da en gramos y el área pinzada aparte. La «presión» en g/mm²
   dividía fuerza y ventana por la misma área: el veredicto no podía moverse con
   la pose mientras la cifra saltaba un orden de magnitud, y un número con
   unidades físicas invita a compararlo con presiones de la literatura que no
   mide. Sigue en la API y en el .vtp para la fase mecánica. */

import type { ClipFieldSummary, ClipForceVerdict } from "../../api/types";
import { forcesText, neckPct } from "../../vtk/clipFieldLegend";
import { Metric } from "../Metric";
import { Card, SectionLabel } from "../PanelHead";
import { CriterionChip } from "./ClipSelection";

type BadgeVariant = "success" | "warning" | "destructive";

const FORCE_BADGE: Record<ClipForceVerdict, [string, BadgeVariant]> = {
  optima: ["Óptima", "success"],
  aceptable: ["Aceptable", "warning"],
  insuficiente: ["Insuficiente", "destructive"],
  exceso: ["Exceso", "destructive"],
  sin_contacto: ["Sin contacto", "destructive"],
  // Sin ficha no hay fuerza que juzgar: se dice, en vez de pintar un veredicto
  // sobre un número que no existe.
  sin_fuerza: ["Sin fuerza de catálogo", "warning"],
};

const g0 = (n: number) => `${n.toFixed(0)} g`;

export function ClipFieldCard({
  summary, show, onToggle,
}: {
  summary: ClipFieldSummary;
  show: boolean;
  onToggle: (v: boolean) => void;
}) {
  const s = summary;
  const [accLo, optLo, optHi, accHi] = s.force_window_g;
  const sinFuerza = s.pressure_verdict === "sin_fuerza";
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

      {/* El valor y su unidad en un solo texto: así se lee (y se busca) «92.0 %».
          Sin cuello a la altura de las hojas los tres son «—», no 0/0/0. */}
      <Metric label="Cuello cubierto" value={neckPct(s, s.covered_pct, 1)} />
      <Metric label="Cuello residual" value={neckPct(s, s.residual_pct, 1)} />
      <Metric label="Cuello no alcanzado" value={neckPct(s, s.unreached_pct, 1)} />
      <Metric label="Fuerza de cierre" value={forcesText(s)} badge={FORCE_BADGE[s.pressure_verdict]} />
      {/* La ventana en gramos sirve incluso sin ficha: quien conozca la fuerza de
          su clip importado puede compararla. */}
      <div style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--muted-foreground)", marginTop: 6 }}>
        Ventana del cuello: óptima {optLo.toFixed(0)}–{g0(optHi)} · aceptable {accLo.toFixed(0)}–{g0(accHi)}
      </div>
      {s.clips.length > 1 && (
        <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 4 }}>
          {s.clips.map((c, i) => (
            <div key={i}>{c.name}: {c.force_g > 0 ? g0(c.force_g) : "—"} · {FORCE_BADGE[c.verdict][0]}</div>
          ))}
        </div>
      )}
      {!sinFuerza && matiz && (
        <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 4 }}>
          {matiz.charAt(0).toUpperCase() + matiz.slice(1)}
        </div>
      )}
      <div title="Incluye la pared de vaso que queda entre las hojas, dentro de su banda de profundidad: es una cota amplia, no el contacto real hoja-tejido.">
        <Metric
          label="Área pinzada estimada"
          value={s.contact_area_mm2 > 0 ? `${s.contact_area_mm2.toFixed(1)} mm²` : "—"}
        />
      </div>

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
