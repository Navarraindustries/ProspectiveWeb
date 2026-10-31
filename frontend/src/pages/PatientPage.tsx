/* La ficha de un paciente con URL propia (/app/pacientes/:id).

   Antes la ficha era una hoja encima de la lista, sin dirección: recargar o
   volver con Atrás desde el pipeline la perdía. Ahora es una pantalla con su
   miga «Pacientes › nombre». Este es el esqueleto —carga, 403 y error—; la
   cascada de columnas (paciente, casos, estudios, sesiones) se monta dentro. */

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "../api/client";
import type { PatientDetail, PatientSummary, StudyCard, StudySummary } from "../api/types";
import { Button } from "../components/Button";
import { LoadState, loadErrorText } from "../components/LoadState";
import { AppShell } from "../components/shell/AppShell";
import { SCREEN_PATH } from "../store/nav";

export interface PatientPageProps {
  patientId: number;
  onResume: (sessionId: string, p: PatientSummary) => void;
  onPlanCase: (st: StudySummary, p: PatientSummary) => void;
  onOpenStudy?: (img: StudyCard) => void;
  onOpenOrders?: (p: PatientSummary) => void;
}

/** «Segura, Juan», como lo escribe la lista; "" sin apellidos ni nombre. */
const nombreDe = (p: PatientDetail) => [p.surname, p.given_name].filter(Boolean).join(", ");

export function PatientPage({ patientId }: PatientPageProps) {
  const navigate = useNavigate();
  const [patient, setPatient] = useState<PatientDetail | null>(null);
  const [loading, setLoading] = useState(true);
  // El detalle del 403 cuando el paciente es de otro profesional.
  const [denied, setDenied] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    // Una respuesta que llega tarde de otro paciente no debe pintarse.
    let vigente = true;
    setLoading(true);
    setPatient(null);
    setDenied(null);
    setLoadError(null);
    api
      .getPatient(patientId)
      .then((p) => { if (vigente) setPatient(p); })
      .catch((e) => {
        if (!vigente) return;
        if (e instanceof ApiError && e.status === 403) setDenied(e.message);
        else setLoadError(loadErrorText(e));
      })
      .finally(() => { if (vigente) setLoading(false); });
    return () => { vigente = false; };
  }, [patientId, attempt]);

  const volver = () => navigate(SCREEN_PATH.patients);
  const crumbs = [
    { label: "Pacientes", onClick: volver },
    { label: patient ? nombreDe(patient) || "Ficha de paciente" : "Paciente" },
  ];

  return (
    <AppShell crumbs={crumbs}>
      <div style={{ padding: 24 }}>
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
          <div data-testid="ficha-cascada" />
        )}
      </div>
    </AppShell>
  );
}
