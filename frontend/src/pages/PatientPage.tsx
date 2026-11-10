/* La ficha de un paciente con URL propia (/app/pacientes/:id).

   Antes la ficha era una hoja encima de la lista, sin dirección: recargar o
   volver con Atrás desde el pipeline la perdía. Ahora es una pantalla con su
   miga «Pacientes › nombre» y una cascada de columnas de cristal: Datos, y a
   su derecha Casos → Estudios de imagen → Sesiones guardadas → Vista previa,
   cada una abierta al elegir una fila de la anterior. Cambiar de caso vacía
   las columnas de su derecha; cambiar de estudio, la sesión elegida. */

import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "../api/client";
import type { PatientDetail, PatientSessionInfo, PatientSummary, StudyCard, StudySummary } from "../api/types";
import { Button } from "../components/Button";
import { EstadoVacio } from "../components/EstadoVacio";
import { CaptureGallery } from "../components/CaptureGallery";
import { LoadState, loadErrorText } from "../components/LoadState";
import { PatientFormSheet } from "../components/PatientFormSheet";
import { Cascada, COLUMNAS_VISIBLES, type ColumnaCascada } from "../components/ficha/Cascada";
import { ColumnaCasos, casoEnFoco, ultimaSesionDelCaso, type SeleccionCaso } from "../components/ficha/ColumnaCasos";
import { ColumnaDatos, derechosPaciente, nombrePaciente, type SeccionFicha } from "../components/ficha/ColumnaDatos";
import { ColumnaEstudios } from "../components/ficha/ColumnaEstudios";
import { ColumnaSesiones } from "../components/ficha/ColumnaSesiones";
import { VistaPrevia } from "../components/ficha/VistaPrevia";
import { AppShell } from "../components/shell/AppShell";
import { useAuth } from "../store/auth";
import { SCREEN_PATH } from "../store/nav";
import { NuevoEstudioSheet } from "./NuevoCaso";
import { PageBody } from "../components/shell/PageBody";
import { useTramo } from "../hooks/useEstrecho";

export interface PatientPageProps {
  patientId: number;
  onResume: (sessionId: string, p: PatientSummary) => void | Promise<unknown>;
  onPlanCase: (st: StudySummary, p: PatientSummary) => void;
  onOpenStudy?: (img: StudyCard) => void;
  onOpenOrders?: (p: PatientSummary) => void;
}

/** La fila de la lista de este paciente: trae quién lo creó (derechos) y
 *  cuántos casos tiene, que el detalle no trae. Si la lista falla o no lo trae,
 *  null: la ficha se abre igual, de solo lectura y con aviso. */
const resumenDe = (patientId: number) =>
  Promise.resolve()
    .then(() => api.listPatients())
    .then((filas) => filas.find((x) => x.id === patientId) ?? null)
    .catch(() => null);

/** El estudio elegido en la columna Estudios: la tarjeta (su miniatura va a
 *  la vista previa) o las sesiones del caso sin estudio archivado. */
type EstudioElegido = StudyCard | "sin-estudio";

export function PatientPage({ patientId, onResume, onPlanCase, onOpenStudy, onOpenOrders }: PatientPageProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  // Móvil: la página desplaza entera. ≥ 1920: la ficha sale de --content-max (A37).
  const tramo = useTramo();
  // En móvil solo cabe una columna: la ficha abre con los datos del paciente y
  // Casos queda como su siguiente columna (se abre desde su entrada).
  const seccionInicial = useRef<SeccionFicha | null>(tramo === "movil" ? null : "casos");
  seccionInicial.current = tramo === "movil" ? null : "casos";
  const [patient, setPatient] = useState<PatientDetail | null>(null);
  const [summary, setSummary] = useState<PatientSummary | null>(null);
  const [loading, setLoading] = useState(true);
  // El detalle del 403 cuando el paciente es de otro profesional.
  const [denied, setDenied] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // El 404: el paciente no existe (borrado, o un enlace viejo). Reintentar no lo trae.
  const [notFound, setNotFound] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [seccion, setSeccion] = useState<SeccionFicha | null>(seccionInicial.current);
  const [formOpen, setFormOpen] = useState(false);
  const [casoOpen, setCasoOpen] = useState(false);
  // Lo que cuelga del paciente: sus casos (null mientras cargan) y todas sus
  // sesiones guardadas, que cada columna filtra por caso y estudio.
  const [casos, setCasos] = useState<StudySummary[] | null>(null);
  const [casosError, setCasosError] = useState<string | null>(null);
  const [sesiones, setSesiones] = useState<PatientSessionInfo[]>([]);
  const [sesionesError, setSesionesError] = useState<string | null>(null);
  // Lo elegido en cada columna.
  const [casoSel, setCasoSel] = useState<SeleccionCaso | null>(null);
  const [estudio, setEstudio] = useState<EstudioElegido | null>(null);
  const [sesionSel, setSesionSel] = useState<string | null>(null);
  // Una respuesta que llega tarde de otro paciente no debe pintarse.
  const pacienteActual = useRef(patientId);

  useEffect(() => {
    pacienteActual.current = patientId;
    let vigente = true;
    setLoading(true);
    setPatient(null);
    setSummary(null);
    setDenied(null);
    setLoadError(null);
    setNotFound(false);
    setSeccion(seccionInicial.current);
    setCasos(null);
    setCasosError(null);
    setSesiones([]);
    setSesionesError(null);
    setCasoSel(null);
    setEstudio(null);
    setSesionSel(null);
    Promise.all([api.getPatient(patientId), resumenDe(patientId)])
      .then(([p, s]) => { if (vigente) { setPatient(p); setSummary(s); } })
      .catch((e) => {
        if (!vigente) return;
        if (e instanceof ApiError && e.status === 403) setDenied(e.message);
        else if (e instanceof ApiError && e.status === 404) setNotFound(true);
        else setLoadError(loadErrorText(e));
      })
      .finally(() => { if (vigente) setLoading(false); });
    return () => { vigente = false; };
  }, [patientId, attempt]);

  // Cada recarga lleva su número: si dos se cruzan, solo pinta la última
  // pedida, aunque la anterior responda después (p. ej. dos borrados seguidos).
  const pedidoCasos = useRef(0);
  const pedidoSesiones = useRef(0);

  const recargarCasos = useCallback(() => {
    const id = patientId;
    const n = ++pedidoCasos.current;
    const vigente = () => pacienteActual.current === id && pedidoCasos.current === n;
    setCasosError(null);
    Promise.resolve()
      .then(() => api.patientStudies(id))
      .then((c) => { if (vigente()) setCasos(c); })
      .catch((e) => { if (vigente()) setCasosError(loadErrorText(e)); });
  }, [patientId]);

  const recargarSesiones = useCallback(() => {
    const id = patientId;
    const n = ++pedidoSesiones.current;
    const vigente = () => pacienteActual.current === id && pedidoSesiones.current === n;
    setSesionesError(null);
    Promise.resolve()
      .then(() => api.patientSessions(id))
      .then((s) => { if (vigente()) setSesiones(s); })
      .catch((e) => { if (vigente()) setSesionesError(loadErrorText(e)); });
  }, [patientId]);

  // Casos y sesiones, una vez que el servidor ha dejado ver al paciente (con
  // un 403 no se piden). Guardar los datos no los vuelve a pedir.
  const cargadoId = patient?.id ?? null;
  useEffect(() => {
    if (cargadoId !== patientId) return;
    recargarCasos();
    recargarSesiones();
  }, [cargadoId, patientId, recargarCasos, recargarSesiones]);

  // Tras guardar los datos o crear un caso: se vuelven a pedir sin el
  // «Cargando…» de la ficha entera. Si fallan, queda lo que había.
  const refrescar = useCallback(() => {
    api.getPatient(patientId).then(setPatient).catch(() => {});
    resumenDe(patientId).then((s) => { if (s) setSummary(s); });
  }, [patientId]);

  // Sin la fila no se sabe quién lo creó y la ficha queda de solo lectura;
  // «Reintentar» del aviso vuelve a pedirla.
  const reintentarPermisos = useCallback(() => {
    resumenDe(patientId).then(setSummary);
  }, [patientId]);

  // Elegir en una columna vacía las de su derecha; elegir lo mismo no toca nada.
  const elegirCaso = (s: SeleccionCaso | null) => {
    if (s === casoSel) return;
    setCasoSel(s);
    setEstudio(null);
    setSesionSel(null);
  };
  const elegirEstudio = (e: EstudioElegido | null) => {
    const id = (x: EstudioElegido | null) => (x && x !== "sin-estudio" ? x.id : x);
    if (id(e) === id(estudio)) return;
    setEstudio(e);
    setSesionSel(null);
  };
  const elegirSeccion = (s: SeccionFicha | null) => {
    if (s === seccion) return;
    setSeccion(s);
    elegirCaso(null);
  };

  const volverALista = () => navigate(SCREEN_PATH.patients);
  const nombre = (patient ? nombrePaciente(patient) : "") || summary?.full_name || "";
  // Las etiquetas que pone el servidor empiezan por el nombre de la lista.
  const nombreEtiquetas = summary?.full_name || nombre;
  const crumbs = [
    { label: "Pacientes", onClick: volverALista },
    { label: patient ? nombre || "Ficha de paciente" : "Paciente" },
  ];
  const { creadorOAdmin, puedeEditar } = derechosPaciente(user, summary);

  // Lo que cada columna enseña, a partir de lo elegido.
  const idsCasos = new Set((casos ?? []).map((c) => c.id));
  // Las de un caso eliminado (el servidor las conserva desvinculadas) o sin caso.
  const sesionesSinCaso = casos ? sesiones.filter((s) => s.case_id == null || !idsCasos.has(s.case_id)) : [];
  const caso = typeof casoSel === "number" ? (casos ?? []).find((c) => c.id === casoSel) ?? null : null;
  const tarjeta = estudio && estudio !== "sin-estudio" ? estudio : null;
  let sesionesCol: PatientSessionInfo[] | null = null;
  let vacioCol = "";
  if (casoSel === "sin-caso") {
    sesionesCol = sesionesSinCaso;
    vacioCol = "No quedan sesiones guardadas sin caso.";
  } else if (caso && estudio === "sin-estudio") {
    sesionesCol = sesiones.filter((s) => s.case_id === caso.id && s.imaging_study_id == null);
    vacioCol = "No quedan sesiones de este caso sin estudio archivado.";
  } else if (caso && tarjeta) {
    sesionesCol = sesiones.filter((s) => s.imaging_study_id === tarjeta.id);
    vacioCol = "Este estudio aún no tiene sesiones guardadas.";
  }
  const sesion = sesionesCol?.find((s) => s.session_id === sesionSel) ?? null;

  // Cada columna con lo que hace su miga en pantalla estrecha: cerrarla a ella
  // y a las de su derecha.
  const entradas: { col: ColumnaCascada; cerrar: () => void }[] = [];
  if (patient) {
    entradas.push({
      col: {
        key: "datos",
        titulo: "Paciente",
        contenido: (
          <ColumnaDatos
            patient={patient}
            summary={summary}
            casosCargados={casos?.length}
            puedeEditar={puedeEditar}
            seccion={seccion}
            onSeccion={elegirSeccion}
            onEditar={() => setFormOpen(true)}
            onNuevoCaso={() => setCasoOpen(true)}
            onEliminado={volverALista}
            onOpenOrders={onOpenOrders && summary ? () => onOpenOrders(summary) : undefined}
            onReintentarPermisos={reintentarPermisos}
          />
        ),
      },
      cerrar: () => {},
    });
  }
  if (patient && seccion === "capturas") {
    // Las capturas son de todo el paciente: una sola columna ancha (la última
    // sin ancho fijo ocupa lo que sobra).
    entradas.push({
      col: { key: "capturas", titulo: "Capturas", contenido: <CaptureGallery patientId={patient.id} /> },
      cerrar: () => elegirSeccion(null),
    });
  }
  if (patient && seccion === "casos") {
    entradas.push({
      col: {
        key: "casos",
        titulo: "Casos",
        ancho: 380,
        contenido: (
          <ColumnaCasos
            patientId={patient.id}
            patientName={nombre || undefined}
            casos={casos}
            sesiones={sesiones}
            onResume={summary ? (sid) => onResume(sid, summary) : undefined}
            error={casosError}
            onReintentar={recargarCasos}
            seleccionado={casoSel}
            onSeleccionar={elegirCaso}
            puedePlanificar={!!summary}
            puedeEliminar={creadorOAdmin}
            nSesionesSinCaso={sesionesSinCaso.length}
            sesionesError={sesionesError}
            onReintentarSesiones={recargarSesiones}
            onPlanificar={(st) => { if (summary) onPlanCase(st, summary); }}
            onCambio={(eliminado) => {
              recargarCasos();
              resumenDe(patientId).then((s) => { if (s) setSummary(s); });
              if (eliminado != null) {
                // Sus sesiones se conservan desvinculadas: pasan a «sin caso».
                recargarSesiones();
                if (eliminado === casoSel) elegirCaso(null);
              }
            }}
          />
        ),
      },
      cerrar: () => elegirSeccion(null),
    });
    if (casoSel === null && casos && casos.length > 0 && COLUMNAS_VISIBLES[tramo] >= 3) {
      // Sin caso elegido: la última sesión del más reciente, para no dejar el
      // hueco de la derecha vacío. Solo con sitio para tres columnas: con dos
      // (≤ 1280 px) empujaría a Datos a una miga y Datos y Casos deben verse juntas.
      const foco = casoEnFoco(casos, null);
      const ultima = foco ? ultimaSesionDelCaso(sesiones, foco.id) : null;
      entradas.push({
        col: {
          key: "vista-caso",
          titulo: "Vista previa",
          contenido: ultima ? (
            <VistaPrevia
              sesion={ultima}
              estudio={null}
              estudioId={ultima.imaging_study_id}
              nombrePaciente={nombreEtiquetas}
              onResume={summary ? (sid) => onResume(sid, summary) : undefined}
            />
          ) : (
            <EstadoVacio icono="STUDIES" titulo="Sin sesiones guardadas">
              Elige un caso para ver sus estudios de imagen y sus sesiones guardadas.
            </EstadoVacio>
          ),
        },
        cerrar: () => {},
      });
    }
    if (caso) {
      entradas.push({
        col: {
          key: `estudios-${caso.id}`,
          titulo: "Estudios de imagen",
          contenido: (
            <ColumnaEstudios
              caso={caso}
              sesiones={sesiones}
              sesionesError={sesionesError}
              onReintentarSesiones={recargarSesiones}
              seleccionado={tarjeta ? tarjeta.id : estudio === "sin-estudio" ? "sin-estudio" : null}
              onSeleccionar={elegirEstudio}
              onOpenStudy={onOpenStudy}
              onResume={summary ? (sid) => onResume(sid, summary) : undefined}
              puedeBorrar={creadorOAdmin}
              onEstudioBorrado={(id) => {
                // Sus sesiones se quedan sin estudio archivado.
                recargarSesiones();
                if (tarjeta?.id === id) elegirEstudio(null);
              }}
            />
          ),
        },
        cerrar: () => elegirCaso(null),
      });
    }
    if (sesionesCol) {
      entradas.push({
        col: {
          key: `sesiones-${casoSel}-${tarjeta ? tarjeta.id : "sin-estudio"}`,
          titulo: `Sesiones guardadas · ${sesionesCol.length}`,
          contenido: (
            <ColumnaSesiones
              sesiones={sesionesCol}
              error={sesionesError}
              onReintentar={recargarSesiones}
              nombrePaciente={nombreEtiquetas}
              vacio={vacioCol}
              seleccionada={sesionSel}
              onSeleccionar={setSesionSel}
              puedeGestionar={creadorOAdmin}
              onRenombrada={(sid, label) =>
                setSesiones((ss) => ss.map((x) => (x.session_id === sid ? { ...x, label } : x)))}
              onBorrada={(sid) => {
                if (sid === sesionSel) setSesionSel(null);
                recargarSesiones();
              }}
            />
          ),
        },
        cerrar: casoSel === "sin-caso" ? () => elegirCaso(null) : () => elegirEstudio(null),
      });
    }
    if (sesion) {
      entradas.push({
        col: {
          key: `vista-${sesion.session_id}`,
          titulo: "Vista previa",
          contenido: (
            <VistaPrevia
              sesion={sesion}
              estudio={tarjeta}
              nombrePaciente={nombreEtiquetas}
              onResume={summary ? (sid) => onResume(sid, summary) : undefined}
            />
          ),
        },
        cerrar: () => setSesionSel(null),
      });
    }
  }
  const columnas = entradas.map((e) => e.col);
  // La miga i deja abiertas las columnas 0…i.
  const volver = (i: number) => entradas[i + 1]?.cerrar();

  return (
    <AppShell crumbs={crumbs}>
      <PageBody modo={tramo === "movil" ? "lista" : "pantalla"} lienzo={tramo === "grande"}>
        {loading ? (
          <LoadState state="cargando" />
        ) : denied ? (
          <div role="alert" style={{ display: "grid", gap: 12, justifyItems: "start" }}>
            <h2 style={{ margin: 0, fontSize: 18 }}>Paciente no autorizado</h2>
            <p style={{ margin: 0, color: "var(--muted-foreground)", fontSize: 13 }}>{denied}</p>
            <Button type="button" variant="outline" onClick={volverALista}>Volver a Pacientes</Button>
          </div>
        ) : notFound ? (
          <div role="alert" style={{ display: "grid", gap: 12, justifyItems: "start" }}>
            <h2 style={{ margin: 0, fontSize: 18 }}>Paciente no encontrado</h2>
            <p style={{ margin: 0, color: "var(--muted-foreground)", fontSize: 13 }}>
              Este paciente no existe o se ha eliminado. Puede que el enlace sea antiguo.
            </p>
            <Button type="button" variant="outline" onClick={volverALista}>Volver a Pacientes</Button>
          </div>
        ) : loadError ? (
          <div style={{ display: "grid", gap: 12, justifyItems: "start" }}>
            <LoadState state="error" mensaje={loadError} onRetry={() => setAttempt((a) => a + 1)} />
            <Button type="button" variant="outline" onClick={volverALista}>Volver a Pacientes</Button>
          </div>
        ) : (
          <div data-testid="ficha-cascada" style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
            <Cascada columnas={columnas} onVolver={volver} />
          </div>
        )}
      </PageBody>
      {patient && (
        <>
          <PatientFormSheet
            open={formOpen}
            patient={patient}
            soloLectura={!puedeEditar}
            onClose={() => setFormOpen(false)}
            onSaved={refrescar}
          />
          <NuevoEstudioSheet
            open={casoOpen}
            patientId={patient.id}
            patientName={nombre || undefined}
            onClose={() => setCasoOpen(false)}
            onCreated={() => { refrescar(); recargarCasos(); }}
          />
        </>
      )}
    </AppShell>
  );
}
