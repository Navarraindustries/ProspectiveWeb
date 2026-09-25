/* Selección de clip — qué sirve para este caso, por qué, o qué hay que fabricar.

   La lista anterior mostraba nombre + un número (0–100). Un número no se puede
   defender delante de un cirujano, así que aquí cada candidato lleva la matriz
   de criterios con la medida que produjo cada veredicto, y los descartados
   llevan la única razón por la que quedaron fuera: saber por qué NO entró un
   clip es lo que hace creíble a los que sí.

   Cuando el inventario no da, el panel no se queda vacío: muestra la ficha de
   fabricación con medidas, forma y fuerza, y deja descargar el STL. */

import { useCallback, useEffect, useState } from "react";
import { api } from "../../api/client";
import type {
  ClipCandidateOut,
  ClipCriterion,
  ClipSelectionResult,
  ClipVerdict,
  CustomJawOut,
} from "../../api/types";
import { Badge } from "../Badge";
import { Button } from "../Button";
import { Card, Collapsible, ErrorNote, SectionLabel } from "../PanelHead";
import { Slider } from "../Slider";
import { shapeWithBend } from "./clipShape";

const VERDICT_MARK: Record<ClipVerdict, string> = { ok: "✓", warn: "!", fail: "✕" };
const VERDICT_COLOR: Record<ClipVerdict, string> = {
  ok: "var(--success)",
  warn: "var(--warning)",
  fail: "var(--destructive)",
};

/** One criterion as a chip: the mark, the label, and the number behind it. */
function CriterionChip({ c }: { c: ClipCriterion }) {
  return (
    <div
      title={c.detail}
      style={{
        display: "flex", alignItems: "flex-start", gap: 6, fontSize: 11,
        lineHeight: 1.45, padding: "3px 0",
      }}
    >
      <span
        aria-hidden
        style={{
          flex: "0 0 auto", width: 14, height: 14, borderRadius: 4, marginTop: 1,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 10, fontWeight: 800, color: "#fff",
          background: VERDICT_COLOR[c.verdict],
        }}
      >
        {VERDICT_MARK[c.verdict]}
      </span>
      <span style={{ color: "var(--muted-foreground)", minWidth: 0 }}>
        <b style={{ color: "var(--foreground)", fontWeight: 700 }}>{c.label}:</b>{" "}
        {c.detail}
      </span>
    </div>
  );
}

function CandidateCard({
  cand, selected, onSelect,
}: {
  cand: ClipCandidateOut;
  selected: boolean;
  onSelect?: () => void;
}) {
  const fit = cand.fit;
  return (
    <Card
      style={{
        borderColor: selected ? "var(--brand-deep)" : undefined,
        background: selected ? "var(--brand-subtle)" : undefined,
        padding: "12px 14px",
        cursor: onSelect ? "pointer" : "default",
      }}
      onClick={onSelect}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--foreground)", flex: 1, minWidth: 0 }}>
          {cand.clip_name}
        </div>
        {/* Que un clip se fabrique para el caso no lo hace peor, pero sí cambia
            la planificación: hay que contar con el plazo. Va junto al nombre,
            no escondido en los criterios. */}
        {cand.availability === "made_to_order" && (
          <Badge variant="subtle">bajo pedido</Badge>
        )}
        <Badge variant={cand.verdict === "ok" ? "success" : cand.verdict === "warn" ? "warning" : "destructive"}>
          {cand.verdict === "ok" ? "Cumple" : cand.verdict === "warn" ? "Con reservas" : "Descartado"}
        </Badge>
      </div>

      <div style={{ fontSize: 11, color: "var(--muted-foreground)", fontFamily: "var(--font-mono)", marginTop: 2 }}>
        {shapeWithBend(cand.shape, cand.bend_angle_deg)}
        {" · mordaza "}{cand.blade_length_mm.toFixed(1)} mm ·{" "}
        {/* Una banda es una banda: quedarse con el punto medio inventaría una
            precisión que la pieza todavía no tiene. */}
        {cand.closing_force_max_g > cand.closing_force_min_g
          ? `${cand.closing_force_min_g.toFixed(0)}–${cand.closing_force_max_g.toFixed(0)} g`
          : `${cand.closing_force_g.toFixed(0)} g`}
        {cand.force_provisional ? " (sin caracterizar)" : ""}
        {cand.manufacturer ? ` · ${cand.manufacturer}` : ""}
      </div>

      {/* Los criterios, cada uno con su medida. Sustituyen a la barra de score:
          «cubre el cuello con 1,8 mm de margen» dice algo; «92,6» no. */}
      <div style={{ marginTop: 8, borderTop: "1px solid var(--border)", paddingTop: 6 }}>
        {cand.criteria.map((c) => <CriterionChip key={c.key} c={c} />)}
      </div>

      {/* Cuántas orientaciones de aplicación libran los vasos vecinos. Un clip
          limpio en 1 de 6 es utilizable, pero exige una precisión que el que
          está limpio en 6 de 6 no pide — y eso no se ve en un score. */}
      {fit && fit.n_rolls > 0 && (
        <div style={{ marginTop: 6, fontSize: 11, color: "var(--muted-foreground)" }}>
          Comprobado sobre la malla del paciente:{" "}
          <b style={{ color: fit.clean_rolls === 0 ? "var(--destructive)" : "var(--foreground)" }}>
            {fit.clean_rolls}/{fit.n_rolls}
          </b>{" "}
          orientaciones sin tocar vasos vecinos · cubre {fit.neck_coverage_pct.toFixed(0)}% del cuello
        </div>
      )}
    </Card>
  );
}

/** A made-to-order clip sized to this case, with a slider to override the jaw.

    These designs are manufactured per case, so the jaw is not restricted to the
    six drawn sizes: an exact one is a real order, not a wish. The system offers
    the size the neck asks for; the surgeon can still dial it by hand, which is
    why the slider exists next to the suggestion rather than instead of it. */
function CustomJawSheet({
  suggestion, sessionId, onPick,
}: {
  suggestion: CustomJawOut;
  sessionId: string;
  /** El mismo que usan las tarjetas de candidato: elegir aquí es elegir allí. */
  onPick?: (clipId: string, clipName: string) => void;
}) {
  const [jaw, setJaw] = useState(suggestion.jaw_mm);
  const [built, setBuilt] = useState<CustomJawOut | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const build = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      setBuilt(await api.buildNavarroClip(
        sessionId, jaw, suggestion.angle_deg,
        suggestion.shape, suggestion.window_mm));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo generar el clip");
    } finally {
      setBusy(false);
    }
  }, [sessionId, jaw, suggestion.angle_deg, suggestion.shape, suggestion.window_mm]);

  return (
    <Card>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: "var(--foreground)", flex: 1 }}>
          {suggestion.label}
        </div>
        <Badge variant="subtle">bajo pedido</Badge>
      </div>
      <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 4, lineHeight: 1.5 }}>
        {suggestion.reason}
      </div>

      {/* El Slider del sistema de diseño, no un <input range> suelto: la lectura
          numérica en monoespaciada y el tratamiento del control son los mismos
          que en umbralización y suavizado. */}
      <div style={{ marginTop: 12 }}>
        <Slider
          label="Mordaza (longitud útil de agarre)"
          min={2} max={30} step={0.5} value={jaw} unit=" mm"
          onChange={(v) => { setJaw(v); setBuilt(null); }}
        />
        <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 4 }}>
          Talla dibujada más cercana: {suggestion.nearest_drawn_mm.toFixed(0)} mm
        </div>
      </div>

      <ErrorNote>{error}</ErrorNote>

      {built && (
        <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 8, lineHeight: 1.5 }}>
          {built.reason}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
        <Button size="sm" onClick={() => void build()} disabled={busy}>
          {busy ? "Generando…" : built ? "Regenerar" : "Generar clip"}
        </Button>
        {/* Hasta aquí esto era un mirador: se podía marcar una longitud, verla y
            bajarse el STL, pero no llevarla al plan. Así nunca pasaba por la
            comprobación de colisión, y fabricación volvía a proponer la medida
            deducida de la morfometría en vez de la que se acababa de elegir —
            el mismo número tecleado dos veces, sin nada que garantice que
            coinciden. Elegir aquí usa la misma vía que las tarjetas de arriba. */}
        {built?.clip_id && onPick && (
          <Button size="sm" onClick={() => onPick(built.clip_id, built.label)}>
            Elegir esta medida
          </Button>
        )}
        {built?.stl_url && (
          <Button size="sm" variant="ghost" onClick={() => window.open(built.stl_url!, "_blank")}>
            Descargar STL
          </Button>
        )}
      </div>
    </Card>
  );
}

const OUTCOME_STYLE: Record<string, { variant: "success" | "warning" | "destructive" | "subtle"; label: string }> = {
  stock:       { variant: "success",     label: "Hay clip en inventario" },
  marginal:    { variant: "warning",     label: "Utilizable con reservas" },
  manufacture: { variant: "destructive", label: "Requiere fabricación" },
  unmeasured:  { variant: "subtle",      label: "Falta medir el cuello" },
};

export function ClipSelectionPanel({
  sessionId,
  caseId,
  selectedClipId,
  onPick,
}: {
  sessionId: string;
  caseId?: number | null;
  selectedClipId?: string;
  /** Called when the surgeon picks a candidate, so the placement list can use it. */
  onPick?: (clipId: string, clipName: string) => void;
}) {
  const [sel, setSel] = useState<ClipSelectionResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    api.clipSelection(sessionId, caseId)
      .then(setSel)
      .catch((e) => setError(e instanceof Error ? e.message : "Error cargando la selección de clip"))
      .finally(() => setLoading(false));
  }, [sessionId, caseId]);

  useEffect(load, [load]);

  if (loading) {
    return <div style={{ fontSize: 12, color: "var(--muted-foreground)", padding: "8px 0" }}>Evaluando el catálogo…</div>;
  }
  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!sel) return null;

  const style = OUTCOME_STYLE[sel.outcome] ?? OUTCOME_STYLE.unmeasured;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Veredicto primero: lo que hay que saber antes de leer ninguna lista. */}
      <Card style={{ background: "var(--muted)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <Badge variant={style.variant}>{style.label}</Badge>
          <Button size="sm" variant="ghost" onClick={load} style={{ marginLeft: "auto" }}>
            Recalcular
          </Button>
        </div>
        <div style={{ fontSize: 12, color: "var(--foreground)", marginTop: 6, lineHeight: 1.5 }}>
          {sel.summary}
        </div>
        {sel.case.neck_mm > 0 && (
          <div style={{ fontSize: 11, color: "var(--muted-foreground)", fontFamily: "var(--font-mono)", marginTop: 4 }}>
            cuello {sel.case.neck_mm.toFixed(2)} mm · AR {sel.case.ar.toFixed(2)}
            {sel.case.parent_artery_mm > 0 && ` · vaso padre ${sel.case.parent_artery_mm.toFixed(2)} mm`}
            {sel.case.region && ` · ${sel.case.region}`}
          </div>
        )}
        {/* El número que de verdad elige la pieza. El cuello se clipa por lo
            que mide APLASTADO, no por su diámetro, y esa diferencia —de un
            milímetro largo en un cuello ovalado— es la que deja el cierre
            incompleto en el lado distal. Se dice en pantalla, con su origen:
            no es lo mismo haber medido el contorno que haber supuesto que el
            cuello es redondo. */}
        {/* Lo que el abordaje le exige a la pieza. Pedido por dirección: que la
            recomendación del clip dependa de la trayectoria. No es una tabla
            ángulo→forma: las hojas tienen que quedar cruzadas sobre el cuello y
            el mango salir por el corredor, y el ángulo entre esas dos
            direcciones ES la acodadura que hace falta. */}
        {sel.case.approach_bend_deg !== null && (
          <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 6, lineHeight: 1.5 }}>
            El corredor marcado llega a{" "}
            <b style={{ color: "var(--foreground)", fontFamily: "var(--font-mono)" }}>
              {(sel.case.approach_angle_deg ?? 0).toFixed(0)}°
            </b>{" "}
            del eje cuello-domo, así que pide una acodadura de{" "}
            <b style={{ color: "var(--foreground)", fontFamily: "var(--font-mono)" }}>
              ~{sel.case.approach_bend_deg.toFixed(0)}°
            </b>{" "}
            para que las hojas queden cruzadas sobre el cuello con el mango
            saliendo por donde entra la mano.
          </div>
        )}

        {sel.case.required_jaw_mm > 0 && (
          <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 6, lineHeight: 1.5 }}>
            Mordaza mínima{" "}
            <b style={{ color: "var(--foreground)", fontFamily: "var(--font-mono)" }}>
              {sel.case.required_jaw_mm.toFixed(1)} mm
            </b>
            {sel.case.required_jaw_source === "perimeter"
              ? " — medida sobre el contorno del cuello"
              : " — regla del cuello aplastado (×1,5)"}
            . {sel.case.required_jaw_detail}
          </div>
        )}
      </Card>

      {sel.recommended.length > 0 && (
        <div>
          <SectionLabel>Clips recomendados ({sel.recommended.length})</SectionLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 6 }}>
            {sel.recommended.map((c) => (
              <CandidateCard
                key={c.clip_id}
                cand={c}
                selected={selectedClipId === c.clip_id}
                onSelect={onPick ? () => onPick(c.clip_id, c.clip_name) : undefined}
              />
            ))}
          </div>
        </div>
      )}

      {/* La opción a medida va ANTES de la ficha genérica de fabricación: es un
          diseño real de la casa, no una especificación desde cero. */}
      {sel.custom_jaw && (
        <div>
          <SectionLabel>Clip a medida sobre un diseño propio</SectionLabel>
          <div style={{ marginTop: 6 }}>
            <CustomJawSheet suggestion={sel.custom_jaw} sessionId={sessionId} onPick={onPick} />
          </div>
        </div>
      )}

      {/* La ficha de fabricación y el pedido se fueron al paso «Fabricación»:
          aquí se decide QUÉ clip y DÓNDE va, que es cosa de una sentada; pedir
          la pieza tarda semanas y sigue vivo después de cerrar el plan. */}
      {sel.manufacture && (
        <div style={{
          fontSize: 11, lineHeight: 1.5, color: "var(--muted-foreground)",
          padding: "8px 10px", borderRadius: "var(--radius-md)", background: "var(--muted)",
        }}>
          Para este cuello hay una pieza a medida especificada
          (<b>{sel.manufacture.label}</b>). Mandarla a fabricar, con su STL, los
          dossiers y el pedido, se hace en el paso <b>Fabricación</b>.
        </div>
      )}

      {/* Varios clips para lo que ninguno cierra solo.
          Preguntado por dirección: colocar varios ya funcionaba, pero la
          recomendación nunca proponía más de uno, así que un cuello grande solo
          tenía una salida — mandar fabricar una hoja más larga. La otra salida
          es la que se usa en quirófano. */}
      {sel.multiclip && (
        <Card style={{ borderLeft: "3px solid var(--warning)" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--foreground)" }}>
            O un montaje de varios clips
          </div>
          <div style={{ fontSize: 12, color: "var(--foreground)", marginTop: 6, lineHeight: 1.5 }}>
            <b>{sel.multiclip.label}</b>
          </div>
          <div style={{ fontSize: 11, color: "var(--muted-foreground)", fontFamily: "var(--font-mono)", marginTop: 4 }}>
            cubre {sel.multiclip.covered_mm.toFixed(1)} mm de los{" "}
            {sel.multiclip.required_mm.toFixed(1)} mm que mide el cuello aplastado
          </div>
          <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 8, lineHeight: 1.5 }}>
            Las hojas van <b>solapadas</b>, no adosadas: dejarlas tocándose por la
            punta deja sin cerrar justo el tramo donde se juntan.
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 8 }}>
            {sel.multiclip.cautions.map((c, i) => (
              <div key={i} style={{ fontSize: 11, color: "var(--muted-foreground)", lineHeight: 1.45 }}>
                — {c}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Los que se quedaron cerca. Sin esto la lista de arriba es una caja
          negra: no se puede saber si el catálogo se consideró entero. */}
      {sel.rejected.length > 0 && (
        <Collapsible
          title="Por qué se descartaron otros"
          subtitle={`${sel.rejected.length} clips cercanos, con el motivo de cada uno`}
          storageKey={`clipsel.rejected.${sessionId}`}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {sel.rejected.map((c) => <CandidateCard key={c.clip_id} cand={c} selected={false} />)}
          </div>
        </Collapsible>
      )}

      {sel.caveats.length > 0 && (
        <Collapsible
          title="Qué limita esta recomendación"
          subtitle={`${sel.caveats.length} advertencias`}
          storageKey={`clipsel.caveats.${sessionId}`}
          defaultOpen={sel.outcome === "unmeasured"}
        >
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 11, color: "var(--muted-foreground)", lineHeight: 1.6 }}>
            {sel.caveats.map((c) => <li key={c}>{c}</li>)}
          </ul>
        </Collapsible>
      )}
    </div>
  );
}
