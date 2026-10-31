/* Pacientes — panel de tarjetas por última actividad (GET /api/patients) con
   panel lateral; crear, abrir la ficha y reanudar la última sesión. Borrar
   un paciente está al pie de su ficha (PatientSheet.tsx). */

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import type { PatientSummary, StudyCard, StudySummary } from "../api/types";
import { Button } from "../components/Button";
import { Icon } from "../components/Icon";
import { Input } from "../components/Input";
import { AppShell } from "../components/shell/AppShell";
import { PanelHead } from "../components/PanelHead";
import { LoadState, loadErrorText } from "../components/LoadState";
import { PatientCard } from "../components/patients/PatientCard";
import { PatientsSidePanel } from "../components/patients/PatientsSidePanel";
import "../components/patients/patients.css";
import { useAuth } from "../store/auth";
import { CasePatientPicker, NuevoEstudioSheet } from "./NuevoCaso";
import { PatientSheet } from "./PatientSheet";

import { filtraPestana, hayCompartidos, recuentoPacientes, ultimaActividad, type PestanaPacientes } from "../lib/pacientes";

/** El aviso tras crear: el siguiente paso, para no tener que buscarlo (F2-22). */
type Aviso =
  | { tipo: "paciente"; paciente: PatientSummary }
  | { tipo: "caso"; paciente: PatientSummary; caso: StudySummary };

const PESTANAS: { id: PestanaPacientes; texto: string }[] = [
  { id: "todos", texto: "Todos" },
  { id: "mios", texto: "Míos" },
  { id: "compartidos", texto: "Compartidos conmigo" },
];
// Cuántos esqueletos mientras carga: llenan la rejilla de tres columnas en dos filas.
const ESQUELETOS = 6;

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

  const [pestana, setPestana] = useState<PestanaPacientes>("todos");

  // La pestaña filtra antes que la búsqueda: «Míos» + «segura» busca dentro de los míos.
  const conCompartidos = hayCompartidos(patients);
  // Si lo compartido desaparece mientras se mira su pestaña, la fila de pestañas
  // se oculta: se vuelve a «Todos» para no quedar con una lista vacía sin salida.
  const pestanaActiva: PestanaPacientes = conCompartidos ? pestana : "todos";
  const rows = useMemo(() => {
    const t = q.toLowerCase();
    return filtraPestana(patients, pestanaActiva, user?.id ?? null)
      .filter((p) => p.full_name.toLowerCase().includes(t) || p.hospital_id.toLowerCase().includes(t))
      .sort((a, b) => ultimaActividad(b) - ultimaActividad(a));
  }, [patients, q, pestanaActiva, user?.id]);

  // F1-253: para un Médico la lista vacía no significa que no haya pacientes en
  // el sistema, sino que no tiene ninguno suyo ni compartido con él.
  const vacioDelRol = isAdmin
    ? "No hay pacientes registrados. Crea el primero para comenzar."
    : "Solo ves tus pacientes y los que te han compartido. Crea el primero para comenzar.";

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
        {/* 1440: tres columnas de tarjetas más el panel lateral caben sin apretar. */}
        <div style={{ maxWidth: 1440, margin: "0 auto" }} className="fade-rise">
          <PanelHead
            title="Pacientes"
            desc={loading ? "Cargando…" : loadError ? "No se pudo cargar la lista" : recuentoPacientes(patients.length)}
          />

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

          <div className="pt-toolbar">
            {/* F2-18: la búsqueda junto a la lista que filtra. */}
            <div className="pt-search">
              <Input icon={<Icon name="SEARCH" />} placeholder="Buscar paciente o HC…" aria-label="Buscar paciente o HC"
                     value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            {conCompartidos && (
              <div role="tablist" aria-label="Qué pacientes ver" className="pt-tabs">
                {PESTANAS.map((t) => (
                  <button key={t.id} type="button" role="tab" aria-selected={pestanaActiva === t.id}
                          className={`pt-tab${pestanaActiva === t.id ? " pt-tab--on" : ""}`}
                          onClick={() => setPestana(t.id)}>
                    {t.texto}
                  </button>
                ))}
              </div>
            )}
          </div>

          <section className="pt-layout">
            <div>
              {loadError ? (
                <LoadState state="error" mensaje={loadError} onRetry={load} />
              ) : loading && patients.length === 0 ? (
                // Esqueletos, no texto: la rejilla ya tiene su forma antes de llegar los datos.
                <div className="pt-grid" aria-busy="true">
                  {Array.from({ length: ESQUELETOS }, (_, i) => <div key={i} className="pt-card pt-card--skeleton" />)}
                </div>
              ) : patients.length === 0 ? (
                <LoadState state="vacio" mensaje={vacioDelRol} onRetry={load} />
              ) : rows.length === 0 ? (
                <LoadState state="vacio" mensaje="Ningún paciente coincide con la búsqueda." onRetry={load} />
              ) : (
                <div className="pt-grid" data-testid="pacientes-rejilla">
                  {rows.map((p) => (
                    <PatientCard key={p.id} patient={p}
                                 onOpen={(x) => openSheet(x.id)}
                                 onResume={onResume}
                                 // La tarjeta no conoce el caso; la ficha tiene «Planificar este caso» y «Nuevo caso».
                                 onPlan={(x) => openSheet(x.id)} />
                  ))}
                </div>
              )}
            </div>
            <PatientsSidePanel patients={patients} loading={loading}
                               onOpenPatient={openSheet} onNewPatient={openCreate} />
          </section>
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
