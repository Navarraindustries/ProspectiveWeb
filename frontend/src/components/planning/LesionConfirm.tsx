/* «¿Cuál es la lesión?» — el profesional lo dice y eso mide al detector.

   El detector se ajustó con dos casos con diagnóstico. Cada confirmación es
   uno más, recogido donde ya se está mirando el caso. No cambia el plan: la
   morfometría sigue midiendo el candidato elegido. Ver
   backend/routers/ground_truth.py. */

import { useEffect, useState } from "react";
import { api } from "../../api/client";
import type {
  AneurysmCandidate, LesionConfirmation, LesionConfirmIn, LesionSummary,
} from "../../api/types";
import { Button } from "../Button";
import { ConfirmDialog } from "../ConfirmDialog";
import { usePlanning } from "../../store/planning";
import { MANUAL_CHANNEL, MANUAL_HINT, UNARCHIVED_NOTE, isManual } from "./detectCopy";

/** *cands*: la lista entera del panel, para nombrar lo que no tiene puesto
 *  (un descartado o un marcado a mano, F1-145/F1-146). */
function describe(c: LesionConfirmation, cands: readonly AneurysmCandidate[]): string {
  if (c.source === "no_lesion") return "Sin aneurisma en este estudio.";
  const cand = c.candidate_id ? cands.find((x) => x.id === c.candidate_id) : undefined;
  if (c.source === "candidate") {
    if (c.candidate_rank != null) return `La lesión es el candidato #${c.candidate_rank}.`;
    if (cand && isManual(cand)) return `La lesión es ${cand.id}, marcado a mano.`;
    if (c.candidate_id) return `La lesión es ${c.candidate_id}, que el detector descartó.`;
    return "La lesión es un candidato de una detección anterior.";
  }
  if (c.candidate_rank != null) return `Marcada a mano; coincide con el candidato #${c.candidate_rank}.`;
  if (cand && !isManual(cand)) return `Marcada a mano; coincide con ${cand.id}, que el detector descartó.`;
  return `Marcada a mano; no estaba entre los ${c.n_candidates} candidatos.`;
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
    sessionId, imagingStudyId, candidates, allCandidates, selectedCandidate,
    setCandidates, setSelectedCandidate, clearMorphometry,
    pickMode, setPickMode, lesionMark, setLesionMark,
  } = usePlanning();
  const [current, setCurrent] = useState<LesionConfirmation | null>(null);
  const [summary, setSummary] = useState<LesionSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // F1-147: «No hay aneurisma» quedaba registrado a tu nombre al primer clic,
  // y cuenta en la estadística del detector.
  const [askingNone, setAskingNone] = useState(false);

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
  // F1-145: la lista combinada, como el panel. Con `candidates` a secas, un
  // descartado elegido no tenía botón de confirmar.
  const cand = allCandidates[selectedCandidate];
  // Ya confirmado: el botón pasa a estado hecho en vez de ofrecerlo otra vez.
  const done = !!cand && current != null && current.source !== "no_lesion"
    && current.candidate_id === cand.id;

  const send = async (body: Omit<LesionConfirmIn, "session_id" | "imaging_study_id">) => {
    setBusy(true);
    setError(null);
    try {
      const c = await api.confirmLesion({ session_id: sessionId, imaging_study_id: imagingStudyId, ...body });
      setCurrent(c);
      setLesionMark(null);
      // F1-146: un punto que no era ningún candidato vuelve como uno nuevo,
      // «marcado a mano». Va con los aceptados (delante de los descartados,
      // como lo lista el backend) y queda elegido: si no, en un fallo del
      // detector no había nada que llevar a Morfometría.
      const pos = c.position;
      if (c.candidate_id && pos && !allCandidates.some((x) => x.id === c.candidate_id)) {
        const manual: AneurysmCandidate = {
          id: c.candidate_id, center_mm: pos, max_diameter_mm: 0, confidence: 0,
          dome_mesh_url: "", selected: false, channels: [MANUAL_CHANNEL],
          patch_kind: "manual", rank: 0, veto: null,
        };
        setCandidates([...candidates, manual]);
        setSelectedCandidate(candidates.length);
        // Explícito: el nuevo ocupa el índice del primer descartado, y si ese
        // era el elegido el índice no cambia y `setSelectedCandidate` no
        // limpia nada. Las cifras de aquel sitio quedaban bajo este.
        clearMorphometry();
      }
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
            <b>Confirmado:</b> {describe(current, allCandidates)}
            {current.created_by ? <span style={{ color: "var(--muted-foreground)" }}> · {current.created_by}</span> : null}
          </span>
          <Button size="sm" variant="ghost" onClick={() => void retract()} disabled={busy}>Retirar</Button>
        </div>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {/* F1-145: «Es el #1» numeraba por la posición en la lista, que no
            es el id que se ve en la tarjeta. */}
        {cand && (done
          ? <Button size="sm" variant="outline" disabled>Confirmada</Button>
          : (
            <Button size="sm" disabled={busy}
                    onClick={() => void send({ source: "candidate", candidate_id: cand.id })}>
              {`Confirmar ${cand.id} como la lesión`}
            </Button>
          ))}
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
                onClick={() => setAskingNone(true)}>
          No hay aneurisma
        </Button>
      </div>
      <ConfirmDialog
        open={askingNone}
        title="¿No hay aneurisma en este estudio?"
        confirmLabel="Registrar sin aneurisma"
        onCancel={() => setAskingNone(false)}
        onConfirm={() => { setAskingNone(false); void send({ source: "no_lesion" }); }}
      >
        Queda registrado a tu nombre que este estudio no tiene aneurisma, y cuenta para medir
        cómo acierta el detector. Puedes retirarlo después con «Retirar».
      </ConfirmDialog>

      <div style={{ fontSize: 11, color: "var(--muted-foreground)", lineHeight: 1.5, marginTop: 8 }}>
        {MANUAL_HINT}
      </div>

      {/* F1-148: «no se podrá volver a pasar el detector» no decía qué se pierde. */}
      {imagingStudyId == null && (
        <div style={{ fontSize: 11, color: "var(--muted-foreground)", lineHeight: 1.5, marginTop: 8 }}>
          {UNARCHIVED_NOTE}
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
