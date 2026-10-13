/* Pacientes — contadores y tabla de pacientes por última actividad (GET
   /api/patients); crear, abrir la ficha, reanudar la última sesión y borrar. */

import { CaptureGallery } from "../components/CaptureGallery";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { FormEvent } from "react";
import { api, ApiError } from "../api/client";
import type { PatientSummary, PatientSessionInfo, StudyCard, StudySummary } from "../api/types";
import { Badge } from "../components/Badge";
import { MorphoRiskBadge } from "../components/morphometry/MorphoRiskBadge";
import { Button } from "../components/Button";
import { Icon } from "../components/Icon";
import { Input } from "../components/Input";
import { Select } from "../components/Select";
import { Sheet } from "../components/Sheet";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { DiscardChanges } from "../components/DiscardChanges";
import { AppShell } from "../components/shell/AppShell";
import { ErrorNote, Card, PanelHead } from "../components/PanelHead";
import { LoadState, loadErrorText } from "../components/LoadState";
import { useAuth } from "../store/auth";
import { CasePatientPicker, NuevoEstudioSheet } from "./NuevoCaso";
import { StudyGallery } from "./Studies";

import { STEP_LABELS, clampStep } from "../pipeline/steps";
import { desdeServidor, fecha, fechaHora } from "../lib/fecha";
import { ageFromDob } from "../components/patientAge";

const BLANK = {
  surname: "", given_name: "", hospital_id: "", sex: "F", dob: "",
  institution: "", ocupacion: "",
  antecedentes_patologicos: "", antecedentes_toxicologicos: "", antecedentes_quirurgicos: "",
  antecedentes_alergicos: "", antecedentes_farmacologicos: "", notes: "",
};

function PatientSheet({
  open,
  patientId,
  onClose,
  onSaved,
  onResume,
  onPlanCase,
  onOpenStudy,
  onOpenOrders,
}: {
  open: boolean;
  patientId: number | null;   // null → create, otherwise edit
  onClose: () => void;
  /** Con el paciente recién creado; sin él, al editar. */
  onSaved: (created?: PatientSummary) => void;
  onResume?: (sessionId: string) => void;
  /** Abre el registro de pedidos ya filtrado por este paciente. */
  onOpenOrders?: () => void;
  /** Enter the pipeline for this clinical case (patient + case already known). */
  onPlanCase?: (study: StudySummary) => void;
  /** Open one archived imaging study of the case. */
  onOpenStudy?: (img: StudyCard) => void;
}) {
  const editing = patientId !== null;
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // El detalle del 403 cuando el paciente es de otro profesional.
  const [denied, setDenied] = useState<string | null>(null);
  // Un fallo al leer la ficha (no un 403). Antes caía en el formulario en
  // blanco con «Guardar cambios», y guardarlo vaciaba al paciente.
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  // La lista de estudios recargada tras crear o borrar uno: si fallaba, la
  // lista se quedaba como estaba sin decir nada.
  const [studiesError, setStudiesError] = useState<string | null>(null);
  const [form, setForm] = useState({ ...BLANK });
  // Lo que había al abrir: «Cancelar», el ✕, Escape y el clic fuera tiraban lo
  // escrito sin preguntar (F1-60, F1-71). Contra esto se mide si hay cambios.
  const [initial, setInitial] = useState({ ...BLANK });
  const [askDiscard, setAskDiscard] = useState(false);
  const [sessions, setSessions] = useState<PatientSessionInfo[]>([]);
  const [studies, setStudies] = useState<StudySummary[]>([]);
  const [studyOpen, setStudyOpen] = useState(false);
  const [editStudy, setEditStudy] = useState<StudySummary | null>(null);
  const [delStudy, setDelStudy] = useState<StudySummary | null>(null);
  const [delBusy, setDelBusy] = useState(false);

  const reloadStudies = () => {
    if (patientId === null) return;
    setStudiesError(null);
    api.patientStudies(patientId)
      .then(setStudies)
      .catch((e) => setStudiesError(loadErrorText(e)));
  };

  // Load the full record + studies + past sessions when opening in edit mode.
  useEffect(() => {
    if (!open) return;
    setError(null);
    setDenied(null);
    setLoadError(null);
    setStudiesError(null);
    setAskDiscard(false);
    if (patientId === null) {
      setForm({ ...BLANK });
      setInitial({ ...BLANK });
      setSessions([]);
      setStudies([]);
      return;
    }
    setLoading(true);
    Promise.all([api.getPatient(patientId), api.patientSessions(patientId), api.patientStudies(patientId)])
      .then(([p, s, st]) => {
        const loaded = {
          surname: p.surname ?? "", given_name: p.given_name ?? "", hospital_id: p.hospital_id ?? "",
          sex: p.sex || "F", dob: p.dob ?? "", institution: p.institution ?? "", ocupacion: p.ocupacion ?? "",
          antecedentes_patologicos: p.antecedentes_patologicos ?? "",
          antecedentes_toxicologicos: p.antecedentes_toxicologicos ?? "",
          antecedentes_quirurgicos: p.antecedentes_quirurgicos ?? "",
          antecedentes_alergicos: p.antecedentes_alergicos ?? "",
          antecedentes_farmacologicos: p.antecedentes_farmacologicos ?? "",
          notes: p.notes ?? "",
        };
        setForm(loaded);
        setInitial(loaded);
        setSessions(s);
        setStudies(st);
      })
      .catch((e) => {
        // Un 403 caía en el formulario vacío: un Médico que abría
        // ?paciente=<id ajeno> veía los campos en blanco con «Guardar cambios»,
        // «Nuevo estudio» y «Pedidos» sobre un paciente que no es suyo. Ahora
        // la ficha solo muestra el motivo que da el servidor.
        if (e instanceof ApiError && e.status === 403) setDenied(e.message);
        else setLoadError(loadErrorText(e));
      })
      .finally(() => setLoading(false));
  }, [open, patientId, attempt]);

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  // Solo cuenta lo que se ve como formulario: con el 403 o el fallo de carga
  // no hay nada escrito que perder.
  const dirty = !loading && !denied && !loadError
    && (Object.keys(form) as (keyof typeof form)[]).some((k) => form[k] !== initial[k]);
  const requestClose = () => (dirty ? setAskDiscard(true) : onClose());

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (editing) { await api.updatePatient(patientId!, form); onSaved(); }
      else onSaved(await api.createPatient(form));
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar el paciente");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
    <Sheet open={open} onClose={requestClose} title={editing ? "Editar paciente" : "Nuevo paciente"} width={480}>
      {loading ? (
        <LoadState state="cargando" />
      ) : denied ? (
        // El 403 no se reintenta: el paciente es de otro profesional.
        <div role="alert">
          <ErrorNote>{denied}</ErrorNote>
        </div>
      ) : loadError ? (
        <LoadState state="error" mensaje={loadError} onRetry={() => setAttempt((n) => n + 1)} />
      ) : (
        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Input label="Apellidos" placeholder="Restrepo" value={form.surname} onChange={set("surname")} required />
            <Input label="Nombre" placeholder="María" value={form.given_name} onChange={set("given_name")} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Input label="N.º historia clínica" placeholder="HC-00000" value={form.hospital_id} onChange={set("hospital_id")} />
            <Select label="Sexo" options={["F", "M", "O"]} value={form.sex} onChange={set("sex")} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Input label="Fecha de nacimiento" type="date" value={form.dob} onChange={set("dob")} />
            <Input label="Institución" placeholder="Hospital…" value={form.institution} onChange={set("institution")} />
          </div>
          <Input label="Ocupación" placeholder="—" value={form.ocupacion} onChange={set("ocupacion")} />
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--muted-foreground)", marginTop: 6 }}>
            Antecedentes
          </div>
          <Input label="Patológicos" placeholder="HTA, tabaquismo…" value={form.antecedentes_patologicos} onChange={set("antecedentes_patologicos")} />
          <Input label="Toxicológicos" placeholder="Tabaco, alcohol…" value={form.antecedentes_toxicologicos} onChange={set("antecedentes_toxicologicos")} />
          <Input label="Quirúrgicos" placeholder="—" value={form.antecedentes_quirurgicos} onChange={set("antecedentes_quirurgicos")} />
          <Input label="Alérgicos" placeholder="—" value={form.antecedentes_alergicos} onChange={set("antecedentes_alergicos")} />
          <Input label="Farmacológicos" placeholder="—" value={form.antecedentes_farmacologicos} onChange={set("antecedentes_farmacologicos")} />
          <Input label="Notas" placeholder="Notas clínicas libres…" value={form.notes} onChange={set("notes")} />

          {editing && (
            <div style={{ marginTop: 4 }}>
              <div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--muted-foreground)", flex: 1 }}>
                  Casos ({studies.length})
                </div>
                {onOpenOrders && (
                  <button
                    type="button"
                    title="Pedidos de clips de este paciente"
                    onClick={onOpenOrders}
                    style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "transparent", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: "4px 10px", fontSize: 12, fontWeight: 600, color: "var(--brand-deep)", cursor: "pointer", marginRight: 6 }}
                  >
                    <Icon name="SETTINGS" size={12} /> Pedidos
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => { setEditStudy(null); setStudyOpen(true); }}
                  style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "transparent", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: "4px 10px", fontSize: 12, fontWeight: 600, color: "var(--brand-deep)", cursor: "pointer" }}
                >
                  <Icon name="STEP_PLAN" size={12} /> Nuevo caso
                </button>
              </div>
              {studiesError && (
                <LoadState state="error" mensaje={studiesError} onRetry={reloadStudies} />
              )}
              {!studiesError && studies.length === 0 && (
                <div style={{ fontSize: 12, color: "var(--muted-foreground)", marginBottom: 4 }}>
                  Sin casos. Crea uno con «Nuevo caso» para archivar el DICOM y las capturas de este paciente.
                </div>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {studies.map((st) => {
                  const mods = [st.mod_tac && "TAC", st.mod_angio && "Angio", st.mod_rm && "RM", st.mod_pangio && "Pangio"].filter(Boolean).join(" · ");
                  return (
                    <Card key={st.id} style={{ padding: "10px 12px" }}>
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--foreground)", flex: 1 }}>{st.dx_principal || "Estudio"}</div>
                        <span style={{ display: "inline-flex", gap: 4, flexShrink: 0 }}>
                          <button
                            type="button" title="Editar caso"
                            onClick={() => { setEditStudy(st); setStudyOpen(true); }}
                            style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 26, height: 26, borderRadius: "var(--radius-md)", border: "1px solid var(--border)", background: "var(--card)", cursor: "pointer" }}
                          >
                            <Icon name="EDIT" size={13} color="var(--muted-foreground)" />
                          </button>
                          <button
                            type="button" title="Eliminar caso"
                            onClick={() => setDelStudy(st)}
                            style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 26, height: 26, borderRadius: "var(--radius-md)", border: "1px solid var(--border)", background: "var(--card)", cursor: "pointer" }}
                          >
                            <span style={{ fontSize: 13, color: "var(--destructive)", lineHeight: 1 }}>✕</span>
                          </button>
                        </span>
                      </div>
                      <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 4, lineHeight: 1.6 }}>
                        {st.acquired_at && <>Fecha: {st.acquired_at}<br /></>}
                        {st.tipo_aneurisma && <>Tipo: {st.tipo_aneurisma} · </>}
                        {st.region_anatomica && <>{st.region_anatomica} </>}
                        {st.lateralidad && <>({st.lateralidad}) </>}
                        {st.tratamiento_propuesto && <><br />Tratamiento: {st.tratamiento_propuesto}</>}
                        {mods && <><br />Imágenes: {mods}</>}
                        {st.angiographer && <> · Angiógrafo: {st.angiographer}</>}
                      </div>

                      {/* Imaging studies of this case: a case can hold several
                          acquisitions (CT + angiography + follow-up). */}
                      <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--border)" }}>
                        <StudyGallery
                          caseId={st.id}
                          compact
                          emptyHint="Sin imágenes archivadas todavía."
                          onOpen={(img) => { onClose(); onOpenStudy?.(img); }}
                          onResume={(img) => {
                            if (!img.resumable_session_id) return;
                            onClose();
                            onResume?.(img.resumable_session_id);
                          }}
                        />
                        <div style={{ marginTop: 10 }}>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => { onClose(); onPlanCase?.(st); }}
                            leadingIcon={<Icon name="STEP_PLAN" size={13} />}
                          >
                            Planificar este caso
                          </Button>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}

          {editing && (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--muted-foreground)", marginBottom: 8 }}>
                Sesiones guardadas ({sessions.length})
              </div>
              {sessions.length === 0 ? (
                <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
                  Aún no hay sesiones guardadas para este paciente.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {sessions.map((s) => (
                    <Card key={s.session_id} style={{ padding: "10px 12px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--foreground)", flex: 1 }}>
                          {s.label || `Sesión ${fecha(s.updated_at)}`}
                        </span>
                        {/* F1-68: «Alto» a secas se leía como riesgo de rotura. */}
                        {s.rupture_risk_label && <MorphoRiskBadge label={s.rupture_risk_label} />}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 4, fontFamily: "var(--font-mono)" }}>
                        {fechaHora(s.updated_at)} · Paso: {STEP_LABELS[s.current_step] ?? s.current_step}
                        {s.max_diameter_mm != null && ` · Ø ${s.max_diameter_mm.toFixed(1)} mm`}
                      </div>
                      {onResume && (
                        <div style={{ marginTop: 8 }}>
                          <Button
                            type="button" variant="outline" size="sm"
                            onClick={() => onResume(s.session_id)}
                            leadingIcon={<Icon name="STEP_PLAN" size={13} />}
                          >
                            Reanudar en «{STEP_LABELS[s.current_step] ?? s.current_step}»
                          </Button>
                        </div>
                      )}
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Las capturas del visor, que el profesional guarda con un botón.
              Cuelgan del estudio de imagen; aquí se ven todas las del paciente
              porque es donde se viene a buscarlas: «la foto que hice del
              cuello», sin acordarse de en qué adquisición fue. */}
          {editing && patientId != null && (
            <CaptureGallery patientId={patientId} />
          )}

          <ErrorNote>{error}</ErrorNote>
          <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
            <Button type="submit" style={{ flex: 1 }} disabled={busy || !form.surname}>
              {busy ? "Guardando…" : editing ? "Guardar cambios" : "Crear paciente"}
            </Button>
            <Button type="button" variant="outline" onClick={requestClose}>Cancelar</Button>
          </div>
        </form>
      )}
    </Sheet>
    <DiscardChanges
      open={askDiscard}
      onKeep={() => setAskDiscard(false)}
      onDiscard={() => { setAskDiscard(false); onClose(); }}
    />
    <NuevoEstudioSheet
      open={studyOpen}
      patientId={patientId}
      patientName={form.surname || form.given_name ? `${form.surname}${form.surname && form.given_name ? ", " : ""}${form.given_name}` : undefined}
      study={editStudy}
      onClose={() => { setStudyOpen(false); setEditStudy(null); }}
      onCreated={reloadStudies}
    />
    <ConfirmDialog
      open={!!delStudy}
      title="Eliminar caso"
      destructive
      busy={delBusy}
      confirmLabel={delBusy ? "Eliminando…" : "Eliminar"}
      onCancel={() => setDelStudy(null)}
      onConfirm={async () => {
        if (patientId === null || !delStudy) return;
        setDelBusy(true);
        try { await api.deleteStudy(patientId, delStudy.id); setDelStudy(null); reloadStudies(); }
        catch (e) { setError(e instanceof Error ? e.message : "Error al eliminar el caso"); setDelStudy(null); }
        finally { setDelBusy(false); }
      }}
    >
      ¿Seguro que quieres eliminar el caso <b style={{ color: "var(--foreground)" }}>{delStudy?.dx_principal || "Estudio"}</b>?
      {(delStudy?.session_count ?? 0) > 0 && <> Sus {delStudy?.session_count} sesión(es) de planificación se conservarán pero quedarán desvinculadas.</>} Esta acción no se puede deshacer.
    </ConfirmDialog>
    </>
  );
}

function DeleteConfirm({
  patient,
  onCancel,
  onConfirm,
}: {
  patient: PatientSummary;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const [busy, setBusy] = useState(false);
  // F1-58: el diálogo no decía cuánto se borraba. Los casos vienen en la fila;
  // las sesiones se piden al abrirlo. Si la cuenta falla, se dice sin número.
  const [nSessions, setNSessions] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    api.patientSessions(patient.id)
      .then((s) => { if (alive) setNSessions(s.length); })
      .catch(() => { /* sin cifra: el texto general sigue siendo verdad */ });
    return () => { alive = false; };
  }, [patient.id]);
  const casos = `${patient.study_count} ${patient.study_count === 1 ? "caso" : "casos"}`;
  const sesiones = nSessions === null
    ? "sus sesiones de planificación"
    : `${nSessions} ${nSessions === 1 ? "sesión" : "sesiones"} de planificación`;
  return (
    <ConfirmDialog
      open
      title="Eliminar paciente"
      destructive
      busy={busy}
      confirmLabel={busy ? "Eliminando…" : "Eliminar"}
      onCancel={onCancel}
      onConfirm={async () => { setBusy(true); await onConfirm(); }}
    >
      ¿Seguro que quieres eliminar a <b style={{ color: "var(--foreground)" }}>{patient.full_name}</b>? Se
      borrarán también sus {casos} y {sesiones}. Esta acción no se puede deshacer.
    </ConfirmDialog>
  );
}

/** «Ningún paciente», «1 paciente», «7 pacientes»: decía «1 registros» (F2-19). */
function recuentoPacientes(n: number): string {
  if (n === 0) return "Ningún paciente";
  return n === 1 ? "1 paciente" : `${n} pacientes`;
}

/** Última actividad: la última sesión guardada o, si no hay, el alta. Quien
 *  vuelve cada día espera arriba al paciente con el que trabajó por última
 *  vez, no al último dado de alta (F2-19). */
function ultimaActividad(p: PatientSummary): number {
  const alta = desdeServidor(p.created_at).getTime();
  const sesion = p.last_session_at ? desdeServidor(p.last_session_at).getTime() : NaN;
  return Math.max(Number.isNaN(alta) ? 0 : alta, Number.isNaN(sesion) ? 0 : sesion);
}

/** «Segmentación · 11/10/26, 0:05»: dónde quedó y cuándo, en hora local. */
function ultimaSesion(p: PatientSummary): string {
  if (!p.last_session_at || p.last_session_step === null) return "—";
  return `${STEP_LABELS[clampStep(p.last_session_step)]} · ${fechaHora(p.last_session_at)}`;
}

/** El aviso tras crear: el siguiente paso, para no tener que buscarlo (F2-22). */
type Aviso =
  | { tipo: "paciente"; paciente: PatientSummary }
  | { tipo: "caso"; paciente: PatientSummary; caso: StudySummary };

const COLUMNAS = ["Paciente", "HC", "Edad", "Institución", "Último caso", "Última sesión", "Acciones"];
const celda: React.CSSProperties = { padding: "12px 16px" };

export function Patients({
  onResume,
  onPlanCase,
  onOpenStudy,
  onOpenOrders,
  onStartWithoutPatient,
}: {
  onResume: (sessionId: string, patient: PatientSummary) => void;
  /** Enter the pipeline for a clinical case (patient + case known upfront). */
  onPlanCase: (study: StudySummary, patient: PatientSummary) => void;
  /** Open an archived imaging study straight from the patient sheet. */
  onOpenStudy: (img: StudyCard) => void;
  /** Abre el registro de pedidos filtrado por un paciente. */
  onOpenOrders?: (p: PatientSummary) => void;
  /** Al pipeline sin paciente ni caso; se adjuntan después. */
  onStartWithoutPatient?: () => void;
}) {
  const [patients, setPatients] = useState<PatientSummary[]>([]);
  const [loading, setLoading] = useState(true);
  // El fallo de la acción (borrar) va aparte del de la carga: este último
  // sustituye a la lista, y con él no hay contadores ni «Ningún paciente».
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sheetPatientId, setSheetPatientId] = useState<number | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [caseSheet, setCaseSheet] = useState(false);
  const [casePatient, setCasePatient] = useState<PatientSummary | null>(null);
  const [toDelete, setToDelete] = useState<PatientSummary | null>(null);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [q, setQ] = useState("");
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const load = () => {
    setLoading(true);
    setLoadError(null);
    api
      .listPatients()
      .then(setPatients)
      // F1-2, F1-29: con el servidor caído la lista quedaba vacía y decía
      // «0 registros» y «No hay pacientes registrados»; quien lo veía creía
      // haber perdido a sus pacientes.
      .catch((e) => setLoadError(loadErrorText(e)))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  // ?paciente=<id> opens that patient's sheet on arrival, so the breadcrumb in
  // the workspace can lead back to the case instead of just the list.
  const [params, setParams] = useSearchParams();
  useEffect(() => {
    const id = Number(params.get("paciente"));
    if (!Number.isFinite(id) || id <= 0) return;
    setSheetPatientId(id);
    setSheetOpen(true);
    setParams({}, { replace: true });
  }, [params, setParams]);

  const openCreate = () => { setSheetPatientId(null); setSheetOpen(true); };
  // Fusión nº 8: «Editar» era la única puerta a la ficha y se anunciaba como
  // una edición; ahora la abren el clic en la fila y «Abrir ficha».
  const openSheet = (id: number) => { setSheetPatientId(id); setSheetOpen(true); };

  const confirmDelete = async () => {
    if (!toDelete) return;
    try {
      await api.deletePatient(toDelete.id);
      setToDelete(null);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al eliminar el paciente");
      setToDelete(null);
    }
  };

  const rows = useMemo(() => {
    const t = q.toLowerCase();
    return patients
      .filter((p) => p.full_name.toLowerCase().includes(t) || p.hospital_id.toLowerCase().includes(t))
      .sort((a, b) => ultimaActividad(b) - ultimaActividad(a));
  }, [patients, q]);

  const totalStudies = patients.reduce((acc, p) => acc + p.study_count, 0);
  const tiles: { k: string; v: string; s?: string; icon: React.ComponentProps<typeof Icon>["name"] }[] = [
    // F1-252: un Médico no ve la base entera, sino los suyos y los que le han
    // compartido (F2-75); «en la base de datos» le hacía creer que estaba vacía.
    { k: "Pacientes", v: String(patients.length), s: isAdmin ? "en la base de datos" : "tuyos o compartidos contigo", icon: "PATIENTS" },
    { k: "Casos", v: String(totalStudies), icon: "FOLDER" },
    { k: "Con caso", v: String(patients.filter((p) => p.study_count > 0).length), icon: "STATUS_OK" },
    { k: "Sin caso", v: String(patients.filter((p) => p.study_count === 0).length), icon: "WAIT" },
  ];

  const iconBtn: React.CSSProperties = {
    display: "inline-flex", alignItems: "center", justifyContent: "center", width: 30, height: 30,
    borderRadius: "var(--radius-md)", border: "1px solid var(--border)", background: "var(--card)", cursor: "pointer",
  };

  return (
    <AppShell
      crumbs={[{ label: "Pacientes" }]}
      // F2-20, F2-21: «Usuarios», «Cuentas pendientes» y «Estudios» están en la
      // barra lateral; aquí quedan solo las acciones clínicas.
      actions={
        <span style={{ display: "inline-flex", gap: 8 }}>
          {onStartWithoutPatient && (
            <Button variant="outline" size="sm" leadingIcon={<Icon name="STEP_SEGMENT" />} onClick={onStartWithoutPatient}
                    title="Sube un DICOM y planifica ya. Si no lo adjuntas después a un paciente y un caso, se borra al caducar la sesión.">
              Empezar sin paciente
            </Button>
          )}
          <Button variant="outline" size="sm" leadingIcon={<Icon name="PLUS" />} onClick={openCreate}>
            Nuevo paciente
          </Button>
          <Button size="sm" leadingIcon={<Icon name="PLUS" />} onClick={() => setCaseSheet(true)}>
            Nuevo caso
          </Button>
        </span>
      }
    >

      <div style={{ flex: 1, overflowY: "auto", padding: "28px 32px 48px" }}>
        <div style={{ maxWidth: 1120, margin: "0 auto" }} className="fade-rise">
          <PanelHead
            title="Pacientes"
            desc={loading ? "Cargando…" : loadError ? "No se pudo cargar la lista" : recuentoPacientes(patients.length)}
          />

          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
            {tiles.map((t) => (
              <Card key={t.k} style={{ padding: "16px 18px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "var(--tracking-label)", textTransform: "uppercase", color: "var(--muted-foreground)" }}>{t.k}</div>
                  <span style={{ width: 30, height: 30, borderRadius: "var(--radius-md)", background: "var(--brand-subtle)", color: "var(--brand-subtle-foreground)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Icon name={t.icon} size={15} />
                  </span>
                </div>
                <div style={{ fontSize: 28, fontWeight: 800, color: "var(--foreground)", marginTop: 6, fontFamily: "var(--font-mono)" }}>
                  {loading || loadError ? "—" : t.v}
                </div>
                {t.s && <div style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 2 }}>{t.s}</div>}
              </Card>
            ))}
          </div>

          {aviso && (
            // F2-22 y spec §5: quien acaba de crear un paciente o un caso espera
            // seguir con él; antes volvía a la lista y había que buscarlo.
            <div role="status" style={{
              display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", marginBottom: 16,
              background: "var(--brand-subtle)", color: "var(--brand-subtle-foreground)",
              border: "1px solid var(--border)", borderRadius: "var(--radius-md)", fontSize: 13,
            }}>
              <span style={{ flex: 1 }}>
                {aviso.tipo === "paciente"
                  ? `Paciente creado: ${aviso.paciente.full_name}.`
                  : `Caso creado para ${aviso.paciente.full_name}: ${aviso.caso.dx_principal || `Caso ${aviso.caso.id}`}.`}
              </span>
              {aviso.tipo === "paciente" ? (
                <Button size="sm" leadingIcon={<Icon name="PLUS" />}
                        onClick={() => { setCasePatient(aviso.paciente); setAviso(null); }}>
                  {`Crear un caso para ${aviso.paciente.full_name}`}
                </Button>
              ) : (
                <Button size="sm" leadingIcon={<Icon name="STEP_PLAN" />}
                        onClick={() => { setAviso(null); onPlanCase(aviso.caso, aviso.paciente); }}>
                  Planificar este caso
                </Button>
              )}
              <button type="button" aria-label="Cerrar aviso" title="Cerrar aviso" style={{ ...iconBtn, background: "transparent", border: "none" }}
                      onClick={() => setAviso(null)}>
                <Icon name="CLOSE" size={14} />
              </button>
            </div>
          )}

          <ErrorNote>{error}</ErrorNote>

          <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-sm)", overflow: "hidden" }}>
            {/* F2-18: la búsqueda estaba en la barra superior, lejos de la tabla que filtra. */}
            <div style={{ display: "flex", alignItems: "center", padding: "10px 12px", borderBottom: "1px solid var(--border)" }}>
              <div style={{ width: 280 }}>
                <Input icon={<Icon name="SEARCH" />} placeholder="Buscar paciente o HC…" aria-label="Buscar paciente o HC"
                       value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr>
                  {COLUMNAS.map((h, i) => (
                    <th
                      key={h}
                      style={{ textAlign: i === COLUMNAS.length - 1 ? "right" : "left", padding: "11px 16px", background: "var(--muted)", color: "var(--muted-foreground)", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "var(--tracking-label)", borderBottom: "1px solid var(--border)" }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(loadError || (loading && patients.length === 0) || (!loading && rows.length === 0)) && (
                  <tr>
                    <td colSpan={COLUMNAS.length}>
                      <LoadState
                        state={loadError ? "error" : loading ? "cargando" : "vacio"}
                        // F1-253: para un Médico la lista vacía no significa que no
                        // haya pacientes en el sistema, sino que no tiene ninguno suyo
                        // ni compartido con él.
                        mensaje={loadError ?? (patients.length === 0
                          ? (isAdmin
                            ? "No hay pacientes registrados. Crea el primero para comenzar."
                            : "Solo ves tus pacientes y los que te han compartido. Crea el primero para comenzar.")
                          : "Ningún paciente coincide con la búsqueda.")}
                        onRetry={load}
                      />
                    </td>
                  </tr>
                )}
                {!loadError && rows.map((p, i) => (
                  <tr
                    key={p.id}
                    // F1-56: la fila abre la ficha también con el teclado.
                    tabIndex={0}
                    onClick={() => openSheet(p.id)}
                    onKeyDown={(e) => {
                      if (e.target !== e.currentTarget || (e.key !== "Enter" && e.key !== " ")) return;
                      e.preventDefault();
                      openSheet(p.id);
                    }}
                    style={{ cursor: "pointer", borderBottom: i < rows.length - 1 ? "1px solid var(--border)" : "none" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "var(--accent)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    <td style={{ ...celda, fontWeight: 600, color: "var(--foreground)" }}>
                      <span data-nombre>{p.full_name}</span>
                      {p.is_shared_with_me && (
                        <span style={{ marginLeft: 8 }}><Badge variant="brand">Compartido</Badge></span>
                      )}
                      {p.shared_with_count > 0 && (
                        <span style={{ marginLeft: 8 }}><Badge variant="muted">{`Compartido con ${p.shared_with_count}`}</Badge></span>
                      )}
                    </td>
                    <td style={{ ...celda, fontFamily: "var(--font-mono)", color: "var(--muted-foreground)" }}>{p.hospital_id || "—"}</td>
                    {/* F2-24: la edad, que el especialista usa para el riesgo de rotura. */}
                    <td style={{ ...celda, fontFamily: "var(--font-mono)", color: "var(--muted-foreground)" }}>{ageFromDob(p.dob) || "—"}</td>
                    <td style={{ ...celda, color: "var(--foreground)" }}>{p.institution || "—"}</td>
                    <td style={{ ...celda, color: "var(--foreground)", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                        title={p.last_case_label || undefined}>
                      {p.last_case_label || "—"}
                    </td>
                    <td style={{ ...celda, color: "var(--muted-foreground)", whiteSpace: "nowrap" }}>{ultimaSesion(p)}</td>
                    <td style={{ padding: "8px 16px", textAlign: "right", whiteSpace: "nowrap" }}>
                      <span style={{ display: "inline-flex", gap: 6 }}>
                        {p.last_session_id && (
                          // F2-24: reanudar en un clic, sin abrir la ficha.
                          <Button size="sm" leadingIcon={<Icon name="RESUME" />}
                                  onClick={(e) => { e.stopPropagation(); onResume(p.last_session_id!, p); }}>
                            Reanudar
                          </Button>
                        )}
                        <Button size="sm" variant="outline" leadingIcon={<Icon name="OPEN" />}
                                onClick={(e) => { e.stopPropagation(); openSheet(p.id); }}>
                          Abrir ficha
                        </Button>
                        <button
                          type="button"
                          title="Eliminar"
                          aria-label={`Eliminar a ${p.full_name}`}
                          style={iconBtn}
                          onClick={(e) => { e.stopPropagation(); setToDelete(p); }}
                          onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--destructive)"; e.currentTarget.style.background = "var(--destructive-bg)"; }}
                          onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.background = "var(--card)"; }}
                        >
                          <span style={{ fontSize: 14, color: "var(--destructive)", lineHeight: 1 }}>✕</span>
                        </button>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <PatientSheet
        open={sheetOpen}
        patientId={sheetPatientId}
        onClose={() => setSheetOpen(false)}
        onSaved={(creado) => {
          load();
          // Spec §5: «Nuevo paciente» termina ofreciendo el caso de ese paciente.
          if (creado) setAviso({ tipo: "paciente", paciente: creado });
        }}
        onResume={(sid) => {
          const p = patients.find((x) => x.id === sheetPatientId);
          if (p) { setSheetOpen(false); onResume(sid, p); }
        }}
        onPlanCase={(st) => {
          const p = patients.find((x) => x.id === sheetPatientId);
          if (p) onPlanCase(st, p);
        }}
        onOpenOrders={onOpenOrders && (() => {
          const p = patients.find((x) => x.id === sheetPatientId);
          if (p) { setSheetOpen(false); onOpenOrders(p); }
        })}
        onOpenStudy={onOpenStudy}
      />
      {/* Nuevo caso = elegir paciente existente → formulario del caso para ese paciente. */}
      <CasePatientPicker
        open={caseSheet}
        patients={patients}
        onClose={() => setCaseSheet(false)}
        onPick={(p) => { setCaseSheet(false); setCasePatient(p); }}
        onCreatePatient={() => { setCaseSheet(false); openCreate(); }}
      />
      <NuevoEstudioSheet
        open={!!casePatient}
        patientId={casePatient?.id ?? null}
        patientName={casePatient?.full_name}
        onClose={() => setCasePatient(null)}
        onCreated={(caso) => {
          const p = casePatient;
          setCasePatient(null);
          load();
          // F2-22: tras crear el caso volvía a la lista sin ofrecer planificarlo.
          if (caso && p) setAviso({ tipo: "caso", paciente: p, caso });
        }}
      />
      {toDelete && <DeleteConfirm patient={toDelete} onCancel={() => setToDelete(null)} onConfirm={confirmDelete} />}
    </AppShell>
  );
}
