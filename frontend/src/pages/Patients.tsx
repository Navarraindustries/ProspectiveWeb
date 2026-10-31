/* Pacientes — contadores y tabla de pacientes por última actividad (GET
   /api/patients); crear, abrir la ficha y reanudar la última sesión. Borrar
   un paciente está al pie de su ficha (PatientSheet.tsx). */

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import type { PatientSummary, StudyCard, StudySummary } from "../api/types";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { Icon } from "../components/Icon";
import { Input } from "../components/Input";
import { AppShell } from "../components/shell/AppShell";
import { Card, PanelHead } from "../components/PanelHead";
import { LoadState, loadErrorText } from "../components/LoadState";
import { useAuth } from "../store/auth";
import { CasePatientPicker, NuevoEstudioSheet } from "./NuevoCaso";
import { PatientSheet } from "./PatientSheet";

import { recuentoPacientes, ultimaActividad, ultimaSesion } from "../lib/pacientes";
import { ageFromDob } from "../components/patientAge";

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
  // El fallo de la carga sustituye a la lista: con él no hay contadores ni
  // «Ningún paciente».
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sheetPatientId, setSheetPatientId] = useState<number | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [caseSheet, setCaseSheet] = useState(false);
  const [casePatient, setCasePatient] = useState<PatientSummary | null>(null);
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
        // La fila trae quién lo creó: decide «Compartir con…» y «Eliminar paciente».
        summary={sheetPatientId === null ? null : patients.find((x) => x.id === sheetPatientId) ?? null}
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
        onDeleted={() => { setSheetOpen(false); load(); }}
        onChanged={load}
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
    </AppShell>
  );
}
