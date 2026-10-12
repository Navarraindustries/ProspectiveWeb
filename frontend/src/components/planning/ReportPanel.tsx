/* Paso 7 — Informe y exportación. POST /api/report · /api/export/stl · /api/export/glb · /api/sessions/save. */

import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../api/client";
import type { DeviceClearResult, DicomSegResult, GlbExportResult, ReportResult, TeamDecision } from "../../api/types";
import { Badge, riskVariant } from "../Badge";
import { Button } from "../Button";
import { Icon } from "../Icon";
import { CapturePicker } from "./CapturePicker";
import { Input } from "../Input";
import { Metric } from "../Metric";
import { PanelHead, SectionLabel, ErrorNote, Card } from "../PanelHead";
import { Separator } from "../Separator";
import { PrintPrepPanel } from "./PrintPrepPanel";
import { useAuth } from "../../store/auth";
import { usePlanning } from "../../store/planning";
import { STEPS } from "../../pipeline/steps";
import { approachSummary } from "./approachSummary";

/** F1-220: las palabras del informe para la decisión del equipo y la estrategia. */
const TEAM_LABEL: Record<string, string> = {
  clipaje: "Clipaje", endovascular: "Endovascular", vigilar: "Vigilar", otra: "Otra",
};
const STRATEGY_LABEL: Record<string, string> = {
  clips: "Clips", coils: "Coils", stent: "Stent", stent_cl: "Stent CL", web: "WEB",
};

/** «Coils · 3 en el plan». El WEB se dimensiona pero no se coloca: sin cuenta. */
function strategySummary(d: DeviceClearResult | null): string {
  const s = d?.strategy;
  if (!s) return "—";
  if (s === "web") return STRATEGY_LABEL.web!;
  const n = d.placed_counts?.[s] ?? 0;
  return `${STRATEGY_LABEL[s]} · ${n > 0 ? `${n} en el plan` : "ninguno en el plan"}`;
}

function teamSummary(t: TeamDecision | null): string {
  if (!t?.team_decision) return "—";
  const what = t.team_decision === "otra" && t.other_text ? `Otra: ${t.other_text}` : TEAM_LABEL[t.team_decision]!;
  return t.decided_by ? `${what} · por ${t.decided_by}` : what;
}

/** Index of this step in the workspace rail — what a session saved here resumes at. */
// Por su clave, no por un número: era un 6 fijo, y desde que «Fabricación»
// entró antes del informe el 6 es Fabricación.
const REPORT_STEP = STEPS.findIndex((s) => s.key === "report");

/** A download link that stops offering a file once the plan has moved on.
 *
 *  Handing someone a link to a PDF describing a mesh they have since recropped
 *  is worse than offering nothing: the file opens, looks right, and is wrong. */
function OutputLink({
  href, stale, children, download,
}: { href: string; stale: boolean; children: React.ReactNode; download?: string }) {
  if (stale) {
    return (
      <div style={{ display: "flex", gap: 6, alignItems: "flex-start", fontSize: 12, color: "var(--warning)", lineHeight: 1.5 }}>
        <Icon name="STATUS_WARN" size={14} color="var(--warning)" />
        <span>El plan cambió desde que se generó este archivo. Vuelve a generarlo para descargar la versión actual.</span>
      </div>
    );
  }
  return (
    <a href={href} target="_blank" rel="noreferrer" download={download} style={{ fontSize: 12, textAlign: "center" }}>
      {children}
    </a>
  );
}

export function ReportPanel({ onFinish }: { onFinish: () => void }) {
  const { user } = useAuth();
  const planning = usePlanning();
  const {
    sessionId, patient, caseId, imagingStudyId, morphometry, treatment,
    captureViewport, markSaved, reportUrls,
  } = planning;
  const [includeShot, setIncludeShot] = useState(true);
  // Cuáles de las capturas guardadas entran, en el orden en que se marcan.
  const [captureIds, setCaptureIds] = useState<number[]>([]);
  const [surgeon, setSurgeon] = useState(user?.full_name ?? "");
  const [notes, setNotes] = useState("");
  const [report, setReport] = useState<ReportResult | null>(null);
  const [stl, setStl] = useState<ReportResult | null>(null);
  const [glb, setGlb] = useState<GlbExportResult | null>(null);
  const [seg, setSeg] = useState<DicomSegResult | null>(null);
  const [sr, setSr] = useState<ReportResult | null>(null);
  const [busy, setBusy] = useState<"pdf" | "stl" | "glb" | "seg" | "sr" | "save" | null>(null);
  const [error, setError] = useState<string | null>(null);
  // F1-220: lo que el equipo decidió y la estrategia marcada viven en el
  // servidor (se registran en Decisión y en Dispositivos); el resumen los pide
  // al abrir para no decir otra cosa que el PDF.
  const [devices, setDevices] = useState<DeviceClearResult | null>(null);
  const [team, setTeam] = useState<TeamDecision | null>(treatment?.team ?? null);
  useEffect(() => {
    if (!sessionId) return;
    let alive = true;
    api.placedDevices(sessionId).then((d) => { if (alive) setDevices(d); }).catch(() => {});
    api.getTeamDecision(sessionId).then((t) => { if (alive) setTeam(t); }).catch(() => {});
    return () => { alive = false; };
  }, [sessionId]);

  // What the outputs describe. A PDF is a snapshot of the mesh, the measurements
  // and the devices at the moment it was generated; editing any of them left a
  // download link pointing at a plan that no longer matched the screen.
  const planSignature = useMemo(() => JSON.stringify({
    mesh: planning.segmentation?.mesh_url ?? null,
    morpho: morphometry?.max_diameter_mm ?? null,
    neck: morphometry?.neck_mm ?? null,
    plan: treatment?.recommendation_key ?? null,
    devices: planning.deviceMeshes,
  }), [planning.segmentation?.mesh_url, morphometry, treatment, planning.deviceMeshes]);

  // Los documentos que volvieron con una sesión reanudada (F1-249). El backend
  // dice si se generaron con el plan que se guardó; si no, o si algo ha
  // cambiado desde que se reanudó (`dirty`), salen desfasados con
  // «Regenerar…». Antes se daban siempre por actuales, aunque el plan hubiera
  // cambiado después de generarlos.
  const restoredFrom = (current: boolean | undefined) => (current && !planning.dirty ? planSignature : "desfasado");
  const generatedFrom = useRef<Record<string, string>>({
    ...(reportUrls?.pdf_url ? { pdf: restoredFrom(reportUrls.pdf_current) } : {}),
    ...(reportUrls?.dicom_sr_url ? { sr: restoredFrom(reportUrls.sr_current) } : {}),
  });
  const pdfUrl = report?.pdf_url ?? reportUrls?.pdf_url ?? null;
  const srUrl = sr?.dicom_sr_url ?? reportUrls?.dicom_sr_url ?? null;
  const stale = (kind: "pdf" | "stl" | "glb" | "seg" | "sr") =>
    generatedFrom.current[kind] !== undefined && generatedFrom.current[kind] !== planSignature;

  const genPdf = async () => {
    if (!sessionId) return;
    setBusy("pdf");
    setError(null);
    try {
      // Capture the live 3D scene (data URL → base64 payload) when available.
      let shotB64: string | null = null;
      if (includeShot && captureViewport) {
        try {
          const dataUrl = await captureViewport();
          if (dataUrl && dataUrl.startsWith("data:image")) shotB64 = dataUrl.split(",")[1] ?? null;
        } catch { /* screenshot is best-effort */ }
      }
      setReport(
        await api.report({
          session_id: sessionId,
          patient_name: patient?.full_name ?? "",
          patient_dob: patient?.dob ?? "",
          patient_sex: patient?.sex ?? "",
          hospital_id: patient?.hospital_id ?? "",
          surgeon_name: surgeon,
          institution: patient?.institution ?? user?.institution ?? "",
          clinical_notes: notes,
          capture_ids: captureIds,
          include_3d_screenshot: !!shotB64,
          screenshot_png_b64: shotB64 ?? undefined,
        })
      );
      generatedFrom.current.pdf = planSignature;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error generando el informe");
    } finally {
      setBusy(null);
    }
  };

  const genStl = async () => {
    if (!sessionId) return;
    setBusy("stl");
    setError(null);
    try {
      setStl(await api.exportStl({ session_id: sessionId }));
      generatedFrom.current.stl = planSignature;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error exportando STL");
    } finally {
      setBusy(null);
    }
  };

  const genGlb = async () => {
    if (!sessionId) return;
    setBusy("glb");
    setError(null);
    try {
      setGlb(await api.exportGlb(sessionId));
      generatedFrom.current.glb = planSignature;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error exportando la escena");
    } finally {
      setBusy(null);
    }
  };

  const genSeg = async () => {
    if (!sessionId) return;
    setBusy("seg");
    setError(null);
    try {
      setSeg(await api.exportDicomSeg(sessionId));
      generatedFrom.current.seg = planSignature;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error generando el DICOM SEG");
    } finally {
      setBusy(null);
    }
  };

  const genSr = async () => {
    if (!sessionId) return;
    setBusy("sr");
    setError(null);
    try {
      setSr(await api.dicomSr({
        session_id: sessionId,
        patient_name: patient?.full_name ?? "",
        patient_dob: patient?.dob ?? "",
        patient_sex: patient?.sex ?? "",
        hospital_id: patient?.hospital_id ?? "",
        surgeon_name: surgeon,
        institution: patient?.institution ?? user?.institution ?? "",
      }));
      generatedFrom.current.sr = planSignature;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error generando el DICOM SR");
    } finally {
      setBusy(null);
    }
  };

  // Saving from the last step used to file the session under step 5 and drop the
  // case link, so a finished plan came back listed as «Dispositivos» and its
  // acquisition lost the case the gallery reads progress from. Same payload as
  // «Guardar progreso» in the topbar, at the step the user is actually on.
  const save = async () => {
    if (!sessionId) return;
    setBusy("save");
    setError(null);
    try {
      await api.saveSession({
        session_id: sessionId,
        label: patient ? `${patient.full_name} · Informe` : "Informe",
        patient_id: patient?.id ?? null,
        study_id: caseId,
        imaging_study_id: imagingStudyId,
        current_step: REPORT_STEP,
      });
      markSaved();
      onFinish();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error guardando la sesión");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="fade-rise">
      <PanelHead title="Informe y exportación" desc="Genera el informe del caso y exporta la malla o el informe estructurado." />

      <Card style={{ padding: "16px 18px" }}>
        <SectionLabel>Resumen del caso</SectionLabel>
        <Metric label="Paciente" value={patient?.full_name ?? "—"} />
        {morphometry && (
          <>
            <Metric label="Ø máximo" value={morphometry.max_diameter_mm.toFixed(1)} unit=" mm" />
            <Metric
              label="Riesgo (morfometría)"
              value=""
              badge={[morphometry.rupture_risk_label, riskVariant(morphometry.rupture_risk_label)]}
            />
            {/* Se leía como el riesgo de rotura del PHASES; es una etiqueta de
                forma. La misma distinción que hace el PDF (F1-234). */}
            <div style={{ fontSize: 11, color: "var(--muted-foreground)", padding: "4px 0 6px", lineHeight: 1.45 }}>
              Índice de forma (AR, BF, UI); no es el PHASES, que está en Morfometría
            </div>
          </>
        )}
        <Metric label="Abordaje" value={planning.trajSaved ? approachSummary(planning.trajSaved) : "—"} />
        <Metric label="Dispositivo elegido" value={strategySummary(devices)} />
        <Metric label="Decisión del equipo" value={teamSummary(team)} />
        {treatment && (
          <div style={{ padding: "9px 0" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <span style={{ fontSize: 13, color: "var(--muted-foreground)" }}>Recomendación</span>
              <Badge variant="subtle">Confianza {treatment.confidence.toLowerCase()}</Badge>
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 14, color: "var(--foreground)", fontWeight: 500, marginTop: 4 }}>
              {treatment.recommendation}
            </div>
          </div>
        )}
      </Card>

      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 16 }}>
        <Input label="Cirujano responsable" value={surgeon} onChange={(e) => setSurgeon(e.target.value)} placeholder="Dr. …" />
        <Input label="Notas clínicas" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Observaciones para el informe…" />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 16 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--foreground)", cursor: "pointer" }}>
          <input type="checkbox" checked={includeShot} onChange={(e) => setIncludeShot(e.target.checked)} />
          Incluir captura 3D de la escena en el PDF
        </label>
        {/* Y, aparte de esa foto del momento, las que el profesional fue
            guardando durante la planificación. */}
        <CapturePicker caseId={caseId} imagingStudyId={imagingStudyId}
          value={captureIds} onChange={setCaptureIds} />
        <Button leadingIcon={<Icon name="DOC" />} onClick={() => void genPdf()} disabled={busy !== null}>
          {busy === "pdf" ? "Generando…" : stale("pdf") ? "Regenerar informe PDF" : "Generar informe PDF"}
        </Button>
        {pdfUrl && (
          <OutputLink href={pdfUrl} stale={stale("pdf")}>
            Descargar PDF {report?.page_count ? `(${report.page_count} páginas)` : ""} →
          </OutputLink>
        )}
        <Button variant="outline" leadingIcon={<Icon name="SAVE" />} onClick={() => void genStl()} disabled={busy !== null}>
          {busy === "stl" ? "Exportando…" : stale("stl") ? "Volver a exportar STL" : "Exportar malla STL"}
        </Button>
        {stl?.stl_url && (
          <OutputLink href={stl.stl_url} stale={stale("stl")}>Descargar STL →</OutputLink>
        )}
        {/* El STL es para imprimir: una sola malla sin color. El GLB, para
            enseñar el caso: cada objeto por separado, con su color. */}
        <Button variant="outline" leadingIcon={<Icon name="SAVE" />} onClick={() => void genGlb()} disabled={busy !== null}>
          {busy === "glb" ? "Exportando…" : stale("glb") ? "Volver a exportar escena 3D" : "Exportar escena 3D (GLB)"}
        </Button>
        {glb?.glb_url && (
          <OutputLink href={glb.glb_url} stale={stale("glb")} download="prospective-escena.glb">
            Descargar escena ({glb.parts.join(", ")} · {Math.round(glb.size_kb)} KB) →
          </OutputLink>
        )}
        <Button variant="outline" leadingIcon={<Icon name="DATABASE" />} onClick={() => void genSr()} disabled={busy !== null}>
          {busy === "sr" ? "Generando…" : stale("sr") ? "Regenerar DICOM SR" : "Generar DICOM SR"}
        </Button>
        {srUrl && (
          <OutputLink href={srUrl} stale={stale("sr")}>
            Descargar informe estructurado DICOM (.dcm) →
          </OutputLink>
        )}
        {/* El SR lleva las medidas; el SEG, las regiones, para que el PACS o
            3D Slicer las pinten sobre la serie original. */}
        <Button variant="outline" leadingIcon={<Icon name="DATABASE" />} onClick={() => void genSeg()} disabled={busy !== null}>
          {busy === "seg" ? "Generando…" : stale("seg") ? "Regenerar DICOM SEG" : "Generar DICOM SEG (segmentación)"}
        </Button>
        {seg?.warnings.map((w) => (
          <div key={w} style={{ fontSize: 11.5, color: "var(--warning)", lineHeight: 1.5 }}>{w}</div>
        ))}
        {seg?.seg_url && (
          <OutputLink href={seg.seg_url} stale={stale("seg")} download="prospective-segmentacion.dcm">
            Descargar segmentación DICOM ({seg.segments.join(" + ")}) →
          </OutputLink>
        )}
        <Separator style={{ margin: "6px 0" }} />
        <Button variant="secondary" leadingIcon={<Icon name="SAVE" />} onClick={() => void save()} disabled={busy !== null}>
          {busy === "save" ? "Guardando…" : "Guardar sesión"}
        </Button>
      </div>

      <ErrorNote>{error}</ErrorNote>

      <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
        <PrintPrepPanel />
      </div>

      <div style={{ marginTop: 14, textAlign: "center", fontSize: 11, color: "var(--muted-foreground)" }}>
        La sesión se vincula al paciente y estudio en la base de datos.
      </div>
    </div>
  );
}
