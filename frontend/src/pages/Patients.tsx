/* Pacientes — avisos clínicos y panel de tarjetas por última actividad (GET
   /api/patients) con panel lateral; crear, abrir la ficha y reanudar la última
   sesión. Borrar un paciente está al pie de su ficha (ColumnaDatos.tsx). */

import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import type { ClipOrder, PatientSummary, StudySummary } from "../api/types";
import { Button } from "../components/Button";
import { Icon } from "../components/Icon";
import { Input } from "../components/Input";
import { AppShell } from "../components/shell/AppShell";
import { LoadState, loadErrorText } from "../components/LoadState";
import { PatientFormSheet } from "../components/PatientFormSheet";
import { PatientCard } from "../components/patients/PatientCard";
import { PatientsSidePanel } from "../components/patients/PatientsSidePanel";
import "../components/patients/patients.css";
import { useAuth } from "../store/auth";
import { glass } from "../styles/glass";
import { patientPath, useNav } from "../store/nav";
import { CasePatientPicker, NuevoEstudioSheet } from "./NuevoCaso";

import { avisosOficina } from "../lib/avisosOficina";
import { filtraPestana, hayCompartidos, recuentoPacientes, ultimaActividad, type PestanaPacientes } from "../lib/pacientes";
import { PageBody } from "../components/shell/PageBody";

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
  onStartWithoutPatient,
}: {
  onResume: (sessionId: string, patient: PatientSummary) => void;
  /** Enter the pipeline for a clinical case (patient + case known upfront). */
  onPlanCase: (study: StudySummary, patient: PatientSummary) => void;
  /** Al pipeline sin paciente ni caso; se adjuntan después. */
  onStartWithoutPatient?: () => void;
}) {
  const [patients, setPatients] = useState<PatientSummary[]>([]);
  const [loading, setLoading] = useState(true);
  // Cuenta las cargas de la lista: el panel lateral pide su actividad de nuevo
  // con cada una, porque guardar, borrar o crear deja bloques nuevos.
  const [version, setVersion] = useState(0);
  // La primera carga no cuenta: el panel ya pide su actividad al montarse.
  const primeraCarga = useRef(true);
  // El fallo de la carga sustituye a la lista: con él no hay contadores ni
  // «Ningún paciente».
  const [loadError, setLoadError] = useState<string | null>(null);
  // La hoja de «Nuevo paciente»; la ficha de uno existente es su propia pantalla.
  const [sheetOpen, setSheetOpen] = useState(false);
  const [caseSheet, setCaseSheet] = useState(false);
  const [casePatient, setCasePatient] = useState<PatientSummary | null>(null);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  // Pedidos de clip abiertos para el aviso de parados; null = sin acceso o fallo.
  const [orders, setOrders] = useState<ClipOrder[] | null>(null);
  const nav = useNav();
  const [q, setQ] = useState("");
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const load = () => {
    if (primeraCarga.current) primeraCarga.current = false;
    else setVersion((v) => v + 1);
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
    // Los avisos de pedidos son accesorios: si fallan (403 de un Médico sin
    // acceso, servidor caído), simplemente no hay aviso de pedidos.
    api.listClipOrders({ openOnly: true }).then(setOrders).catch(() => setOrders(null));
  };
  useEffect(load, []);

  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  // ?paciente=<id> es el enlace antiguo a la ficha (marcadores, enlaces
  // enviados): ahora la ficha tiene URL propia y se redirige a ella con
  // `replace`, para que el enlace viejo no sea un destino de Atrás.
  // ?nuevo=paciente / ?nuevo=caso vienen de la paleta ⌘K. Cada parámetro se
  // consume una vez y se borra: recargar la página no vuelve a abrir la hoja.
  useEffect(() => {
    const id = Number(params.get("paciente"));
    const nuevo = params.get("nuevo");
    const abreFicha = Number.isInteger(id) && id > 0;
    if (!abreFicha && nuevo !== "paciente" && nuevo !== "caso") return;
    if (abreFicha) {
      navigate(patientPath(id), { replace: true });
      return;
    }
    if (nuevo === "paciente") {
      setSheetOpen(true);
    } else {
      setCaseSheet(true);
    }
    setParams({}, { replace: true });
  }, [params, setParams, navigate]);

  const openCreate = () => setSheetOpen(true);
  // Fusión nº 8: «Editar» era la única puerta a la ficha y se anunciaba como
  // una edición; ahora la abren el clic en la tarjeta y su Intro.
  const openSheet = (id: number) => navigate(patientPath(id));

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

  const avisos = useMemo(
    () => avisosOficina({ patients, orders, ahora: new Date() }),
    [patients, orders],
  );

  // F1-252: un Médico no ve la base entera, sino los suyos y los que le han
  // compartido (F2-75); «en la base de datos» le hacía creer que estaba vacía.
  // El título es la miga «Pacientes» de la barra; aquí solo queda el recuento.
  const subtitulo = loading && patients.length === 0 ? "Cargando…" : loadError ? "No se pudo cargar la lista"
    : `${recuentoPacientes(patients.length)} · ${isAdmin ? "en la base de datos" : "tuyos o compartidos contigo"}`;

  const iconBtn: React.CSSProperties = {
    display: "inline-flex", alignItems: "center", justifyContent: "center", width: 30, height: 30,
    borderRadius: "var(--radius-md)", border: "1px solid var(--border)", background: "var(--card)", cursor: "pointer",
  };

  return (
    <AppShell
      crumbs={[{ label: "Pacientes" }]}
      subtitle={subtitulo}
      // F2-20, F2-21: «Usuarios», «Cuentas pendientes» y «Estudios» están en el
      // panel lateral; aquí quedan solo las acciones clínicas, la prueba rápida la última.
      actions={
        <span style={{ display: "inline-flex", gap: 8 }}>
          <Button size="sm" leadingIcon={<Icon name="PLUS" />} onClick={openCreate}>
            Nuevo paciente
          </Button>
          <Button variant="outline" size="sm" leadingIcon={<Icon name="PLUS" />} onClick={() => setCaseSheet(true)}>
            Nuevo caso
          </Button>
          {onStartWithoutPatient && (
            <Button variant="ghost" size="sm" leadingIcon={<Icon name="STEP_SEGMENT" />} onClick={onStartWithoutPatient}
                    title="Sube un DICOM y planifica ya. Si no lo adjuntas después a un paciente y un caso, se borra al caducar la sesión.">
              Prueba rápida sin paciente
            </Button>
          )}
        </span>
      }
    >

      <PageBody className="fade-rise">
          {avisos.length > 0 && (
            // Franja de chips: cada aviso es una pastilla de cristal, no una tarjeta de la rejilla.
            <div role="list" aria-label="Avisos clínicos" className="pt-avisos">
              {avisos.map((av) => (
                <div key={av.titulo} role="listitem" data-aviso={av.tono} data-glass className="pt-aviso" style={glass("normal")}>
                  <span className="pt-aviso-icono" style={{
                    background: `color-mix(in srgb, var(--${av.tono}) 14%, transparent)`, color: `var(--${av.tono})`,
                  }}>
                    <Icon name={av.tono === "success" ? "STATUS_OK" : av.destino === "orders" ? "CLIPS" : "WAIT"} size={14} />
                  </span>
                  <span className="pt-aviso-titulo">{av.titulo}</span>
                  <span className="pt-aviso-detalle" title={av.detalle}>{av.detalle}</span>
                  {av.destino !== null && (
                    <button type="button" className="pt-aviso-ver" onClick={() => nav.go(av.destino!)}>
                      Ver
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

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
            <PatientsSidePanel patients={patients} loading={loading} error={!!loadError} version={version}
                               onOpenPatient={openSheet} onNewPatient={openCreate} />
          </section>
      </PageBody>

      <PatientFormSheet
        open={sheetOpen}
        patient={null}
        onClose={() => setSheetOpen(false)}
        onSaved={(creado) => {
          load();
          // Spec §5: «Nuevo paciente» termina ofreciendo el caso de ese paciente.
          if (creado) setAviso({ tipo: "paciente", paciente: creado });
        }}
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
