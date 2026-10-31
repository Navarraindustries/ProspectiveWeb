/* Pacientes — avisos clínicos y tabla de pacientes por última actividad (GET
   /api/patients); crear, abrir la ficha y reanudar la última sesión. Borrar
   un paciente está al pie de su ficha (PatientSheet.tsx). */

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import type { ClipOrder, PatientSummary, StudyCard, StudySummary } from "../api/types";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { Icon } from "../components/Icon";
import { Input } from "../components/Input";
import { AppShell } from "../components/shell/AppShell";
import { Card } from "../components/PanelHead";
import { LoadState, loadErrorText } from "../components/LoadState";
import { useAuth } from "../store/auth";
import { useNav } from "../store/nav";
import { CasePatientPicker, NuevoEstudioSheet } from "./NuevoCaso";
import { PatientSheet } from "./PatientSheet";

import { STEP_LABELS, clampStep } from "../pipeline/steps";
import { desdeServidor, fechaHora } from "../lib/fecha";
import { ageFromDob } from "../components/patientAge";
import { avisosOficina } from "../lib/avisosOficina";
import "../styles/office.css";

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
type AvisoCreado =
  | { tipo: "paciente"; paciente: PatientSummary }
  | { tipo: "caso"; paciente: PatientSummary; caso: StudySummary };

const COLUMNAS = ["Paciente", "HC", "Edad", "Institución", "Último caso", "Última sesión", "Acciones"];
// Anchos fijos (en % de la tabla): con el reparto automático una HC o una
// institución largas, todas en una línea, empujaban «Acciones» fuera de la
// tarjeta, que recorta; «Acciones» necesita sitio para dos botones (30-10).
const ANCHOS = ["18%", "11%", "5%", "12%", "15%", "13%", "26%"];
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
  const [aviso, setAviso] = useState<AvisoCreado | null>(null);
  // Pedidos de clip abiertos para el aviso de parados; null = sin acceso o fallo.
  const [orders, setOrders] = useState<ClipOrder[] | null>(null);
  // Paciente recién creado: su fila se enciende 1,2 s.
  const [nuevaId, setNuevaId] = useState<number | null>(null);
  const nav = useNav();
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
    // Los avisos de pedidos son accesorios: si fallan (403 de un Médico sin
    // acceso, servidor caído), simplemente no hay aviso de pedidos.
    api.listClipOrders({ openOnly: true }).then(setOrders).catch(() => setOrders(null));
  };
  useEffect(load, []);

  // El temporizador de la fila nueva arranca cuando la fila ya está montada
  // (tras la recarga), no al crear: con una recarga lenta se apagaba antes.
  const nuevaMontada = nuevaId !== null && patients.some((x) => x.id === nuevaId);
  useEffect(() => {
    if (!nuevaMontada) return;
    const t = setTimeout(() => setNuevaId(null), 1200);
    return () => clearTimeout(t);
  }, [nuevaMontada]);

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

  // «Reanudar» es el primario solo en la sesión más reciente de toda la lista
  // (no de las filas filtradas): un único siguiente paso evidente.
  const masReciente = useMemo(
    () => [...patients].sort((x, y) => ultimaActividad(y) - ultimaActividad(x)).find((p) => p.last_session_id),
    [patients],
  );
  const avisos = useMemo(
    () => avisosOficina({ patients, orders, ahora: new Date() }),
    [patients, orders],
  );

  // F1-252: un Médico no ve la base entera, sino los suyos y los que le han
  // compartido (F2-75); «en la base de datos» le hacía creer que estaba vacía.
  const subtitulo = loading ? "Cargando…" : loadError ? "No se pudo cargar la lista"
    : `${recuentoPacientes(patients.length)} · ${isAdmin ? "en la base de datos" : "tuyos o compartidos contigo"}`;

  const iconBtn: React.CSSProperties = {
    display: "inline-flex", alignItems: "center", justifyContent: "center", width: 30, height: 30,
    borderRadius: "var(--radius-md)", border: "1px solid var(--border)", background: "var(--card)", cursor: "pointer",
  };

  return (
    <AppShell
      crumbs={[{ label: "Pacientes" }]}
      subtitle={subtitulo}
      // F2-20, F2-21: «Usuarios», «Cuentas pendientes» y «Estudios» están en la
      // barra lateral; aquí quedan solo las acciones clínicas.
      actions={
        <span style={{ display: "inline-flex", gap: 8 }}>
          <Button variant="outline" size="sm" leadingIcon={<Icon name="PLUS" />} onClick={openCreate}>
            Nuevo paciente
          </Button>
          <Button size="sm" leadingIcon={<Icon name="PLUS" />} onClick={() => setCaseSheet(true)}>
            Nuevo caso
          </Button>
          {onStartWithoutPatient && (
            <Button variant="outline" size="sm" leadingIcon={<Icon name="STEP_SEGMENT" />} onClick={onStartWithoutPatient}
                    title="Sube un DICOM y planifica ya. Si no lo adjuntas después a un paciente y un caso, se borra al caducar la sesión.">
              Prueba rápida sin paciente
            </Button>
          )}
        </span>
      }
    >

      <div style={{ flex: 1, overflowY: "auto", padding: "28px 32px 48px" }}>
        <div style={{ maxWidth: 1120, margin: "0 auto" }} className="fade-rise">
          {avisos.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16, marginBottom: 24 }}>
              {avisos.map((av) => (
                <Card key={av.titulo} style={{ padding: "14px 16px" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                    <span style={{
                      width: 36, height: 36, borderRadius: "var(--radius-md)", flexShrink: 0,
                      background: `color-mix(in srgb, var(--${av.tono}) 14%, transparent)`, color: `var(--${av.tono})`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      <Icon name={av.tono === "success" ? "STATUS_OK" : av.destino === "orders" ? "CLIPS" : "WAIT"} size={16} />
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "var(--foreground)" }}>{av.titulo}</div>
                      <div style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={av.detalle}>
                        {av.detalle}
                      </div>
                    </div>
                    {av.destino !== null && (
                      <button type="button" onClick={() => nav.go(av.destino!)}
                              style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: 12, fontWeight: 600, color: "var(--data)" }}>
                        Ver
                      </button>
                    )}
                  </div>
                </Card>
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

          <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-sm)", overflow: "hidden" }}>
            {/* F2-18: la búsqueda estaba en la barra superior, lejos de la tabla que filtra. */}
            <div style={{ display: "flex", alignItems: "center", padding: "10px 12px", borderBottom: "1px solid var(--border)" }}>
              <div style={{ width: 280 }}>
                <Input icon={<Icon name="SEARCH" />} placeholder="Buscar paciente o HC…" aria-label="Buscar paciente o HC"
                       value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
            </div>
            {/* La tarjeta recorta (overflow hidden) y una HC larga o una institución
                larga empujaban «Acciones» fuera del borde derecho: la tabla se
                desplaza en horizontal si no cabe y las celdas largas se acortan con
                puntos suspensivos (30-10). */}
            <div style={{ overflowX: "auto" }}>
            <table className="tabla-oficina" style={{ width: "100%", minWidth: 980, tableLayout: "fixed", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr>
                  {COLUMNAS.map((h, i) => (
                    <th
                      key={h}
                      style={{ width: ANCHOS[i], textAlign: i === COLUMNAS.length - 1 ? "right" : "left", padding: "11px 16px", background: "var(--muted)", color: "var(--muted-foreground)", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "var(--tracking-label)", borderBottom: "1px solid var(--border)" }}
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
                    className={p.id === nuevaId ? "fila-nueva" : undefined}
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
                    <td style={{ ...celda, fontWeight: 600, color: "var(--foreground)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                        title={p.full_name}>
                      <span data-nombre>{p.full_name}</span>
                      {p.is_shared_with_me && (
                        <span style={{ marginLeft: 8 }}><Badge variant="brand">Compartido</Badge></span>
                      )}
                      {p.shared_with_count > 0 && (
                        <span style={{ marginLeft: 8 }}><Badge variant="muted">{`Compartido con ${p.shared_with_count}`}</Badge></span>
                      )}
                    </td>
                    <td style={{ ...celda, fontFamily: "var(--font-mono)", color: "var(--muted-foreground)", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                        title={p.hospital_id || undefined}>
                      {p.hospital_id || "—"}
                    </td>
                    {/* F2-24: la edad, que el especialista usa para el riesgo de rotura. */}
                    <td style={{ ...celda, fontFamily: "var(--font-mono)", color: "var(--muted-foreground)" }}>{ageFromDob(p.dob) || "—"}</td>
                    <td style={{ ...celda, color: "var(--foreground)", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                        title={p.institution || undefined}>
                      {p.institution || "—"}
                    </td>
                    <td style={{ ...celda, color: "var(--foreground)", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                        title={p.last_case_label || undefined}>
                      {p.last_case_label || "—"}
                    </td>
                    <td style={{ ...celda, color: "var(--muted-foreground)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
                        title={ultimaSesion(p)}>
                      {ultimaSesion(p)}
                    </td>
                    <td style={{ padding: "8px 12px", textAlign: "right" }}>
                      {/* Si la tarjeta es estrecha, los botones pasan a dos líneas en vez de salirse. */}
                      <span className="fila-acciones" style={{ display: "inline-flex", flexWrap: "wrap", justifyContent: "flex-end", gap: 6 }}>
                        {p.last_session_id && (
                          // F2-24: reanudar en un clic, sin abrir la ficha.
                          <Button size="sm" variant={p.id === masReciente?.id ? "default" : "outline"} leadingIcon={<Icon name="RESUME" />}
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
          if (creado) { setAviso({ tipo: "paciente", paciente: creado }); setNuevaId(creado.id); }
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
