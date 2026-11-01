/* Sesión de planificación — rail de flujo (7 pasos) · visor 3D + MPR · panel del paso. */

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { AttachCaseSheet } from "../components/AttachCaseSheet";
import type { AttachResult } from "../api/types";
import { api } from "../api/client";
import type { PatientSummary } from "../api/types";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { Icon } from "../components/Icon";
import { NEEDS_MORPHOMETRY, STEPS } from "../pipeline/steps";
import { QuirofanoBar } from "../components/stepper/QuirofanoBar";
import { SaveStatus } from "../components/stepper/SaveStatus";
import { BANDA_SUPERIOR, zonaLibre } from "../pipeline/zonaLibre";
import { StepDock } from "../components/stepper/StepDock";
import type { AlturaHoja } from "../components/BottomSheet";
import { HOJA_ASOMAR } from "../pipeline/zonaLibre";
import { useEstrecho } from "../components/patients/useEstrecho";
import { ToastStack, type ToastItem } from "../components/ToastStack";
import { Collapsible } from "../components/PanelHead";
import { UploadPanel } from "../components/upload/UploadPanel";
import { SegmentPanel } from "../components/segmentation/SegmentPanel";
import { DetectPanel } from "../components/planning/DetectPanel";
import { MorphometryPanel } from "../components/morphometry/MorphometryPanel";
import { PerforatorsPanel } from "../components/perforators/PerforatorsPanel";
import { CenterlinePanel } from "../components/vessels/CenterlinePanel";
import { TreatmentPanel } from "../components/planning/TreatmentPanel";
import { DevicesPanel } from "../components/planning/DevicesPanel";
import { ManufacturePanel } from "../components/planning/ManufacturePanel";
import { ReportPanel } from "../components/planning/ReportPanel";
import { AnnotationsPanel } from "../components/annotations/AnnotationsPanel";
import { annotationsSubtitle, useAnnotationsSync } from "../components/annotations/useAnnotationsSync";
import { ViewerWorkspace } from "../vtk/Viewer";
import { matchShortcut } from "../vtk/shortcuts";
import { RecordButton } from "../components/RecordButton";
import { ARCHIVAR_EN_CASO, sinCasoAviso } from "../lib/textos";
import { PREF_PANEL_COLLAPSED, RightPanelColumn, useUnfoldForNote } from "../components/RightPanelColumn";
import { useStoredFlag } from "../vtk/viewerPrefs";
import { useRegisterCommands } from "../lib/commands";
import { usePlanning } from "../store/planning";
import { useSessionLog } from "../pipeline/sessionLog";
import { SessionLog } from "../components/planning/SessionLog";
import { canAdvanceFromDetect } from "../components/planning/detectGate";


/** Atajos que se ejecutan en el visor (ViewerWorkspace escucha `viewer:shortcut`). */
const VIEWER_SHORTCUTS = new Set(["sync", "center-lesion", "hud-cycle", "center", "cine-toggle", "cine-faster", "cine-slower", "help",
  "anot-regla", "anot-angulo", "anot-region", "anot-marcador", "anot-borrar", "anot-deshacer-punto"]);

/** What each step needs before it can say anything true, or null when it's ready.
 *
 *  The rail used to unlock a step just because it had been visited, so a resumed
 *  session whose detection replay failed landed on «Informe» fully unlocked and
 *  produced a PDF with no measurements in it. Gating on the actual results also
 *  turns the disabled state into an instruction instead of a dead end. */
function missingFor(
  i: number,
  p: Pick<ReturnType<typeof usePlanning>, "series" | "segmentation" | "candidates" | "rejectedCandidates" | "morphometry">,
): string | null {
  switch (i) {
    case 0: return null;
    case 1: return p.series ? null : "Carga una serie DICOM primero";
    case 2: return p.segmentation ? null : "Segmenta el vaso primero";
    // Un descartado también se mide: con todo vetado el paso sigue abierto.
    case 3: return canAdvanceFromDetect(p.candidates, p.rejectedCandidates) ? null : "Detecta un candidato primero";
    default: return p.morphometry ? null : NEEDS_MORPHOMETRY;
  }
}

export function Workspace({
  patient,
  initialStep = 0,
  onBack,
  onOpenPatient,
  onFinish,
  aviso = null,
}: {
  patient: PatientSummary | null;
  initialStep?: number;
  onBack: () => void;
  /** Open this patient's sheet — their cases and archived studies. */
  onOpenPatient: () => void;
  onFinish: () => void;
  /** Aviso global de App, que en el pipeline se pinta como un toast más del apilado. */
  aviso?: { texto: string; retry?: () => void; onClose: () => void } | null;
}) {
  const planning = usePlanning();
  const {
    morphometry, sessionId, caseId, caseLabel, imagingStudyId,
    centerlineMesh, setPickMode, markSaved, captureCase,
    annotations, annotationsSync, setAnnotationsSync, annotationsLoadedRef, setAnnotationsLoaded, annotationsFlushRef,
    annotationsLoadState, noteFocusRequest, dirty, registerSaver,
  } = planning;
  // Las anotaciones se guardan solas en la sesión viva; «Guardar progreso»
  // espera a que termine el PUT pendiente para no archivar una lista vieja.
  const { flush: flushAnnotations } = useAnnotationsSync(
    sessionId, annotations, setAnnotationsSync, annotationsLoadedRef, setAnnotationsLoaded, annotationsLoadState,
  );
  useEffect(() => {
    annotationsFlushRef.current = flushAnnotations;
    return () => { annotationsFlushRef.current = null; };
  }, [flushAnnotations, annotationsFlushRef]);
  const [stepIdx, setStepIdx] = useState(initialStep);
  // P pliega el panel del paso a una tira y el visor gana su ancho; se
  // recuerda en este navegador, como el nivel del HUD.
  const [panelCollapsed, setPanelCollapsed] = useStoredFlag(PREF_PANEL_COLLAPSED);
  // Una nota de marcador pendiente despliega la columna (si no, su campo no
  // puede tener el foco y lo tecleado dispararía atajos).
  const columnCollapsed = useUnfoldForNote(panelCollapsed, setPanelCollapsed, noteFocusRequest);
  // A ≤ 1280 px el panel baja a una hoja inferior (asomar / media / completa).
  // Al entrar en modo estrecho arranca a media altura.
  const estrecho = useEstrecho();
  const [alturaHoja, setAlturaHoja] = useState<AlturaHoja>("media");
  const estrechoPrevio = useRef(estrecho);
  useEffect(() => {
    if (estrecho && !estrechoPrevio.current) setAlturaHoja("media");
    estrechoPrevio.current = estrecho;
  }, [estrecho]);
  // Una nota que espera el foco necesita el campo a la vista: la hoja asomada lo esconde.
  useEffect(() => {
    if (estrecho && noteFocusRequest !== null) setAlturaHoja((a) => (a === "asomar" ? "media" : a));
  }, [estrecho, noteFocusRequest]);
  // P (y el mando de la paleta): en ancho pliega el inspector; en estrecho
  // alterna la hoja entre «asomar» y «media» (el visor gana el alto, como en ancho el ancho).
  const alternarPanel = () => {
    if (estrecho) setAlturaHoja((a) => (a === "asomar" ? "media" : "asomar"));
    else setPanelCollapsed(!panelCollapsed);
  };
  const panelPlegado = estrecho ? alturaHoja === "asomar" : panelCollapsed;
  const [saving, setSaving] = useState<"idle" | "saving">("idle");
  // Hora del último guardado hecho en esta pantalla. El botón la enseña
  // mientras no haya cambios nuevos (`dirty`); no hay temporizador que la
  // borre: «Guardado ✓» desaparecía a los 1,8 s y no decía si lo de ahora
  // estaba guardado o no (F1-109).
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  // La captura vive aquí arriba, al lado de «Guardar progreso», porque es
  // donde uno busca «guardar algo de este caso» — y porque está en todos los
  // pasos, que era la pregunta: «¿en qué momento puedo hacer una captura?».
  const [shot, setShot] = useState<"idle" | "busy" | "ok" | "err">("idle");
  const [shotError, setShotError] = useState<string | null>(null);
  const tomarCaptura = async () => {
    if (!captureCase) return;
    setShot("busy");
    setShotError(null);
    try {
      const destino = await captureCase();
      setShot("ok");
      setTimeout(() => setShot((v) => (v === "ok" ? "idle" : v)), 2500);
      // Sin estudio archivado la imagen se descarga y NO queda en el caso: se
      // dice, igual que con la grabación, para que nadie crea que está guardada.
      if (destino === "downloaded") {
        setRecMessage({ tone: "info", text: sinCasoAviso("Captura descargada") });
      }
    } catch (e) {
      setShot("err");
      setShotError(e instanceof Error ? e.message : "No se pudo guardar la captura.");
      setTimeout(() => setShot((v) => (v === "err" ? "idle" : v)), 4000);
    }
  };
  // Cómo terminó la última grabación: guardada, solo descargada o fallida.
  const [recMessage, setRecMessage] = useState<{ tone: "ok" | "err" | "info"; text: string } | null>(null);
  // A failed save used to reset the button to "Guardar progreso" with no notice,
  // so the user believed their work was stored when it was not.
  const [saveError, setSaveError] = useState<string | null>(null);
  // «Adjuntar a un caso»: la sesión puede empezar sin paciente y ligarse después.
  const [attachOpen, setAttachOpen] = useState(false);
  const [attachNote, setAttachNote] = useState<string | null>(null);
  const onAttached = async (r: AttachResult) => {
    planning.setPatient(r.patient);
    planning.setCase(r.case_id, r.case_label);
    planning.setImagingStudyId(r.imaging_study_id);
    // Guardar ya, con los ids recién creados: el estado de React aún no los
    // tiene en este cierre, y sin guardar la galería no vería el progreso.
    if (sessionId) {
      try {
        await api.saveSession({
          session_id: sessionId, patient_id: r.patient.id, study_id: r.case_id,
          imaging_study_id: r.imaging_study_id, current_step: stepIdx,
          label: `${r.patient.full_name} · ${STEPS[stepIdx].label}`,
        });
        markSaved();
        setSavedAt(new Date());
      } catch { /* adjunto igualmente; «Guardar progreso» lo reintenta */ }
    }
    setAttachNote(`Adjunto a ${r.patient.full_name} · ${r.case_label}. El estudio está archivado`
      + (r.relinked_confirmations ? " y la confirmación de lesión pasó al caso." : "."));
    setTimeout(() => setAttachNote(null), 6000);
  };
  const step = STEPS[stepIdx].key;
  const registro = useSessionLog(STEPS[stepIdx].label, savedAt);

  const saveProgress = async (): Promise<boolean> => {
    if (!sessionId) return false;
    setSaving("saving");
    setSaveError(null);
    try {
      const annotationsOk = (await annotationsFlushRef.current?.()) ?? true;
      await api.saveSession({
        session_id: sessionId,
        patient_id: patient?.id ?? null,
        // Tie the session to the case and the imaging it analysed, so the
        // gallery can show real progress instead of "Sin procesar".
        study_id: caseId,
        imaging_study_id: imagingStudyId,
        current_step: stepIdx,
        label: patient ? `${patient.full_name} · ${STEPS[stepIdx].label}` : STEPS[stepIdx].label,
        // «Reanudar» da a la sesión un id nuevo y cada guardado añadía otra
        // fila casi igual a «Sesiones guardadas»: se guarda sobre la de origen.
        overwrite_origin: true,
      });
      // WHY: la instantánea se guarda igual (el resto del trabajo sí está),
      // pero sin las anotaciones en disco decir «guardado» y limpiar el aviso
      // de cambios sin guardar sería mentir.
      if (!annotationsOk) {
        setSaving("idle");
        setSaveError("Las anotaciones no se guardaron; vuelve a intentarlo");
        return false;
      }
      markSaved();
      setSavedAt(new Date());
      setSaving("idle");
      return true;
    } catch (e) {
      setSaving("idle");
      setSaveError(e instanceof Error ? e.message : "No se pudo guardar el progreso");
      return false;
    }
  };
  // El aviso de salida de App («Guardar y salir», F1-110) guarda con esta misma
  // función: se presta al store mientras la pantalla está montada. Por ref, para
  // registrar una sola vez y que siempre guarde con el estado del último render.
  const saveRef = useRef(saveProgress);
  saveRef.current = saveProgress;
  useEffect(() => {
    registerSaver(() => saveRef.current());
    return () => registerSaver(null);
  }, [registerSaver]);
  // Prioridad: guardando > cambios sin guardar > guardado > nada guardado aún.
  const saveState = saving === "saving" ? "saving"
    : dirty ? "dirty"
    : savedAt ? "saved"
    : "clean";

  const go = (i: number) => {
    // Cancel any active 3D/MPR pick mode so a tool armed on one step (e.g. the
    // crop-centre picker) doesn't linger — and its banner persist — on the next.
    setPickMode(null);
    setStepIdx(i);
  };
  const next = () => go(Math.min(stepIdx + 1, STEPS.length - 1));

  // Paleta ⌘K: los pasos y las acciones de la barra, con las mismas
  // condiciones de deshabilitado que sus botones.
  useRegisterCommands("workspace", [
    ...STEPS.map((s, i) => ({
      id: `paso-${i}`,
      group: "pasos" as const,
      label: `${i + 1} · ${s.label}`,
      disabled: i !== stepIdx && missingFor(i, planning) !== null,
      run: () => go(i),
    })),
    { id: "guardar", group: "acciones" as const, label: "Guardar progreso",
      disabled: !sessionId || saving === "saving", run: () => void saveProgress() },
    { id: "captura", group: "acciones" as const, label: "Captura",
      disabled: !captureCase || shot === "busy", run: () => void tomarCaptura() },
    { id: "plegar-panel", group: "acciones" as const,
      label: panelPlegado ? "Mostrar el panel del paso" : "Plegar el panel del paso",
      run: alternarPanel },
  ]);

  // Teclado: la tabla única de atajos (vtk/shortcuts) decide qué pide cada
  // tecla y no responde con el foco en un campo de texto. Aquí se atiende lo
  // del flujo: Escape cancela el modo de marcado activo (antes había que volver
  // al panel y pulsar el mismo botón otra vez, con el banner ocupando el visor)
  // y los dígitos saltan de paso. Lo del visor (S, C, espacio, +/−, «?») se le
  // reenvía por `viewer:shortcut`: el estado que tocan vive en el visor.
  // Alt+1…4 no se atienden aquí: los atiende el visor por su único camino
  // (presetForKey); hacerlo también aquí los dispararía dos veces. Las teclas de
  // corte las atiende la celda con el foco.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const id = matchShortcut(e, e.target);
      if (!id) return;
      if (id === "escape") {
        // Sin preventDefault. Escape también para el cine del visor: el
        // espacio lo arranca con el foco en cualquier sitio y Escape tiene que
        // pararlo igual. Con la hoja de atajos abierta no llega aquí: la hoja
        // se queda la tecla (fase de captura) y solo se cierra ella.
        setPickMode(null);
        window.dispatchEvent(new CustomEvent("viewer:shortcut", { detail: "escape" }));
        return;
      }
      if (id === "anot-borrar" || id === "anot-deshacer-punto") {
        // Supr y Retroceso valen en muchos sitios (la celda ya atiende Retroceso
        // en modo anotación y lo marca con preventDefault): sin preventDefault
        // aquí y sin repetir lo que ya se atendió.
        if (!e.defaultPrevented) window.dispatchEvent(new CustomEvent("viewer:shortcut", { detail: id }));
        return;
      }
      if (VIEWER_SHORTCUTS.has(id)) {
        // Que el espacio y +/− no desplacen ni amplíen la página.
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("viewer:shortcut", { detail: id }));
        return;
      }
      if (id === "panel-toggle") {
        e.preventDefault();
        alternarPanel();
        return;
      }
      if (id.startsWith("step-")) {
        const i = Number(id.slice(5)) - 1;
        if (i < STEPS.length && (i === stepIdx || !missingFor(i, planning))) { e.preventDefault(); go(i); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIdx, panelCollapsed, estrecho, planning.series, planning.segmentation, planning.candidates, planning.rejectedCandidates, planning.morphometry]);

  const panel = {
    upload: <UploadPanel onNext={next} />,
    segment: <SegmentPanel onNext={next} />,
    detect: <DetectPanel onNext={next} />,
    morpho: (
      // Morfometría queda siempre a la vista; las tres herramientas auxiliares
      // se pliegan y recuerdan su estado, para que la columna no pase de mil
      // píxeles de scroll con la línea central enterrada al fondo.
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <MorphometryPanel onNext={next} />
        <Collapsible title="Ramas cerca del cuello" subtitle="Orígenes visibles, con su calibre" storageKey="ws.morpho.perforators">
          <PerforatorsPanel />
        </Collapsible>
        <Collapsible
          title="Línea central del vaso"
          subtitle="Longitud, tortuosidad y calibre · base del stent guiado"
          storageKey="ws.morpho.centerline"
          badge={centerlineMesh ? <Badge variant="success">Extraída</Badge> : undefined}
        >
          <CenterlinePanel />
        </Collapsible>
      </div>
    ),
    treatment: <TreatmentPanel onNext={next} onChangeSite={() => go(STEPS.findIndex((st) => st.key === "morpho"))} />,
    devices: <DevicesPanel onNext={next} />,
    manufacture: <ManufacturePanel onNext={next} />,
    report: <ReportPanel onFinish={onFinish} />,
  }[step];

  const libre = zonaLibre({
    estrecho, plegado: columnCollapsed, ancho: step === "treatment" || step === "report", hoja: alturaHoja,
  });

  // Un solo apilado: aquí van los avisos del pipeline y el global de App.
  const avisos: ToastItem[] = [];
  if (aviso) {
    avisos.push({
      id: "app",
      tono: aviso.retry ? "error" : "info",
      role: aviso.retry ? "alert" : "status",
      onClose: aviso.onClose,
      texto: (
        <>
          {aviso.texto}
          {aviso.retry && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); aviso.retry?.(); }}
              style={{ marginLeft: 14, background: "transparent", color: "inherit", border: "1px solid currentColor", borderRadius: "var(--radius-sm)", padding: "3px 10px", font: "inherit", cursor: "pointer" }}
            >
              Reintentar
            </button>
          )}
        </>
      ),
    });
  }
  if (attachNote) avisos.push({ id: "adjunto", tono: "ok", role: "status", texto: attachNote, onClose: () => setAttachNote(null) });
  if (saveError) {
    avisos.push({ id: "guardado", tono: "error", role: "alert", onClose: () => setSaveError(null),
      texto: `No se pudo guardar el progreso: ${saveError}` });
  }
  // Por qué no se guardó la captura: un botón que vuelve solo a «Captura» a
  // los cuatro segundos deja creer que la imagen está guardada.
  if (shotError) {
    avisos.push({ id: "captura", tono: "error", role: "alert", onClose: () => setShotError(null),
      texto: `No se pudo guardar la captura: ${shotError}` });
  }
  // Cómo terminó la grabación: el vídeo se descarga siempre y esto dice si
  // además quedó en el caso. «info»: descargar sin caso es lo esperado.
  if (recMessage) {
    avisos.push({ id: "grabacion", tono: recMessage.tone === "err" ? "error" : recMessage.tone,
      role: recMessage.tone === "err" ? "alert" : "status", onClose: () => setRecMessage(null),
      texto: recMessage.text });
  }

  return (
    // `data-panel-collapsed`: el visor lo lee para su `estadoVisor` sin que
    // el estado del panel tenga que pasar por el store.
    <div data-panel-collapsed={columnCollapsed ? "true" : "false"}
         style={{ position: "relative", height: "100%", background: "var(--viewer-bg)", overflow: "hidden" }}>
      {/* Pastillas y avisos flotan sobre el lienzo; el visor deja libre su banda. */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 0, zIndex: 3 }}>
      <QuirofanoBar
        onBack={onBack}
        riskLabel={morphometry?.rupture_risk_label ?? null}
        crumbs={[
          { label: "Pacientes", onClick: onBack },
          // The patient and the case both lead back to the patient sheet, which
          // is where their cases and archived studies live. Before this the only
          // way out was the button on the right, which drops you in the full
          // list having forgotten which case you were planning.
          { label: patient ? patient.full_name : "Sesión", onClick: patient ? onOpenPatient : undefined },
          ...(caseLabel ? [{ label: caseLabel, onClick: patient ? onOpenPatient : undefined }] : []),
        ]}
        status={<SaveStatus state={saveState} savedAt={savedAt} />}
        actions={<>
        {/* Sin estudio archivado la captura se descarga en vez de guardarse en
            el caso, como la grabación; el tooltip lo dice antes de pulsar. */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => void tomarCaptura()}
          disabled={!captureCase || shot === "busy"}
          title={
            !captureCase
              ? "Abre un paso con el visor para capturar lo que se ve"
              : !imagingStudyId
                ? "Descarga una imagen de lo que se ve (sin estudio archivado no se puede guardar en el caso)"
                : "Guarda una imagen de lo que se ve ahora, adjunta al caso"
          }
          leadingIcon={<Icon name={shot === "ok" ? "STATUS_OK" : "CAMERA"} />}
        >
          {shot === "busy" ? "Capturando…"
            : shot === "ok" ? (imagingStudyId ? "Captura guardada ✓" : "Captura descargada ✓")
            : shot === "err" ? "No se guardó" : "Captura"}
        </Button>
        <RecordButton step={step} onMessage={setRecMessage} />
        {/* Sin estudio archivado: la sesión aún no es de nadie. Con el
            paciente ya fijado, «Adjuntar a un caso» sonaba a elegir paciente
            otra vez; lo que falta es el caso donde archivar (F1-107). */}
        {sessionId && !imagingStudyId && (
          <Button
            size="sm"
            onClick={() => setAttachOpen(true)}
            leadingIcon={<Icon name="SAVE" />}
            title={patient
              ? "Crea o elige un caso de este paciente y guarda en él el DICOM, las capturas y los vídeos"
              : "Liga esta sesión a un paciente y un caso y archiva su DICOM"}
          >
            {patient ? ARCHIVAR_EN_CASO : "Adjuntar a un caso"}
          </Button>
        )}
        <Button
          size="sm"
          onClick={() => void saveProgress()}
          disabled={!sessionId || saving === "saving"}
          title="Guarda el estudio, la malla, las medidas, la decisión, los dispositivos y las anotaciones de esta sesión"
          leadingIcon={<Icon name="SAVE" />}
        >
          Guardar progreso
        </Button>
        </>}
      />

      {sessionId && (
        <AttachCaseSheet open={attachOpen} onClose={() => setAttachOpen(false)}
                         sessionId={sessionId} onAttached={(r) => void onAttached(r)} />
      )}
      {/* Los avisos del pipeline (y el global de App) son un solo apilado de cristal. */}
      <ToastStack items={avisos} top={BANDA_SUPERIOR + 12} right={libre.right} />

      </div>

      {/* Dock de pasos — pastilla de cristal sobre el visor, abajo a la izquierda. */}
      <StepDock
        steps={STEPS}
        activeIndex={stepIdx}
        missingFor={(i) => missingFor(i, planning)}
        onGo={go}
        compacto={estrecho}
        abajo={estrecho ? (alturaHoja === "asomar" ? HOJA_ASOMAR + 12 : "calc(50% + 12px)") : 20}
      />

      {/* Visor: ocupa la zona libre (ni bajo el inspector ni bajo las pastillas). */}
      <div data-zona-libre
           style={{
             position: "absolute", display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0,
             // Ancho: el dock (76 px de alto a 20 del borde) tapa 96 px de la esquina.
             // Estrecho: el dock compacto (52 px) va 12 px sobre la zona libre, que acaba en la hoja.
             "--dock-holgura": estrecho ? "72px" : "96px",
             top: libre.top, right: libre.right, bottom: libre.bottom, left: libre.left,
             transition: "right var(--dur-2) var(--ease-out), bottom var(--dur-2) var(--ease-out)",
           } as CSSProperties}>
        <ViewerWorkspace step={step} />
      </div>

      {/* Panel del paso — 380 px; 520 en Decisión e Informe; plegable con P. */}
      <RightPanelColumn
          collapsed={columnCollapsed}
          onToggle={() => setPanelCollapsed(!columnCollapsed)}
          estrecho={estrecho}
          altura={alturaHoja}
          onAltura={setAlturaHoja}
          stepLabel={STEPS[stepIdx].label}
          stepIndex={stepIdx}
          stepKey={step}
          wide={step === "treatment" || step === "report"}
          badge={sessionId && annotations.length > 0 ? <Badge variant="subtle">{annotations.length}</Badge> : undefined}
        >
          {panel}
          {/* En todos los pasos con sesión: una medida se toma cuando hace falta,
              no en un paso concreto del flujo. */}
          {sessionId && (
            <div style={{ marginTop: 16 }}>
              <Collapsible
                title="Anotaciones"
                subtitle={annotationsSubtitle(annotationsLoadState, annotationsSync, annotations.length)}
                storageKey="ws.annotations"
                // Un marcador recién puesto espera su nota: el panel se abre
                // para que el campo exista y reciba el foco.
                forceOpen={noteFocusRequest !== null}
                badge={annotations.length > 0 ? <Badge variant="subtle">{annotations.length}</Badge> : undefined}
              >
                <AnnotationsPanel />
              </Collapsible>
              <Collapsible title="Registro" storageKey="ws.sessionlog">
                <SessionLog entries={registro} />
              </Collapsible>
            </div>
          )}
        </RightPanelColumn>
    </div>
  );
}
