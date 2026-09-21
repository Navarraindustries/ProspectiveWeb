/* Paso 5 — Decisión terapéutica. POST /api/treatment-decision (motor de 8 factores). */

import { useState } from "react";
import { api } from "../../api/client";
import { ANEURYSM_LOCATIONS } from "../../api/types";
import type { AneurysmLocation } from "../../api/types";
import { Badge } from "../Badge";
import { Button } from "../Button";
import { Icon } from "../Icon";
import { Input } from "../Input";
import { Card, ErrorNote, PanelHead, SectionLabel } from "../PanelHead";
import { Select } from "../Select";
import { usePlanning } from "../../store/planning";

/* La barra es proporcional —para eso sirve— pero la cifra son PUNTOS. Un
   «CLIP 72 %» se lee como una probabilidad, o como la proporción de pacientes a
   los que les fue mejor, y no es ninguna de las dos: es el cociente de dos sumas
   de pesos elegidos a mano. */
function ScoreBar({ label, pct, points, fill }:
  { label: string; pct: number; points: number; fill: string }) {
  return (
    <div style={{ display: "flex", gap: 6, marginTop: 6, alignItems: "center" }}>
      <span style={{ fontSize: 11, fontWeight: 700, width: 40, color: "var(--brand-subtle-foreground)" }}>{label}</span>
      <div style={{ flex: 1, height: 10, borderRadius: 5, background: "color-mix(in srgb, var(--brand-deep) 20%, transparent)", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: fill, transition: "width var(--dur-base) var(--ease-out)" }} />
      </div>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, width: 52, textAlign: "right", color: "var(--brand-subtle-foreground)" }}>
        {points} pts
      </span>
    </div>
  );
}

/** Whole years from an ISO date of birth to today ("" when unknown/invalid). */
function ageFromDob(dob?: string | null): string {
  if (!dob) return "";
  const born = new Date(dob);
  if (Number.isNaN(born.getTime())) return "";
  const today = new Date();
  let years = today.getFullYear() - born.getFullYear();
  const m = today.getMonth() - born.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < born.getDate())) years -= 1;
  return years >= 0 && years <= 120 ? String(years) : "";
}

export function TreatmentPanel({ onNext }: { onNext: () => void }) {
  const planning = usePlanning();
  const { sessionId, treatment, patient } = planning;

  const [location, setLocation] = useState<AneurysmLocation>(ANEURYSM_LOCATIONS[0]);
  const [ruptured, setRuptured] = useState(false);
  // Pre-filled from the patient record — no reason to re-type what we know.
  const [age, setAge] = useState<string>(() => ageFromDob(patient?.dob));
  const [comorbid, setComorbid] = useState(false);
  // WFNS gradúa una hemorragia subaracnoidea y Fisher la sangre del TC: en un
  // aneurisma incidental no hay nada que graduar, así que sólo se piden cuando
  // el caso está roto. Vacío significa «no lo sé», no «grado 1».
  // La procedencia importa y no es lo que se lee a diario: doce líneas de
  // fuentes bajo siete factores tapan los factores. Plegada por defecto.
  const [showSources, setShowSources] = useState(false);
  const [wfns, setWfns] = useState<string>("");
  const [fisher, setFisher] = useState<string>("");
  // La única variable del JSDB que la aplicación no recogía en ninguna parte.
  const [priorStroke, setPriorStroke] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    if (!sessionId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.treatmentDecision({
        session_id: sessionId,
        location,
        is_ruptured: ruptured,
        patient_age: age ? Number(age) : null,
        has_comorbidities: comorbid,
        wfns_grade: ruptured && wfns ? Number(wfns) : null,
        fisher_grade: ruptured && fisher ? Number(fisher) : null,
        prior_stroke: ruptured && priorStroke !== "" ? Number(priorStroke) : null,
      });
      planning.setTreatment(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error en la decisión terapéutica");
    } finally {
      setBusy(false);
    }
  };

  // Re-evaluar sobrescribe la recomendación, pero no había forma de quitarla:
  // una evaluación hecha con la localización equivocada se quedaba en el PDF.
  const clear = async () => {
    if (!sessionId) return;
    setClearing(true);
    setError(null);
    try {
      await api.clearTreatment(sessionId);
      planning.setTreatment(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo limpiar la decisión");
    } finally {
      setClearing(false);
    }
  };

  const t = treatment;

  return (
    <div className="fade-rise">
      <PanelHead title="Decisión terapéutica" desc="Compara clipaje y tratamiento endovascular. Los índices de forma no puntúan: describen la vía endovascular, que es donde tienen respaldo." />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        <Select
          label="Localización"
          options={ANEURYSM_LOCATIONS}
          value={location}
          onChange={(e) => setLocation(e.target.value as AneurysmLocation)}
        />
        <Select
          label="Estado"
          options={[
            { value: "no", label: "No roto (electivo)" },
            { value: "si", label: "Roto (SAH)" },
          ]}
          value={ruptured ? "si" : "no"}
          onChange={(e) => setRuptured(e.target.value === "si")}
        />
      </div>
      <SectionLabel style={{ marginTop: 14 }}>Contexto clínico</SectionLabel>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, alignItems: "end" }}>
        <Input label="Edad del paciente" type="number" min={0} max={120} placeholder="—" value={age} onChange={(e) => setAge(e.target.value)} />
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--foreground)", height: "var(--control-md)", cursor: "pointer" }}>
          <input type="checkbox" checked={comorbid} onChange={(e) => setComorbid(e.target.checked)} />
          Comorbilidad quirúrgica
        </label>
      </div>
      {/* La comorbilidad sigue sin puntuar: no hay estructura publicada que
          trasladar, y un peso inventado sería indistinguible de los umbrales
          que sí tienen fuente. La edad ya no está en ese grupo. */}
      <div style={{ display: "flex", gap: 6, marginTop: 6, fontSize: 11, color: "var(--muted-foreground)", lineHeight: 1.45 }}>
        <Icon name="INFO" size={13} color="var(--muted-foreground)" />
        <span>
          La edad puntúa <b>sólo en aneurismas no rotos</b>: en los rotos la cuenta el
          modelo del Japan Stroke Data Bank, que es de donde salen los cortes de 72 y
          80 años, y sumarla en los dos sitios sería contarla dos veces. La
          comorbilidad no puntúa en ninguno: se registra y aparece en el informe,
          porque no hay puntuación publicada que trasladar.
        </span>
      </div>

      {/* Sólo con hemorragia. Es la variable de mayor peso del modelo validado,
          y hasta ahora la aplicación no la recogía en absoluto. */}
      {ruptured && (
        <>
          <SectionLabel style={{ marginTop: 14 }}>Grado de la hemorragia</SectionLabel>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Select
              label="WFNS"
              options={[
                { value: "", label: "Sin graduar" },
                ...[1, 2, 3, 4, 5].map((g) => ({ value: String(g), label: `WFNS ${g}` })),
              ]}
              value={wfns}
              onChange={(e) => setWfns(e.target.value)}
            />
            <Select
              label="Fisher (sangre en TC)"
              options={[
                { value: "", label: "Sin graduar" },
                ...[1, 2, 3, 4].map((g) => ({ value: String(g), label: `Fisher ${g}` })),
              ]}
              value={fisher}
              onChange={(e) => setFisher(e.target.value)}
            />
          </div>
          <div style={{ marginTop: 12 }}>
            <Select
              label="Ictus previos"
              options={[
                { value: "", label: "Sin registrar" },
                { value: "0", label: "Ninguno" },
                { value: "1", label: "Uno" },
                { value: "2", label: "Dos o más" },
              ]}
              value={priorStroke}
              onChange={(e) => setPriorStroke(e.target.value)}
            />
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 6, fontSize: 11, color: "var(--muted-foreground)", lineHeight: 1.45 }}>
            <Icon name="INFO" size={13} color="var(--muted-foreground)" />
            <span>
              Los tres alimentan el modelo del Japan Stroke Data Bank, abajo — ya no
              el sumatorio heurístico, donde estaban copiados a mano y peor resueltos.
              Son opcionales, pero el WFNS es la variable de más peso del modelo y el
              ictus previo es asimétrico: al coiling le penaliza desde el primero, al
              clipaje desde el segundo.
            </span>
          </div>
        </>
      )}

      <Button style={{ marginTop: 14, width: "100%" }} variant={t ? "outline" : "default"} onClick={() => void run()} disabled={busy || clearing || !sessionId}>
        {busy ? "Evaluando…" : t ? "Re-evaluar" : "Evaluar CLIP vs ENDOVASCULAR"}
      </Button>
      {t && (
        <Button
          variant="ghost" style={{ marginTop: 8, width: "100%" }}
          disabled={busy || clearing}
          onClick={() => void clear()}
          leadingIcon={<Icon name="CLEAR" size={14} />}
        >
          {clearing ? "Limpiando…" : "Limpiar decisión y PHASES"}
        </Button>
      )}
      <ErrorNote>{error}</ErrorNote>

      {t && (
        <>
          <div style={{ background: "var(--brand-subtle)", borderRadius: "var(--radius-lg)", padding: "16px 18px", margin: "16px 0" }}>
            {/* El titular manda en su propia línea. Compartiendo un flex con dos
                insignias que no encogen se quedaba sin ancho, y con
                `overflow-wrap: anywhere` no envolvía por palabras sino por
                letras: «TRAT / AMIE / NTO / ENDO / VASC / ULAR». */}
            <div style={{ fontSize: 15, fontWeight: 800, lineHeight: 1.3, color: "var(--brand-subtle-foreground)" }}>
              Recomendación: {t.recommendation}
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
              {/* La cobertura al lado de la confianza, porque es lo que la
                  limita: antes la confianza medía cuántos factores había, y un
                  caso con un solo dato salía como «Moderada». */}
              <Badge variant={t.coverage_pct >= 80 ? "subtle" : "warning"}>
                {t.coverage_pct} % del caso
              </Badge>
              <Badge variant="subtle">Confianza {t.confidence.toLowerCase()}</Badge>
            </div>
            <div style={{ marginTop: 12 }}>
              <ScoreBar label="CLIP" pct={t.clip_pct} points={t.clip_points} fill="var(--brand-deep)" />
              <ScoreBar label="ENDO" pct={t.endo_pct} points={t.endo_points} fill="var(--brand-slate)" />
              <div style={{ fontSize: 11, color: "var(--brand-subtle-foreground)", marginTop: 8, lineHeight: 1.5, opacity: 0.85 }}>
                Puntos de un sumatorio con pesos elegidos a mano. No es una
                probabilidad: mide cuántos factores apuntan a cada lado y con qué
                peso. Cada factor dice debajo de dónde sale el suyo.
              </div>
            </div>
          </div>

          {t.notes.length > 0 && (
            <div style={{ marginBottom: 14, display: "flex", flexDirection: "column", gap: 6 }}>
              {t.notes.map((n, i) => (
                <div key={i} style={{
                  fontSize: 12, lineHeight: 1.55, color: "var(--foreground)",
                  background: "var(--muted)", borderRadius: "var(--radius-md)",
                  borderLeft: "3px solid var(--warning)", padding: "8px 10px",
                }}>
                  {n}
                </div>
              ))}
            </div>
          )}

          {/* El único modelo ajustado del paso, y por eso va ANTES del
              sumatorio heurístico. Dos puntuaciones separadas, no una resta:
              es lo único aquí que puede decir «las dos vías van mal». */}
          {t.jsdb && (
            <>
              <SectionLabel style={{ marginTop: 16 }}>
                Riesgo estimado por cada vía · Japan Stroke Data Bank
              </SectionLabel>
              <Card style={t.jsdb.both_poor ? { borderLeft: "3px solid var(--warning)" } : undefined}>
                <div style={{ fontSize: 11.5, color: "var(--muted-foreground)", lineHeight: 1.5, marginBottom: 10 }}>
                  Modelo ajustado sobre 3 547 hemorragias. Puntúa el riesgo de mal
                  resultado al alta (mRS&nbsp;&gt;&nbsp;2) de <b>cada vía por separado</b>,
                  no cuál elegir. Más puntos es peor.
                </div>
                {[t.jsdb.clip, t.jsdb.coil].map((arm) => (
                  <div key={arm.arm} style={{ marginTop: 8 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <span style={{ fontSize: 12, fontWeight: 700, flex: 1, color: "var(--foreground)" }}>
                        {arm.label}
                      </span>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--muted-foreground)" }}>
                        {arm.points} / {arm.max_points}
                      </span>
                    </div>
                    <div style={{ height: 8, borderRadius: 4, marginTop: 4, background: "color-mix(in srgb, var(--brand-deep) 15%, transparent)", overflow: "hidden" }}>
                      <div style={{
                        height: "100%",
                        width: `${(arm.points / arm.max_points) * 100}%`,
                        background: arm.points >= 3 ? "var(--warning)" : "var(--brand-slate)",
                        transition: "width var(--dur-base) var(--ease-out)",
                      }} />
                    </div>
                    <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 3, lineHeight: 1.45 }}>
                      {arm.items.length > 0
                        ? arm.items.map((i) => i.label).join(" · ")
                        : "Nada que penalice esta vía con los datos disponibles."}
                    </div>
                  </div>
                ))}
                <div style={{ fontSize: 12, color: "var(--foreground)", marginTop: 12, lineHeight: 1.5 }}>
                  {t.jsdb.verdict}
                </div>
                {t.jsdb.missing.length > 0 && (
                  <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 8, lineHeight: 1.45 }}>
                    Rellenado el {t.jsdb.known_pct} % del modelo; falta{" "}
                    {t.jsdb.missing.join(", ")}. Una variable desconocida no es una
                    variable en cero.
                  </div>
                )}
                {showSources && (
                  <div style={{ fontSize: 10.5, color: "var(--muted-foreground)", marginTop: 8, lineHeight: 1.45, opacity: 0.85 }}>
                    {t.jsdb.source}
                  </div>
                )}
              </Card>
            </>
          )}

          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 16 }}>
            <SectionLabel style={{ flex: 1 }}>Factores contribuyentes</SectionLabel>
            <button
              onClick={() => setShowSources((v) => !v)}
              style={{
                background: "transparent", border: "none", cursor: "pointer",
                padding: 0, fontSize: 11, fontWeight: 600,
                color: "var(--brand-deep)",
              }}
            >
              {showSources ? "Ocultar procedencia" : "Ver procedencia"}
            </button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {t.factors.map((f) => (
              /* Rejilla, no flex: la insignia se ajustaba a su contenido, así
                 que «ENDO +25» y «CLIP ·» dejaban el texto arrancando en sitios
                 distintos y el borde izquierdo quedaba dentado. Una columna fija
                 alinea las seis filas por construcción. */
              <div key={f.name} style={{ display: "grid", gridTemplateColumns: "58px 1fr", gap: 10, alignItems: "start" }}>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    padding: "2px 0",
                    borderRadius: 5,
                    marginTop: 1,
                    textAlign: "center",
                    whiteSpace: "nowrap",
                    background: f.direction === "neutral" ? "var(--muted)" : "var(--brand-subtle)",
                    color: f.direction === "neutral" ? "var(--muted-foreground)" : "var(--brand-subtle-foreground)",
                  }}
                >
                  {f.direction === "clip" ? "CLIP" : f.direction === "endo" ? "ENDO" : "—"}
                  {f.votes ? (f.points > 0 ? ` +${f.points}` : "") : " ·"}
                </span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--foreground)" }}>
                    {f.name}
                    {/* Lo que se mide, se enseña y no suma. Sin esta marca el
                        factor se lee como si estuviera pesando. */}
                    {!f.votes && (
                      <span style={{ fontSize: 10, fontWeight: 700, marginLeft: 6, padding: "1px 5px", borderRadius: 4, whiteSpace: "nowrap", background: "var(--muted)", color: "var(--muted-foreground)", verticalAlign: "middle" }}>
                        no puntúa
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>{f.detail}</div>
                  {showSources && f.source && (
                    <div style={{ fontSize: 10.5, color: "var(--muted-foreground)", marginTop: 3, lineHeight: 1.45, opacity: 0.85 }}>
                      {f.source}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Lo que la imagen no puede dar. Una perforante mide 0,1–0,5 mm y el
              vóxel de una angio-TC ronda 0,5–1,0 mm: no llega a la malla, así
              que el barrido de ramas no la encuentra y su silencio no significa
              que no esté. Lo que sí se sabe sin verla es dónde nace. */}
          {t.perforators && (
            <>
              <SectionLabel style={{ marginTop: 16 }}>Perforantes que esperar aquí</SectionLabel>
              <Card style={{ borderLeft: "3px solid var(--warning)" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--foreground)", lineHeight: 1.4 }}>
                  {t.perforators.arteries}
                </div>
                <div style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 4, lineHeight: 1.5 }}>
                  Irrigan {t.perforators.supplies}. Lesionarlas: {t.perforators.consequence}.
                </div>
                {t.perforators.surgical_note && (
                  <div style={{ fontSize: 12, color: "var(--foreground)", marginTop: 8, lineHeight: 1.5 }}>
                    {t.perforators.surgical_note}
                  </div>
                )}
                <div style={{ fontSize: 10.5, color: "var(--muted-foreground)", marginTop: 8, lineHeight: 1.45, opacity: 0.85 }}>
                  No es una medida de este paciente: es la anatomía de esa localización,
                  y las variantes son frecuentes. La imagen no resuelve un vaso de
                  0,1–0,5 mm.
                  {showSources && t.perforators.sources.length > 0 && (
                    <> {t.perforators.sources.join(" · ")}</>
                  )}
                </div>
              </Card>
            </>
          )}

          {/* La otra opción, descrita gane o no. Es donde la morfología sí tiene
              respaldo publicado: la definición de cuello ancho predice si hará
              falta balón o stent, y el aspect ratio predice recanalización. */}
          {t.endovascular && t.endovascular.technique !== "unknown" && (
            <>
              <SectionLabel style={{ marginTop: 16 }}>Si se opta por la vía endovascular</SectionLabel>
              <Card>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--foreground)" }}>
                  {t.endovascular.technique_label}
                </div>
                <div style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 4, lineHeight: 1.5 }}>
                  {t.endovascular.rationale}
                </div>
                {t.endovascular.durability && (
                  <div style={{ fontSize: 12, color: "var(--foreground)", marginTop: 8, lineHeight: 1.5 }}>
                    <b>Durabilidad. </b>{t.endovascular.durability}
                  </div>
                )}
                {t.endovascular.cautions.map((c, i) => (
                  <div key={i} style={{ fontSize: 11.5, color: "var(--muted-foreground)", marginTop: 6, lineHeight: 1.5 }}>
                    — {c}
                  </div>
                ))}
                {showSources && t.endovascular.sources.length > 0 && (
                  <div style={{ fontSize: 10.5, color: "var(--muted-foreground)", marginTop: 8, lineHeight: 1.45, opacity: 0.85 }}>
                    {t.endovascular.sources.join(" · ")}
                  </div>
                )}
              </Card>
            </>
          )}
        </>
      )}

      <Button style={{ marginTop: 18, width: "100%" }} onClick={onNext} disabled={!t} trailingIcon={<Icon name="CLIPS" />}>
        Planificar dispositivos
      </Button>
    </div>
  );
}
