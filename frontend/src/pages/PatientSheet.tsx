/* La ficha del paciente — se abre desde «Abrir ficha», el clic en la fila de
   «Pacientes» y ?paciente=<id>.

   De arriba abajo: las acciones con las que se viene a la ficha (planificar,
   subir el DICOM, pedidos), los datos del paciente con su «Guardar cambios»
   pegado al pie del bloque, y después lo que cuelga de él con sus propios
   botones: casos, con quién está compartido, sesiones guardadas y capturas.
   Al final, eliminar al paciente, solo para quien lo creó o un administrador.
   Antes vivía dentro de pages/Patients.tsx (F2, Tarea 11). */

import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { api, ApiError } from "../api/client";
import type { PatientSessionInfo, PatientShareOut, PatientSummary, StudyCard, StudySummary } from "../api/types";
import { Button } from "../components/Button";
import { CaptureGallery } from "../components/CaptureGallery";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { DiscardChanges } from "../components/DiscardChanges";
import { Icon } from "../components/Icon";
import { Input } from "../components/Input";
import { LoadState, loadErrorText } from "../components/LoadState";
import { MorphoRiskBadge } from "../components/morphometry/MorphoRiskBadge";
import { Card, ErrorNote, SectionLabel } from "../components/PanelHead";
import { Select } from "../components/Select";
import { ShareSheet } from "../components/ShareSheet";
import { Sheet } from "../components/Sheet";
import { ageFromDob } from "../components/patientAge";
import { fecha, fechaHora } from "../lib/fecha";
import { ROLE_LABEL } from "../lib/roles";
import { formatBytes } from "../lib/tamano";
import { STEP_LABELS, clampStep } from "../pipeline/steps";
import { useAuth } from "../store/auth";
import { NuevoEstudioSheet } from "./NuevoCaso";
import { modalidadesDe } from "../lib/modalidades";
import { StudyGallery } from "./Studies";

const BLANK = {
  // F1-62: «Sexo» arrancaba en «F» y un paciente sin el dato se guardaba como
  // mujer; ahora arranca vacío y vacío se guarda.
  surname: "", given_name: "", hospital_id: "", sex: "", dob: "",
  institution: "", ocupacion: "",
  antecedentes_patologicos: "", antecedentes_toxicologicos: "", antecedentes_quirurgicos: "",
  antecedentes_alergicos: "", antecedentes_farmacologicos: "", notes: "",
};

const SEXO_OPTS = [
  { value: "", label: "— sin dato —" },
  { value: "F", label: "F" },
  { value: "M", label: "M" },
  { value: "O", label: "O" },
];

/** F2-T5: un caso sin diagnóstico se llamaba «Estudio», que es otra cosa. */
const CASO_SIN_DX = "Caso sin diagnóstico";
const nombreCaso = (st: StudySummary) => st.dx_principal || CASO_SIN_DX;

/** «Segura, Juan», como lo escribe la lista; "" sin apellidos ni nombre. */
const nombreDe = (f: { surname: string; given_name: string }) =>
  [f.surname, f.given_name].filter(Boolean).join(", ");

/** F2-25: «16/09/1999 · 27 años». La ficha mostraba la fecha y ninguna parte
 *  de la gestión la edad, que es la que se usa para el riesgo. */
function lineaNacimiento(dob: string): string | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dob.trim());
  if (!m) return undefined;
  const dia = `${m[3]}/${m[2]}/${m[1]}`;
  const edad = ageFromDob(dob);
  return edad ? `${dia} · ${edad} ${edad === "1" ? "año" : "años"}` : dia;
}

/** F2-30: la etiqueta que pone el servidor empieza por el nombre del paciente,
 *  que en su ficha ya se sabe («Segura, Juan · Detección»). */
function etiquetaGuardada(s: PatientSessionInfo, paciente: string): string {
  let label = (s.label ?? "").trim();
  const prefijo = paciente ? `${paciente} · ` : "";
  if (prefijo && label.startsWith(prefijo)) label = label.slice(prefijo.length).trim();
  return label || `Sesión del ${fecha(s.updated_at)}`;
}

/** F1-69: qué hace «Reanudar» y que no es instantáneo (copia cientos de MB). */
const reanudarTitle = (paso: string) =>
  `Vuelve a abrir la sesión en «${paso}» con lo que tenía guardado: el estudio, la segmentación, la detección, las medidas y la decisión. Tarda unos segundos.`;

const fila: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 };

export function PatientSheet({
  open,
  patientId,
  summary,
  onClose,
  onSaved,
  onResume,
  onPlanCase,
  onOpenStudy,
  onOpenOrders,
  onDeleted,
  onChanged,
}: {
  open: boolean;
  patientId: number | null;   // null → crear; si no, la ficha de ese paciente
  /** La fila de la lista: trae quién lo creó (owner_id), que el detalle no trae. */
  summary?: PatientSummary | null;
  onClose: () => void;
  /** Con el paciente recién creado; sin él, al editar. */
  onSaved: (created?: PatientSummary) => void;
  onResume?: (sessionId: string) => void;
  /** Abre el registro de pedidos ya filtrado por este paciente. */
  onOpenOrders?: () => void;
  /** Entra al flujo con paciente y caso ya fijados; empieza en el paso 1. */
  onPlanCase?: (study: StudySummary) => void;
  /** Abre un estudio de imagen archivado del caso. */
  onOpenStudy?: (img: StudyCard) => void;
  /** El paciente se acaba de eliminar desde el pie de la ficha. */
  onDeleted?: () => void;
  /** Algo que la lista enseña cambió (compartido, guardados): que la recargue. */
  onChanged?: () => void;
}) {
  const editing = patientId !== null;
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // El detalle del 403 cuando el paciente es de otro profesional.
  const [denied, setDenied] = useState<string | null>(null);
  // Un fallo al leer la ficha (no un 403). Antes caía en el formulario en
  // blanco con «Guardar cambios», y guardarlo vaciaba al paciente.
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  // La lista de casos recargada tras crear o borrar uno: si fallaba, la
  // lista se quedaba como estaba sin decir nada (F1-72).
  const [studiesError, setStudiesError] = useState<string | null>(null);
  const [form, setForm] = useState({ ...BLANK });
  // Lo que había al abrir: «Cancelar», el ✕, Escape y el clic fuera tiraban lo
  // escrito sin preguntar (F1-60, F1-71). Contra esto se mide si hay cambios.
  const [initial, setInitial] = useState({ ...BLANK });
  const [askDiscard, setAskDiscard] = useState(false);
  // La salida que espera a «Descartar cambios» (planificar, reanudar, pedidos,
  // abrir un estudio o cerrar). En una ref: es una función, no algo que pintar.
  const pendingExitRef = useRef<(() => void) | null>(null);
  const [sessions, setSessions] = useState<PatientSessionInfo[]>([]);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [studies, setStudies] = useState<StudySummary[]>([]);
  const [studyOpen, setStudyOpen] = useState(false);
  const [editStudy, setEditStudy] = useState<StudySummary | null>(null);
  const [delStudy, setDelStudy] = useState<StudySummary | null>(null);
  const [delBusy, setDelBusy] = useState(false);
  // «Subir DICOM» sin casos abre primero el formulario del caso; al crearlo,
  // entra al paso 1 con él.
  const [uploadAfterCreate, setUploadAfterCreate] = useState(false);
  // El caso que «Planificar este caso» abre; null = el más reciente.
  const [planId, setPlanId] = useState<number | null>(null);
  const [shares, setShares] = useState<PatientShareOut[]>([]);
  const [sharesError, setSharesError] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  // Renombrar en línea: la sesión que se edita y lo escrito. La ref evita
  // guardar dos veces cuando Intro desmonta el campo y llega el blur.
  const [renaming, setRenaming] = useState<string | null>(null);
  const renamingRef = useRef<string | null>(null);
  const [draft, setDraft] = useState("");
  // El error de cada fila de guardado, bajo esa fila (el 409 va literal).
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [delSession, setDelSession] = useState<PatientSessionInfo | null>(null);
  const [delSessionBusy, setDelSessionBusy] = useState(false);
  const [askDelete, setAskDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const reloadStudies = () => {
    if (patientId === null) return;
    setStudiesError(null);
    api.patientStudies(patientId)
      .then(setStudies)
      .catch((e) => setStudiesError(loadErrorText(e)));
  };

  const reloadSessions = () => {
    if (patientId === null) return;
    setSessionsError(null);
    api.patientSessions(patientId)
      .then(setSessions)
      .catch((e) => setSessionsError(loadErrorText(e)));
  };

  // Aparte de la carga de la ficha: si falla, la ficha sigue siendo útil y la
  // sección lo dice con su «Reintentar».
  const loadShares = () => {
    if (patientId === null) return;
    setSharesError(null);
    Promise.resolve()
      .then(() => api.patientShares(patientId))
      .then(setShares)
      .catch((e) => setSharesError(loadErrorText(e)));
  };

  // La ficha completa, sus casos y sus sesiones al abrir un paciente.
  useEffect(() => {
    if (!open) return;
    setError(null);
    setDenied(null);
    setLoadError(null);
    setStudiesError(null);
    setSessionsError(null);
    setAskDiscard(false);
    setPlanId(null);
    setRowErrors({});
    setRenaming(null);
    renamingRef.current = null;
    setDeleteError(null);
    setShares([]);
    setSharesError(null);
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
          sex: p.sex ?? "", dob: p.dob ?? "", institution: p.institution ?? "", ocupacion: p.ocupacion ?? "",
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
        loadShares();
      })
      .catch((e) => {
        // Un 403 caía en el formulario vacío: un Médico que abría
        // ?paciente=<id ajeno> veía los campos en blanco con «Guardar cambios»,
        // «Nuevo caso» y «Pedidos» sobre un paciente que no es suyo. Ahora
        // la ficha solo muestra el motivo que da el servidor.
        if (e instanceof ApiError && e.status === 403) setDenied(e.message);
        else setLoadError(loadErrorText(e));
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, patientId, attempt]);

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  // Solo cuenta lo que se ve como formulario: con el 403 o el fallo de carga
  // no hay nada escrito que perder.
  const dirty = !loading && !denied && !loadError
    && (Object.keys(form) as (keyof typeof form)[]).some((k) => form[k] !== initial[k]);
  // Toda salida de la ficha pasa por aquí. «Planificar», «Subir DICOM»,
  // «Pedidos», «Reanudar» y los estudios llamaban a onClose directamente y
  // tiraban lo escrito en Antecedentes o Notas sin preguntar.
  const leaveWith = (action: () => void) => {
    if (!dirty) return action();
    pendingExitRef.current = action;
    setAskDiscard(true);
  };
  const requestClose = () => leaveWith(onClose);

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

  // F2-T1, F1-59: el título era «Editar paciente» también al consultar y con
  // el 403. Ahora es el nombre, con «Ficha de paciente» como rótulo.
  const nombre = summary?.full_name || nombreDe(initial);
  const title = denied ? "Paciente no autorizado" : !editing ? "Nuevo paciente" : nombre || "Ficha de paciente";
  const eyebrow = editing && !denied && nombre ? "Ficha de paciente" : undefined;
  const ready = editing && !loading && !denied && !loadError;

  // Compartir y eliminar: quien lo creó o un administrador (spec §6.1). Quien
  // lo tiene compartido no puede volver a compartirlo.
  const isAdmin = user?.role === "admin";
  const isOwner = !!user && !!summary && summary.owner_id === user.id;
  const canShare = isAdmin || isOwner;
  const canDelete = !!summary && canShare;
  // T7-rights: quien lo tiene compartido trabaja en sus casos y sesiones, pero
  // no cambia sus datos ni borra casos; el servidor lo rechazaba con un 403
  // después de dejarle escribir. Sin la fila de la lista no se sabe quién lo
  // creó: se deja editar y decide el servidor, para no bloquear al dueño.
  const canEditPatient = !summary || canShare;
  const ro = canEditPatient ? {} : { readOnly: true, style: { cursor: "default" } };

  // F2-29: «Planificar este caso» vivía al fondo de cada tarjeta. Arriba va el
  // caso más reciente (el id más alto) y, si hay varios, un selector.
  const recientes = [...studies].sort((a, b) => b.id - a.id);
  const planCase = recientes.find((s) => s.id === planId) ?? recientes[0] ?? null;
  const planificar = (st: StudySummary) => leaveWith(() => { onClose(); onPlanCase?.(st); });
  // F2-72: la ficha no tenía cómo subir un DICOM. El paso 1 es donde se sube y
  // ya sabe a qué caso archivarlo; sin caso, se crea primero.
  const subirDicom = () => {
    if (planCase) return planificar(planCase);
    setUploadAfterCreate(true);
    setEditStudy(null);
    setStudyOpen(true);
  };

  const startRename = (s: PatientSessionInfo) => {
    renamingRef.current = s.session_id;
    setRenaming(s.session_id);
    setDraft(etiquetaGuardada(s, nombre));
  };
  const cancelRename = () => { renamingRef.current = null; setRenaming(null); };
  const commitRename = (s: PatientSessionInfo) => {
    if (renamingRef.current !== s.session_id) return;
    cancelRename();
    const label = draft.trim();
    if (!label || label === etiquetaGuardada(s, nombre)) return;
    setRowErrors(({ [s.session_id]: _, ...rest }) => rest);
    api.renameSavedSession(s.session_id, label)
      .then((r) => setSessions((ss) => ss.map((x) => (x.session_id === s.session_id ? { ...x, label: r.label } : x))))
      .catch((e) => setRowErrors((r) => ({ ...r, [s.session_id]: e instanceof Error ? e.message : "No se pudo cambiar el nombre" })));
  };

  const confirmDeleteSession = async () => {
    if (!delSession) return;
    const sid = delSession.session_id;
    setDelSessionBusy(true);
    try {
      await api.deleteSavedSession(sid);
      setDelSession(null);
      reloadSessions();
      onChanged?.();
    } catch (e) {
      // El 409 («es el origen de una sesión abierta…») dice qué hacer: va
      // literal bajo la fila, no en un aviso genérico.
      setRowErrors((r) => ({ ...r, [sid]: e instanceof Error ? e.message : "No se pudo borrar la sesión guardada" }));
      setDelSession(null);
    } finally {
      setDelSessionBusy(false);
    }
  };

  const fechaNac = lineaNacimiento(form.dob);

  return (
    <>
    <Sheet open={open} onClose={requestClose} title={title} eyebrow={eyebrow} width={520}>
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
        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          {ready && summary && (
            // F2-29, F2-72, F2-27: lo que se viene a hacer a la ficha, arriba.
            // Sin la fila de la lista (aún cargando, o ?paciente= de alguien que
            // no está en ella) la página no sabría a qué paciente llevarlos.
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {recientes.length > 1 && planCase && (
                <Select
                  aria-label="Caso a planificar"
                  options={recientes.map((s) => ({ value: String(s.id), label: nombreCaso(s) }))}
                  value={String(planCase.id)}
                  onChange={(e) => setPlanId(Number(e.target.value))}
                />
              )}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {planCase && (
                  <Button size="sm" leadingIcon={<Icon name="STEP_PLAN" />} onClick={() => planificar(planCase)}>
                    Planificar este caso
                  </Button>
                )}
                <Button size="sm" variant={planCase ? "outline" : "default"} leadingIcon={<Icon name="UPLOAD" />} onClick={subirDicom}
                        title={planCase ? `Abre el paso 1 con el caso «${nombreCaso(planCase)}» fijado` : "Crea primero el caso al que se archiva el DICOM"}>
                  Subir DICOM de este paciente
                </Button>
                {onOpenOrders && (
                  <Button size="sm" variant="outline" leadingIcon={<Icon name="ORDER" />} onClick={() => leaveWith(onOpenOrders)}
                          title="Pedidos de clips de este paciente">
                    Pedidos
                  </Button>
                )}
              </div>
            </div>
          )}

          <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {editing && <SectionLabel style={{ marginBottom: 0 }}>Datos del paciente</SectionLabel>}
            {!canEditPatient && (
              <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
                Solo lectura: los cambia quien lo creó o un administrador.
              </div>
            )}
            <div style={fila}>
              <Input {...ro} label="Apellidos" placeholder="Restrepo" value={form.surname} onChange={set("surname")} required
                     hint="Puedes usar iniciales o un código en lugar del nombre real" />
              <Input {...ro} label="Nombre" placeholder="María" value={form.given_name} onChange={set("given_name")} />
            </div>
            <div style={fila}>
              <Input {...ro} label="N.º historia clínica" placeholder="HC-00000" value={form.hospital_id} onChange={set("hospital_id")} />
              <Select disabled={!canEditPatient} label="Sexo" options={SEXO_OPTS} value={form.sex} onChange={set("sex")} />
            </div>
            <div style={fila}>
              <Input {...ro} label="Fecha de nacimiento" type="date" value={form.dob} onChange={set("dob")} hint={fechaNac} />
              <Input {...ro} label="Institución" placeholder="Hospital…" value={form.institution} onChange={set("institution")} />
            </div>
            <Input {...ro} label="Ocupación" placeholder="—" value={form.ocupacion} onChange={set("ocupacion")} />
            <div style={{ marginTop: 6 }}>
              <SectionLabel style={{ marginBottom: 2 }}>Antecedentes</SectionLabel>
              {/* F1-63: se rellenaban creyendo que alimentaban el riesgo o el informe. */}
              <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
                Solo para consulta: no entran en el cálculo de riesgo ni en el informe.
              </div>
            </div>
            <Input {...ro} label="Patológicos" placeholder="HTA, tabaquismo…" value={form.antecedentes_patologicos} onChange={set("antecedentes_patologicos")} />
            <Input {...ro} label="Toxicológicos" placeholder="Tabaco, alcohol…" value={form.antecedentes_toxicologicos} onChange={set("antecedentes_toxicologicos")} />
            <Input {...ro} label="Quirúrgicos" placeholder="—" value={form.antecedentes_quirurgicos} onChange={set("antecedentes_quirurgicos")} />
            <Input {...ro} label="Alérgicos" placeholder="—" value={form.antecedentes_alergicos} onChange={set("antecedentes_alergicos")} />
            <Input {...ro} label="Farmacológicos" placeholder="—" value={form.antecedentes_farmacologicos} onChange={set("antecedentes_farmacologicos")} />
            {/* F2-26: una nota clínica de varias frases no cabía en una línea. */}
            <Input {...ro} label="Notas" placeholder="Notas clínicas libres…" multiline value={form.notes} onChange={set("notes")} />

            {/* F2-31: «Guardar cambios» estaba al final de un panel de casi dos
                pantallas, debajo de sesiones y capturas. Ahora se pega al pie
                visible mientras se editan los datos y se queda al final del
                bloque, antes de las secciones que tienen sus propios botones. */}
            {canEditPatient && <div style={{
              position: "sticky", bottom: 0, zIndex: 1, margin: "0 -22px", padding: "12px 22px",
              background: "var(--card)", borderTop: "1px solid var(--border)",
            }}>
              <ErrorNote>{error}</ErrorNote>
              {!form.surname && (
                <div style={{ fontSize: 12, color: "var(--muted-foreground)", marginBottom: 8 }}>
                  Escribe los apellidos para guardar.
                </div>
              )}
              <div style={{ display: "flex", gap: 10 }}>
                <Button type="submit" style={{ flex: 1 }} disabled={busy || !form.surname}>
                  {busy ? "Guardando…" : editing ? "Guardar cambios" : "Crear paciente"}
                </Button>
                <Button type="button" variant="outline" onClick={requestClose}>Cancelar</Button>
              </div>
            </div>}
          </form>

          {ready && (
            <section>
              <div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
                <SectionLabel style={{ flex: 1, marginBottom: 0 }}>Casos ({studies.length})</SectionLabel>
                {/* Fusión nº 9: «Nuevo estudio» creaba lo mismo que «Nuevo caso». */}
                <Button size="sm" variant="outline" leadingIcon={<Icon name="PLUS" />}
                        onClick={() => { setUploadAfterCreate(false); setEditStudy(null); setStudyOpen(true); }}>
                  Nuevo caso
                </Button>
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
                  const mods = modalidadesDe(st);
                  return (
                    <Card key={st.id} style={{ padding: "10px 12px" }}>
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--foreground)", flex: 1 }}>{nombreCaso(st)}</div>
                        <span style={{ display: "inline-flex", gap: 4, flexShrink: 0 }}>
                          <Button type="button" size="icon" variant="outline" title="Editar caso" aria-label={`Editar caso «${nombreCaso(st)}»`}
                                  onClick={() => { setUploadAfterCreate(false); setEditStudy(st); setStudyOpen(true); }}>
                            <Icon name="EDIT" size={13} />
                          </Button>
                          {canEditPatient && (
                            <Button type="button" size="icon" variant="outline" title="Eliminar caso" aria-label={`Eliminar caso «${nombreCaso(st)}»`}
                                    onClick={() => setDelStudy(st)}>
                              <Icon name="DELETE" size={13} color="var(--destructive)" />
                            </Button>
                          )}
                        </span>
                      </div>
                      <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 4, lineHeight: 1.6 }}>
                        {st.acquired_at && <>Fecha: {st.acquired_at}<br /></>}
                        {st.tipo_aneurisma && <>Tipo: {st.tipo_aneurisma}{(st.region_anatomica || st.lateralidad) && " · "}</>}
                        {st.region_anatomica && <>{st.region_anatomica} </>}
                        {st.lateralidad && <>({st.lateralidad}) </>}
                        {st.tratamiento_propuesto && <><br />Tratamiento: {st.tratamiento_propuesto}</>}
                        {mods && <><br />Imágenes: {mods}</>}
                        {st.angiographer && <> · Angiógrafo: {st.angiographer}</>}
                      </div>

                      {/* Los estudios de imagen del caso: un caso puede tener
                          varias adquisiciones (TAC + angiografía + control). */}
                      <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--border)" }}>
                        <StudyGallery
                          caseId={st.id}
                          compact
                          emptyHint="Sin imágenes archivadas todavía."
                          onOpen={(img) => leaveWith(() => { onClose(); onOpenStudy?.(img); })}
                          onResume={(img) => {
                            const sid = img.resumable_session_id;
                            if (!sid) return;
                            leaveWith(() => { onClose(); onResume?.(sid); });
                          }}
                        />
                      </div>
                    </Card>
                  );
                })}
              </div>
            </section>
          )}

          {ready && (
            <section>
              <div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
                <SectionLabel style={{ flex: 1, marginBottom: 0 }}>Compartido con</SectionLabel>
                {canShare && patientId !== null && (
                  <Button size="sm" variant="outline" leadingIcon={<Icon name="SHARE" />} onClick={() => setShareOpen(true)}>
                    Compartir con…
                  </Button>
                )}
              </div>
              {sharesError ? (
                <LoadState state="error" mensaje={sharesError} onRetry={loadShares} />
              ) : shares.length === 0 ? (
                <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>No está compartido con ninguna cuenta.</div>
              ) : (
                <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 4 }}>
                  {shares.map((s) => (
                    <li key={s.user_id} style={{ fontSize: 13, color: "var(--foreground)" }}>
                      {`${s.full_name || s.username} · ${ROLE_LABEL[s.role] ?? s.role}`}
                    </li>
                  ))}
                </ul>
              )}
              {summary?.is_shared_with_me && (
                <div style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 6 }}>
                  Te lo han compartido: puedes trabajar con él y crear o editar casos, pero no cambiar sus datos, borrar casos ni compartirlo con otras cuentas.
                </div>
              )}
            </section>
          )}

          {ready && (
            <section>
              <SectionLabel>Sesiones guardadas ({sessions.length})</SectionLabel>
              {sessionsError && <LoadState state="error" mensaje={sessionsError} onRetry={reloadSessions} />}
              {!sessionsError && sessions.length === 0 ? (
                <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
                  Aún no hay sesiones guardadas para este paciente.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {sessions.map((s) => {
                    const step = clampStep(s.current_step);
                    const paso = STEP_LABELS[step];
                    const label = etiquetaGuardada(s, nombre);
                    const diametro = s.max_diameter_mm != null ? ` · Ø ${s.max_diameter_mm.toFixed(1).replace(".", ",")} mm` : "";
                    return (
                      <div key={s.session_id} data-guardada>
                        <Card style={{ padding: "10px 12px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            {renaming === s.session_id ? (
                              <div style={{ flex: 1 }}>
                                <Input
                                  aria-label="Nombre de la sesión guardada"
                                  autoFocus
                                  maxLength={256}
                                  value={draft}
                                  onChange={(e) => setDraft(e.target.value)}
                                  onBlur={() => commitRename(s)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") { e.preventDefault(); commitRename(s); }
                                    else if (e.key === "Escape") {
                                      // Escape cancela el nombre y nada más: sin cortarlo
                                      // aquí, la ficha lo oía en `document` y se cerraba.
                                      e.preventDefault();
                                      e.stopPropagation();
                                      cancelRename();
                                    }
                                  }}
                                />
                              </div>
                            ) : (
                              <>
                                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--foreground)", flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>
                                  {label}
                                </span>
                                {/* Spec §6.2: renombrar y borrar es de quien lo creó o
                                    de un administrador; el servidor da 403 al resto. */}
                                {canShare && <Button type="button" size="icon" variant="ghost" title="Cambiar el nombre"
                                        aria-label={`Renombrar «${label}»`} onClick={() => startRename(s)}>
                                  <Icon name="RENAME" size={13} />
                                </Button>}
                              </>
                            )}
                            {/* F1-68: «Alto» a secas se leía como riesgo de rotura. */}
                            {s.rupture_risk_label && <MorphoRiskBadge label={s.rupture_risk_label} />}
                          </div>
                          {/* F2-30, F2-73: paso (sin repetirlo si ya es el nombre), hora local y lo que ocupa en disco. */}
                          <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 4, fontFamily: "var(--font-mono)" }}>
                            {`Paso ${step + 1}${label === paso ? "" : ` · ${paso}`} · ${fechaHora(s.updated_at)} · ${formatBytes(s.size_bytes)}${diametro}`}
                          </div>
                          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                            {onResume && (
                              <Button type="button" size="sm" variant="outline" leadingIcon={<Icon name="RESUME" />}
                                      title={reanudarTitle(paso)} onClick={() => leaveWith(() => onResume(s.session_id))}>
                                Reanudar
                              </Button>
                            )}
                            {canShare && (
                              <Button type="button" size="sm" variant="ghost" leadingIcon={<Icon name="DELETE" />}
                                      aria-label={`Borrar «${label}»`} onClick={() => setDelSession(s)}>
                                Borrar
                              </Button>
                            )}
                          </div>
                          {rowErrors[s.session_id] && (
                            <div role="alert"><ErrorNote>{rowErrors[s.session_id]}</ErrorNote></div>
                          )}
                        </Card>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          {/* Las capturas del visor, que el profesional guarda con un botón.
              Cuelgan del estudio de imagen; aquí se ven todas las del paciente
              porque es donde se viene a buscarlas: «la foto que hice del
              cuello», sin acordarse de en qué adquisición fue. */}
          {ready && patientId != null && <CaptureGallery patientId={patientId} />}

          {ready && canDelete && (
            <div style={{ borderTop: "1px solid var(--border)", paddingTop: 14 }}>
              <Button type="button" size="sm" variant="ghost" leadingIcon={<Icon name="DELETE" />}
                      style={{ color: "var(--destructive)" }}
                      onClick={() => { setDeleteError(null); setAskDelete(true); }}>
                Eliminar paciente
              </Button>
              <ErrorNote>{deleteError}</ErrorNote>
            </div>
          )}
        </div>
      )}
    </Sheet>
    <DiscardChanges
      open={askDiscard}
      onKeep={() => { pendingExitRef.current = null; setAskDiscard(false); }}
      onDiscard={() => {
        const salir = pendingExitRef.current ?? onClose;
        pendingExitRef.current = null;
        setAskDiscard(false);
        salir();
      }}
    />
    <NuevoEstudioSheet
      open={studyOpen}
      patientId={patientId}
      patientName={nombre || undefined}
      study={editStudy}
      onClose={() => { setStudyOpen(false); setEditStudy(null); setUploadAfterCreate(false); }}
      onCreated={(created) => {
        reloadStudies();
        if (uploadAfterCreate && created) {
          setUploadAfterCreate(false);
          planificar(created);
        }
      }}
    />
    {patientId !== null && (
      <ShareSheet
        open={shareOpen}
        patientId={patientId}
        patientName={nombre || undefined}
        current={shares}
        ownerId={summary?.owner_id ?? null}
        onClose={() => setShareOpen(false)}
        onSaved={(nuevas) => { setShares(nuevas); onChanged?.(); }}
      />
    )}
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
      ¿Seguro que quieres eliminar el caso <b style={{ color: "var(--foreground)" }}>{delStudy ? nombreCaso(delStudy) : ""}</b>?
      {(delStudy?.session_count ?? 0) > 0 && <> Sus {delStudy?.session_count} sesión(es) de planificación se conservarán pero quedarán desvinculadas.</>} Esta acción no se puede deshacer.
    </ConfirmDialog>
    <ConfirmDialog
      open={!!delSession}
      title="Borrar la sesión guardada"
      destructive
      busy={delSessionBusy}
      confirmLabel={delSessionBusy ? "Borrando…" : "Borrar"}
      onCancel={() => setDelSession(null)}
      onConfirm={confirmDeleteSession}
    >
      ¿Borrar <b style={{ color: "var(--foreground)" }}>«{delSession ? etiquetaGuardada(delSession, nombre) : ""}»</b>?{" "}
      {"Se borra la copia guardada y no se puede deshacer. Si la acabas de reanudar, no se podrá borrar hasta que esa sesión abierta caduque sola."}
    </ConfirmDialog>
    {askDelete && summary && (
      <DeleteConfirm
        patient={summary}
        onCancel={() => setAskDelete(false)}
        onConfirm={async () => {
          try {
            await api.deletePatient(summary.id);
            setAskDelete(false);
            onDeleted?.();
          } catch (e) {
            setDeleteError(e instanceof Error ? e.message : "Error al eliminar el paciente");
            setAskDelete(false);
          }
        }}
      />
    )}
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
  onConfirm: () => Promise<void>;
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
      onConfirm={async () => { setBusy(true); await onConfirm(); setBusy(false); }}
    >
      ¿Seguro que quieres eliminar a <b style={{ color: "var(--foreground)" }}>{patient.full_name}</b>? Se
      borrarán también sus {casos} y {sesiones}. Esta acción no se puede deshacer.
    </ConfirmDialog>
  );
}
