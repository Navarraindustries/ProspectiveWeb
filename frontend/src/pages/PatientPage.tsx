/* La ficha de un paciente con URL propia (/app/pacientes/:id).

   Antes la ficha era una hoja encima de la lista, sin dirección: recargar o
   volver con Atrás desde el pipeline la perdía. Ahora es una pantalla con su
   miga «Pacientes › nombre» y una cascada de columnas de cristal: la primera
   es la columna Datos; las de casos, estudios, sesiones y capturas se abren a
   su derecha. */

import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "../api/client";
import type { PatientDetail, PatientSummary, StudyCard, StudySummary } from "../api/types";
import { Button } from "../components/Button";
import { LoadState, loadErrorText } from "../components/LoadState";
import { PatientFormSheet } from "../components/PatientFormSheet";
import { Cascada, type ColumnaCascada } from "../components/ficha/Cascada";
import { ColumnaDatos, derechosPaciente, nombrePaciente, type SeccionFicha } from "../components/ficha/ColumnaDatos";
import { AppShell } from "../components/shell/AppShell";
import { useAuth } from "../store/auth";
import { SCREEN_PATH } from "../store/nav";
import { NuevoEstudioSheet } from "./NuevoCaso";

export interface PatientPageProps {
  patientId: number;
  onResume: (sessionId: string, p: PatientSummary) => void;
  onPlanCase: (st: StudySummary, p: PatientSummary) => void;
  onOpenStudy?: (img: StudyCard) => void;
  onOpenOrders?: (p: PatientSummary) => void;
}

/** La fila de la lista de este paciente: trae quién lo creó (derechos) y
 *  cuántos casos tiene, que el detalle no trae. Si la lista falla, null: la
 *  ficha se abre igual y el servidor decide lo que se puede hacer. */
const resumenDe = (patientId: number) =>
  Promise.resolve()
    .then(() => api.listPatients())
    .then((filas) => filas.find((x) => x.id === patientId) ?? null)
    .catch(() => null);

export function PatientPage({ patientId, onOpenOrders }: PatientPageProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [patient, setPatient] = useState<PatientDetail | null>(null);
  const [summary, setSummary] = useState<PatientSummary | null>(null);
  const [loading, setLoading] = useState(true);
  // El detalle del 403 cuando el paciente es de otro profesional.
  const [denied, setDenied] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [seccion, setSeccion] = useState<SeccionFicha>("casos");
  const [formOpen, setFormOpen] = useState(false);
  const [casoOpen, setCasoOpen] = useState(false);

  useEffect(() => {
    // Una respuesta que llega tarde de otro paciente no debe pintarse.
    let vigente = true;
    setLoading(true);
    setPatient(null);
    setSummary(null);
    setDenied(null);
    setLoadError(null);
    setSeccion("casos");
    Promise.all([api.getPatient(patientId), resumenDe(patientId)])
      .then(([p, s]) => { if (vigente) { setPatient(p); setSummary(s); } })
      .catch((e) => {
        if (!vigente) return;
        if (e instanceof ApiError && e.status === 403) setDenied(e.message);
        else setLoadError(loadErrorText(e));
      })
      .finally(() => { if (vigente) setLoading(false); });
    return () => { vigente = false; };
  }, [patientId, attempt]);

  // Tras guardar los datos o crear un caso: se vuelven a pedir sin el
  // «Cargando…» de la ficha entera. Si fallan, queda lo que había.
  const refrescar = useCallback(() => {
    api.getPatient(patientId).then(setPatient).catch(() => {});
    resumenDe(patientId).then((s) => { if (s) setSummary(s); });
  }, [patientId]);

  const volver = () => navigate(SCREEN_PATH.patients);
  const nombre = (patient ? nombrePaciente(patient) : "") || summary?.full_name || "";
  const crumbs = [
    { label: "Pacientes", onClick: volver },
    { label: patient ? nombre || "Ficha de paciente" : "Paciente" },
  ];
  const { puedeEditar } = derechosPaciente(user, summary);

  const columnas: ColumnaCascada[] = patient
    ? [{
        key: "datos",
        titulo: "Paciente",
        contenido: (
          <ColumnaDatos
            patient={patient}
            summary={summary}
            puedeEditar={puedeEditar}
            seccion={seccion}
            onSeccion={setSeccion}
            onEditar={() => setFormOpen(true)}
            onNuevoCaso={() => setCasoOpen(true)}
            onEliminado={volver}
            onOpenOrders={onOpenOrders && summary ? () => onOpenOrders(summary) : undefined}
          />
        ),
      }]
    : [];

  return (
    <AppShell crumbs={crumbs}>
      <div style={{ padding: 24, display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
        {loading ? (
          <LoadState state="cargando" />
        ) : denied ? (
          <div role="alert" style={{ display: "grid", gap: 12, justifyItems: "start" }}>
            <h2 style={{ margin: 0, fontSize: 18 }}>Paciente no autorizado</h2>
            <p style={{ margin: 0, color: "var(--muted-foreground)", fontSize: 13 }}>{denied}</p>
            <Button type="button" variant="outline" onClick={volver}>Volver a Pacientes</Button>
          </div>
        ) : loadError ? (
          <div style={{ display: "grid", gap: 12, justifyItems: "start" }}>
            <LoadState state="error" mensaje={loadError} onRetry={() => setAttempt((a) => a + 1)} />
            <Button type="button" variant="outline" onClick={volver}>Volver a Pacientes</Button>
          </div>
        ) : (
          <div data-testid="ficha-cascada" style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
            <Cascada columnas={columnas} onVolver={() => {}} />
          </div>
        )}
      </div>
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
            onCreated={refrescar}
          />
        </>
      )}
    </AppShell>
  );
}
