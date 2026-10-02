/* «¿Cuál es la lesión?» — el profesional lo dice y eso mide al detector.

   El detector se ajustó con dos casos con diagnóstico. Cada confirmación es
   uno más, recogido donde ya se está mirando el caso. No cambia el plan: la
   morfometría sigue midiendo el candidato elegido. Ver
   backend/routers/ground_truth.py. */

import { useEffect, useState } from "react";
import { api } from "../../api/client";
import type { LesionConfirmation, LesionConfirmIn, LesionSummary } from "../../api/types";
import { Button } from "../Button";
import { usePlanning } from "../../store/planning";

function describe(c: LesionConfirmation): string {
  if (c.source === "no_lesion") return "Sin aneurisma en este estudio.";
  if (c.source === "candidate") return `La lesión es el candidato #${c.candidate_rank}.`;
  return c.candidate_rank != null
    ? `Marcada a mano; coincide con el candidato #${c.candidate_rank}.`
    : `Marcada a mano; no estaba entre los ${c.n_candidates} candidatos.`;
}

/** La cifra que sustituye a «en los dos casos que tenemos». */
export function summaryText(s: LesionSummary): string | null {
  if (s.confirmed === 0) return null;
  const n = s.confirmed;
  return `Con ${n} ${n === 1 ? "lesión confirmada" : "lesiones confirmadas"}, el detector la puso 1.ª en ${s.first}, `
    + `entre las 3 primeras en ${s.top3} y no la encontró en ${s.missed}.`;
}

export function LesionConfirm() {
  const {
    sessionId, imagingStudyId, candidates, selectedCandidate,
    pickMode, setPickMode, lesionMark, setLesionMark,
  } = usePlanning();
  const [current, setCurrent] = useState<LesionConfirmation | null>(null);
  const [summary, setSummary] = useState<LesionSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) return;
    let vivo = true;
    api.currentLesion(sessionId, imagingStudyId)
      .then((c) => { if (vivo) setCurrent(c); })
      .catch(() => { /* sin confirmación previa visible: no bloquea nada */ });
    api.lesionSummary()
      .then((s) => { if (vivo) setSummary(s); })
      .catch(() => {});
    return () => { vivo = false; };
  }, [sessionId, imagingStudyId]);

  if (!sessionId) return null;
  const marking = pickMode === "lesion_mark";
  const cand = candidates[selectedCandidate];

  const send = async (body: Omit<LesionConfirmIn, "session_id" | "imaging_study_id">) => {
    setBusy(true);
    setError(null);
    try {
      const c = await api.confirmLesion({ session_id: sessionId, imaging_study_id: imagingStudyId, ...body });
      setCurrent(c);
      setLesionMark(null);
      api.lesionSummary().then(setSummary).catch(() => {});
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar la confirmación");
    } finally {
      setBusy(false);
    }
  };

  const retract = async () => {
    if (!current) return;
    setBusy(true);
    setError(null);
    try {
      await api.retractLesion(current.id);
      setCurrent(null);
      api.lesionSummary().then(setSummary).catch(() => {});
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo retirar");
    } finally {
      setBusy(false);
    }
  };

  const resumen = summary ? summaryText(summary) : null;

  return (
    <section
      aria-label="Confirmar lesión"
      style={{
        marginTop: 14, padding: "12px 14px", borderRadius: "var(--radius-lg)",
        border: "1px solid var(--border)", background: "var(--card)",
      }}
    >
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>¿Cuál es la lesión?</div>
      <div style={{ fontSize: 11, color: "var(--muted-foreground)", lineHeight: 1.5, marginBottom: 10 }}>
        Si lo sabes, dilo: no cambia el plan, sirve para medir cómo acierta el detector.
        Queda registrado a tu nombre.
      </div>

      {current && (
        <div role="status" style={{
          fontSize: 12, marginBottom: 10, padding: "8px 10px", borderRadius: "var(--radius-md)",
          background: "var(--brand-subtle)", display: "flex", alignItems: "center", gap: 8,
        }}>
          <span style={{ flex: 1 }}>
            <b>Confirmado:</b> {describe(current)}
            {current.created_by ? <span style={{ color: "var(--muted-foreground)" }}> · {current.created_by}</span> : null}
          </span>
          <Button size="sm" variant="ghost" onClick={() => void retract()} disabled={busy}>Retirar</Button>
        </div>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {cand && (
          <Button size="sm" disabled={busy}
                  onClick={() => void send({ source: "candidate", candidate_id: cand.id })}>
            {`Es el #${selectedCandidate + 1}`}
          </Button>
        )}
        <Button size="sm" variant="outline" disabled={busy}
                onClick={() => setPickMode(marking ? null : "lesion_mark")}>
          {marking ? "Marcando… (clic en la malla)" : lesionMark ? "Volver a marcar" : "Marcar en la malla"}
        </Button>
        {lesionMark && (
          <Button size="sm" disabled={busy}
                  onClick={() => void send({
                    source: "marked",
                    position: { x: lesionMark[0], y: lesionMark[1], z: lesionMark[2] },
                  })}>
            Confirmar el punto marcado
          </Button>
        )}
        <Button size="sm" variant="ghost" disabled={busy}
                onClick={() => void send({ source: "no_lesion" })}>
          No hay aneurisma
        </Button>
      </div>

      {imagingStudyId == null && (
        <div style={{ fontSize: 11, color: "var(--muted-foreground)", lineHeight: 1.5, marginTop: 8 }}>
          Este estudio no está archivado: la confirmación cuenta para la estadística,
          pero no se podrá volver a pasar el detector sobre él.
        </div>
      )}
      {error && <div style={{ fontSize: 11, color: "var(--destructive)", marginTop: 8 }}>{error}</div>}
      {resumen && (
        <div style={{ fontSize: 11, color: "var(--muted-foreground)", lineHeight: 1.5, marginTop: 10 }}>
          {resumen}
        </div>
      )}
    </section>
  );
}
