/* Paso 3 — Detección de candidatos. POST /api/detect/{session}. */

import { useEffect, useRef, useState } from "react";
import { api } from "../../api/client";
import { DUR, EASE, motion } from "../../motion";
import { Badge } from "../Badge";
import { Button } from "../Button";
import { ConfirmDialog } from "../ConfirmDialog";
import { Icon } from "../Icon";
import { PanelHead, ErrorNote } from "../PanelHead";
import { PanelActions, PanelFooter } from "../PanelFooter";
import { ProgressBar } from "../ProgressBar";
import { LesionConfirm } from "./LesionConfirm";
import { SegmentProgress } from "../segmentation/SegmentProgress";
import { CONNECTION_LOST, useProgress } from "../../api/progress";
import { usePlanning } from "../../store/planning";
import type { DetectionDiagnostics } from "../../api/types";
import {
  ALL_REJECTED, DETECT_LINES, DETECT_MORE, MANUAL_BADGE, MORPHO_INVALIDATED, SMALL_SAC_CHANNEL,
  channelLabel, channelTitle, candidateName, isManual, rejectedSummary, thicknessLabel, vetoHint,
} from "./detectCopy";
import { canAdvanceFromDetect } from "./detectGate";
import { cifraCorta } from "../../lib/numero";
import { useTableta } from "../../hooks/useEstrecho";

/** Letra mínima del panel en tableta y móvil (R19). */
export const TEXTO_MIN_TABLETA = 13;

/** Número de la última detección pedida. De módulo y no del componente: si el
 *  panel se desmonta y se vuelve a montar con una detección en vuelo, la
 *  respuesta vieja llegaría después y pisaría la nueva en el store. Solo la
 *  respuesta de la última petición escribe. */
let detectSeq = 0;

/** Turn the rejection counts into the one sentence that matters.
 *
 *  Measured over the corpus, the size gate accounts for 61-94% of rejections,
 *  and its share grows with how complete the mesh is: on a whole vascular tree
 *  the high-curvature patches merge across several vessels, so their equivalent
 *  radius exceeds the bound and every one of them is discarded. That is why
 *  cropping the region of interest before detecting works so well. */
function explainEmpty(d: DetectionDiagnostics): { reason: string; advice: string } {
  if (d.regions_analyzed === 0) {
    return {
      reason: "La malla no tiene regiones de curvatura suficientes para analizar.",
      advice: "Suele indicar una malla demasiado escasa: baja la limpieza o segmenta a resolución completa.",
    };
  }
  const gates: [number, string, string][] = [
    [d.rejected_size,
     `su tamaño quedó fuera del rango de ${cifraCorta(d.min_radius_mm)}–${cifraCorta(d.max_radius_mm)} mm`,
     "En una malla completa los parches de curvatura se fusionan entre vasos y superan el radio máximo. Recorta la región de interés alrededor del aneurisma y vuelve a detectar."],
    [d.rejected_mean_curvature,
     "su curvatura media no llegó al mínimo",
     "La superficie es demasiado plana ahí: revisa el umbral de segmentación, puede estar capturando hueso o tejido."],
    [d.rejected_positive_gauss,
     "no tenían bastante superficie convexa",
     "Son salientes alargados más que domos. Un recorte alrededor de la zona sospechosa ayuda."],
    [d.rejected_compactness,
     "su forma era demasiado irregular",
     "Suele venir de una malla ruidosa: sube un punto la limpieza o suaviza algo más."],
    [d.rejected_too_few_points,
     "eran demasiado pequeñas",
     "Prueba a segmentar a resolución completa para que los domes finos tengan más superficie."],
    [d.rejected_sphericity, "no eran bastante esféricas",
     "Recorta la región de interés y repite la detección."],
  ];
  gates.sort((a, b) => b[0] - a[0]);
  const [n, why, advice] = gates[0]!;
  const pct = Math.round((100 * n) / Math.max(d.regions_analyzed, 1));
  return {
    reason: `Se analizaron ${d.regions_analyzed.toLocaleString("es")} regiones de alta curvatura y ninguna pasó los filtros de forma. El motivo dominante: ${n.toLocaleString("es")} (${pct} %) se descartaron porque ${why}.`,
    advice,
  };
}

export function DetectPanel({ onNext }: { onNext: () => void }) {
  const planning = usePlanning();
  // ≤ 1024 (R19): nada del panel por debajo de 13 px —viñetas, «Candidato N»,
  // «azul = dónde, no el saco»…—; en ancho se queda la letra pequeña.
  const tableta = useTableta();
  const fs = (px: number) => (tableta ? Math.max(TEXTO_MIN_TABLETA, px) : px);
  const {
    sessionId, candidates, rejectedCandidates, allCandidates, selectedCandidate,
    morphoInvalidatedNotice,
  } = planning;
  const [busy, setBusy] = useState(false);
  // Medio minuto en una malla real: la fase que va (curvatura, calibre y
  // cociente, regiones) en vez de una barra muda.
  const progress = useProgress(sessionId, busy);
  const [error, setError] = useState<string | null>(null);
  // Con solo descartados también hubo detección: no se repite al volver.
  const [ran, setRan] = useState(allCandidates.length > 0);
  const [clearing, setClearing] = useState(false);
  const [askingClear, setAskingClear] = useState(false);
  const [diag, setDiag] = useState<DetectionDiagnostics | null>(null);
  // Los descartados empiezan plegados: están para poder discrepar del
  // detector, no para recorrerlos primero.
  const [showRejected, setShowRejected] = useState(false);
  // F1-142: la explicación larga va plegada detrás de «Más».
  const [showMore, setShowMore] = useState(false);
  // «encontrados» es lo que encontró el detector: un punto marcado a mano y
  // confirmado (F1-146) está en la lista, pero no lo encontró él.
  const found = candidates.filter((c) => !isManual(c)).length;
  // Índice combinado: los descartados van detrás de los aceptados.
  const selectedRejected = selectedCandidate >= candidates.length
    ? rejectedCandidates[selectedCandidate - candidates.length] ?? null
    : null;

  const run = async () => {
    if (!sessionId) return;
    const seq = ++detectSeq;
    setBusy(true);
    setError(null);
    try {
      const res = await api.detect(sessionId);
      if (seq !== detectSeq) return;
      const rejected = res.rejected ?? [];
      planning.setCandidates(res.candidates);
      planning.setRejectedCandidates(rejected);
      planning.setSelectedCandidate(0);
      // El backend ya borró la medida; el store tiene que olvidarla también.
      // `setSelectedCandidate(0)` solo lo hace si el índice cambia.
      if (res.morphometry_invalidated === true) planning.clearMorphometry();
      planning.setMorphoInvalidatedNotice(res.morphometry_invalidated === true);
      setRan(true);
      setDiag(res.diagnostics ?? null);
      if (!res.found && rejected.length === 0) {
        setError("No se encontraron candidatos aneurismáticos en la malla.");
      }
    } catch (err) {
      if (seq !== detectSeq) return;
      setError(err instanceof Error ? err.message : "Error en la detección");
    } finally {
      if (seq === detectSeq) setBusy(false);
    }
  };

  // Take the candidate domes out of the scene and off the record — including the
  // morphometry (and any hand-marked neck plane) measured on them, which the
  // backend otherwise reapplies to every later measurement. Needed before
  // re-detecting on an edited mesh, and to clear a wrong candidate from the plan.
  const clear = async () => {
    if (!sessionId) return;
    setClearing(true);
    setError(null);
    try {
      await api.clearDetection(sessionId);
      planning.setCandidates([]);
      planning.setRejectedCandidates([]);
      planning.setSelectedCandidate(0);
      planning.setMorphometry(null);
      planning.setTreatment(null);
      setDiag(null);
      planning.setMorphoInvalidatedNotice(false);
      setRan(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron limpiar los candidatos");
    } finally {
      setClearing(false);
    }
  };

  // Run automatically the first time the step opens. Once per mount: StrictMode
  // runs mount effects twice, and two concurrent detections on one session
  // race on the server (the second can read the first's half-cleared state and
  // wrongly invalidate the morphometry).
  const autoRan = useRef(false);
  useEffect(() => {
    if (autoRan.current) return;
    autoRan.current = true;
    if (!ran && sessionId && !busy) void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fade-rise">
      <PanelHead
        title="Candidatos detectados"
        desc="Zonas de la vasculatura que merece la pena mirar, en una lista corta para recorrer."
        right={ran && <Badge variant="subtle">{found} encontrados</Badge>}
      />

      {busy && (
        <div style={{ marginBottom: 14 }}>
          {progress === CONNECTION_LOST
            ? <ProgressBar />
            : <SegmentProgress
                state={progress}
                headline="Detectando… suele tardar alrededor de un minuto"
                slowNote="El servidor tarda: en una malla grande la detección pasa del minuto."
              />}
        </div>
      )}

      {/* Hubo aquí un aviso naranja «La malla está a media resolución… la lesión
          bajó al 5.º puesto» (Case 3, antes de la banda a resolución nativa). Desde
          que el árbol se vuelve a segmentar a resolución nativa en su banda
          (fallback_note lo cuenta en Segmentación), la cifra ya no era cierta y
          sembraba una duda delante del caso: fuera (30-10). */}

      {/* F1-142: tres párrafos delante de la lista, con una cifra fija («los
          dos casos con diagnóstico») que ya no era verdad. Tres líneas y el
          resto plegado; la cifra viva la da «¿Cuál es la lesión?». */}
      {ran && candidates.length > 1 && (
        <div role="note" aria-label="Cómo leer la lista"
             style={{ fontSize: fs(11), color: "var(--muted-foreground)", marginBottom: 10, lineHeight: 1.5 }}>
          <ul style={{ margin: 0, paddingLeft: 16 }}>
            {DETECT_LINES.map((t) => <li key={t}>{t}</li>)}
          </ul>
          {showMore && DETECT_MORE.map((t) => <p key={t} style={{ margin: "6px 0 0" }}>{t}</p>)}
          <Button
            variant="link"
            size="sm"
            aria-expanded={showMore}
            onClick={() => setShowMore((v) => !v)}
            trailingIcon={
              <motion.span
                aria-hidden
                style={{ display: "inline-flex" }}
                animate={{ rotate: showMore ? 90 : 0 }}
                transition={{ duration: DUR.respuesta, ease: EASE }}
              >
                <Icon name="CHEVRON_RIGHT" size={12} />
              </motion.span>
            }
          >
            {showMore ? "Menos" : "Más"}
          </Button>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {candidates.map((c, i) => {
          const on = selectedCandidate === i;
          // Un punto marcado a mano no tiene grosor medido ni puesto del detector.
          const manual = isManual(c);
          return (
            <div
              key={c.id}
              className="tarjeta-lente"
              onClick={() => planning.setSelectedCandidate(i)}
              style={{
                cursor: "pointer",
                border: `var(--glass-rim) solid ${on ? "var(--primary)" : "var(--glass-border)"}`,
                background: on ? "var(--brand-subtle)" : "var(--glass)",
                borderRadius: "var(--radius-lg)",
                padding: "12px 14px",
                transition: "all var(--dur-fast) var(--ease-out)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: fs(12), fontWeight: 600, color: "var(--foreground)", whiteSpace: "nowrap" }}>{candidateName(c, false, i)}</span>
                {/* Qué criterio lo encontró. Que coincidan varios es
                    información para el clínico; el orden no lo es. */}
                {manual
                  ? <Badge variant="subtle">{MANUAL_BADGE}</Badge>
                  : (c.channels ?? []).map((ch) => (
                    // El canal de la cuota («saco pequeño») va en gris y con su
                    // explicación al pasar el ratón: no es un voto más (30-10).
                    <span key={ch} title={channelTitle(ch)}>
                      <Badge variant={ch === "curvatura" || ch === SMALL_SAC_CHANNEL ? "subtle" : "success"}>
                        {channelLabel(ch)}
                      </Badge>
                    </span>
                  ))}
                {/* Decisión nº 20 (F1-144): sin «Puesto bajo». El nombre
                    («Candidato 4») ya dice el orden, y la marca juzgaba con un
                    orden que no está validado. */}
                <div style={{ flex: 1 }} />
                {on && <Icon name="STATUS_OK" size={15} color="var(--brand-deep)" />}
              </div>
              <div style={{ display: "flex", gap: 16, marginTop: 8 }}>
                {/* F1-143: «Ø 3.7 mm est.» se leía como el diámetro del
                    aneurisma; es el grosor estimado en ese punto. */}
                {!manual && (
                  <span style={{ fontSize: fs(12), color: "var(--muted-foreground)" }}>
                    {thicknessLabel(c.max_diameter_mm)}
                  </span>
                )}
                {c.patch_kind === "locator" && (
                  <span style={{ fontSize: fs(10.5), color: "var(--muted-foreground)" }}>
                    azul = dónde, no el saco
                  </span>
                )}
                <span style={{ flex: 1 }} />
                {/* El puesto ya va en el nombre («Candidato 3»); la barra sigue
                    dando la puntuación relativa. */}
              </div>
              {!manual && (
                <div style={{ height: 4, borderRadius: 2, background: "var(--muted)", marginTop: 6, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${c.confidence * 100}%`, background: "var(--primary)" }} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {rejectedCandidates.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <button
            type="button"
            aria-expanded={showRejected}
            onClick={() => setShowRejected((v) => !v)}
            style={{
              display: "flex", alignItems: "center", gap: 6, width: "100%",
              background: "none", border: "none", padding: "4px 0", cursor: "pointer",
              fontSize: fs(12), fontWeight: 700, color: "var(--muted-foreground)", textAlign: "left",
            }}
          >
            <span aria-hidden style={{ display: "inline-block", width: 10 }}>{showRejected ? "▾" : "▸"}</span>
            {rejectedSummary(rejectedCandidates.length)}
          </button>
          {/* Todos los candidatos se dibujan a la vez en el 3D; los descartados,
              tenues, se pueden apagar si estorban en un caso con muchos. */}
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: fs(12), color: "var(--muted-foreground)", padding: "2px 0 2px 16px", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={planning.showRejectedIn3d}
              onChange={(e) => planning.setShowRejectedIn3d(e.target.checked)}
            />
            Ver los descartados en el 3D
          </label>
          {showRejected && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
              <div style={{ fontSize: fs(11), color: "var(--muted-foreground)" }}>
                El detector los apartó por un criterio geométrico. Se listan para poder
                discrepar: elegir uno lo pinta en el 3D.
              </div>
              {rejectedCandidates.map((c, i) => {
                const idx = candidates.length + i;
                const on = selectedCandidate === idx;
                return (
                  <div
                    key={c.id}
                    className="tarjeta-lente"
                    onClick={() => planning.setSelectedCandidate(idx)}
                    style={{
                      cursor: "pointer",
                      border: `1px ${on ? "solid var(--warning)" : "dashed var(--border)"}`,
                      background: on ? "var(--warning-bg)" : "transparent",
                      borderRadius: "var(--radius-md)",
                      padding: "8px 12px",
                      transition: "all var(--dur-fast) var(--ease-out)",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: fs(12), fontWeight: 600, color: "var(--foreground)" }}>{candidateName(c, true, i)}</span>
                      <span style={{ fontSize: fs(12), color: "var(--muted-foreground)" }}>
                        {thicknessLabel(c.max_diameter_mm)}
                      </span>
                      <div style={{ flex: 1 }} />
                      {c.veto && (
                        <span title={c.veto.detail}>
                          <Badge variant="warning">{c.veto.label}</Badge>
                        </span>
                      )}
                      {on && <Icon name="STATUS_OK" size={15} color="var(--warning)" />}
                    </div>
                    {on && (
                      <div style={{ fontSize: fs(11), color: "var(--warning)", marginTop: 6 }}>
                        {vetoHint(c.veto?.label)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Si el elegido es un descartado con el desplegable cerrado, la
          advertencia no puede quedarse escondida dentro. */}
      {selectedRejected && !showRejected && (
        <div style={{ fontSize: fs(11), color: "var(--warning)", marginTop: 8 }}>
          {candidateName(selectedRejected, true, rejectedCandidates.indexOf(selectedRejected))}: {vetoHint(selectedRejected.veto?.label)}
        </div>
      )}

      {morphoInvalidatedNotice && (
        <div role="status" style={{
          marginTop: 10, padding: "8px 12px", borderRadius: "var(--radius-md)",
          border: "1px solid var(--warning)", background: "var(--warning-bg)",
          fontSize: fs(12), color: "var(--warning)",
        }}>
          {MORPHO_INVALIDATED}
        </div>
      )}

      <ErrorNote>{error}</ErrorNote>

      {/* Todo vetado no es un vacío: hay sitios, y se pueden elegir y medir. */}
      {ran && !busy && candidates.length === 0 && rejectedCandidates.length > 0 && (
        <div style={{ fontSize: fs(12), color: "var(--muted-foreground)", marginTop: 10 }}>
          {ALL_REJECTED}
        </div>
      )}

      {ran && !busy && <LesionConfirm />}

      {/* An empty result is a finding, not a failure — but only if it says why. */}
      {ran && !busy && allCandidates.length === 0 && diag && (() => {
        const { reason, advice } = explainEmpty(diag);
        return (
          <div style={{
            marginTop: 10, padding: "12px 14px", borderRadius: "var(--radius-md)",
            border: "var(--glass-rim) solid var(--glass-border)", background: "var(--glass)",
            fontSize: fs(12), lineHeight: 1.55, color: "var(--muted-foreground)",
          }}>
            <div style={{ fontWeight: 700, color: "var(--foreground)", marginBottom: 4 }}>
              Por qué no se encontró nada
            </div>
            <div>{reason}</div>
            <div style={{ marginTop: 6, color: "var(--foreground)" }}>{advice}</div>
            {diag.removed_components > 0 && (
              <div style={{ marginTop: 6 }}>
                Antes de analizar se descartaron {diag.removed_components.toLocaleString("es")} fragmentos
                sueltos de la malla.
              </div>
            )}
          </div>
        );
      })()}

      {(allCandidates.length > 0 || ran) && (
        <Button
          variant="ghost"
          style={{ marginTop: 18, width: "100%" }}
          disabled={busy || clearing || !sessionId}
          onClick={() => setAskingClear(true)}
          leadingIcon={<Icon name="CLEAR" size={14} />}
        >
          {clearing ? "Limpiando…" : "Limpiar candidatos y morfometría"}
        </Button>
      )}
      <PanelFooter>
        <PanelActions>
          <Button variant="outline" onClick={() => void run()} disabled={busy || clearing || !sessionId} leadingIcon={<Icon name="REFRESH" />}>
            Re-detectar
          </Button>
          <Button
            onClick={onNext}
            disabled={!canAdvanceFromDetect(candidates, rejectedCandidates)}
            trailingIcon={<Icon name="STEP_MORPHO" />}
          >
            Analizar morfometría
          </Button>
        </PanelActions>
      </PanelFooter>
      {/* F1-12: limpiar se llevaba la medida, el cuello marcado a mano y la
          recomendación al primer clic, sin forma de recuperarlos. */}
      <ConfirmDialog
        open={askingClear}
        title="¿Limpiar candidatos y morfometría?"
        confirmLabel="Limpiar"
        destructive
        onCancel={() => setAskingClear(false)}
        onConfirm={() => { setAskingClear(false); void clear(); }}
      >
        Se pierden los candidatos, la medida, el cuello marcado y la recomendación de tratamiento.
      </ConfirmDialog>
    </div>
  );
}
