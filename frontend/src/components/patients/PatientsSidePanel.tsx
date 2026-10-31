/* Panel lateral de Pacientes (spec §4.3): tres bloques a la derecha de las
   tarjetas. «Hoy» resume lo que ya está cargado, «Actividad reciente» pide las
   últimas acciones de los pacientes visibles y «Accesos» lleva a las demás
   pantallas sin pasar por la barra lateral. */

import { useCallback, useEffect, useId, useState } from "react";
import { api } from "../../api/client";
import type { PatientActivity, PatientSummary } from "../../api/types";
import { fechaHora } from "../../lib/fecha";
import { etiquetaAccion } from "../../lib/auditoria";
import { resumenHoy, tiempoRelativo } from "../../lib/pacientes";
import { useAuth } from "../../store/auth";
import { useNav } from "../../store/nav";
import { Button } from "../Button";
import { Icon, type IconName } from "../Icon";
import { SectionLabel } from "../PanelHead";
import "./patients.css";

interface Props {
  patients: PatientSummary[];
  loading: boolean;
  onOpenPatient: (id: number) => void;
  onNewPatient: () => void;
}

/** Cuántas entradas muestra «Actividad reciente». */
const LIMITE_ACTIVIDAD = 8;

type EstadoActividad =
  | { fase: "cargando" }
  | { fase: "error" }
  | { fase: "lista"; items: PatientActivity[] };

export function PatientsSidePanel({ patients, loading, onOpenPatient, onNewPatient }: Props) {
  const { user } = useAuth();
  const { go } = useNav();
  const esAdmin = user?.role === "admin";
  const idHoy = useId();
  const idActividad = useId();
  const idAccesos = useId();

  const [actividad, setActividad] = useState<EstadoActividad>({ fase: "cargando" });
  // null = sin dato (aún no llega o falló): se pinta «—», sin texto de error,
  // porque la cifra es un atajo y no la única vía a las cuentas pendientes.
  const [pendientes, setPendientes] = useState<number | null>(null);

  const pedirActividad = useCallback(() => {
    setActividad({ fase: "cargando" });
    let vigente = true;
    api.patientsActivity(LIMITE_ACTIVIDAD).then(
      (items) => { if (vigente) setActividad({ fase: "lista", items }); },
      () => { if (vigente) setActividad({ fase: "error" }); },
    );
    return () => { vigente = false; };
  }, []);

  // Al montar: el panel no depende de la lista de tarjetas, así que sus cifras
  // siguen aunque la actividad falle.
  useEffect(() => pedirActividad(), [pedirActividad]);

  // Solo el administrador puede listar cuentas: pedirlas a otro rol daría 403.
  useEffect(() => {
    if (!esAdmin) return;
    let vigente = true;
    api.listUsers("pending").then(
      (us) => { if (vigente) setPendientes(us.length); },
      () => { /* sin error visible: la cifra se queda en «—» */ },
    );
    return () => { vigente = false; };
  }, [esAdmin]);

  const r = resumenHoy(patients);
  const cifra = (n: number) => (loading ? "—" : String(n));

  const acceso = (icono: IconName, texto: string, alPulsar: () => void) => (
    <Button variant="ghost" size="sm" className="pt-side-link" leadingIcon={<Icon name={icono} size={14} />} onClick={alPulsar}>
      {texto}
    </Button>
  );

  return (
    <aside className="pt-side" aria-label="Resumen y accesos">
      <section className="pt-side-block" aria-labelledby={idHoy}>
        <SectionLabel>
          <span id={idHoy}>Hoy</span>
        </SectionLabel>
        <dl className="pt-side-stats">
          <Fila rotulo="Pacientes" valor={cifra(r.pacientes)} />
          <Fila rotulo="En curso" valor={cifra(r.enCurso)} />
          <Fila rotulo="Con informe" valor={cifra(r.conInforme)} />
          <Fila rotulo="Sesiones esta semana" valor={cifra(r.semana)} />
          {r.compartidos > 0 && !loading && <Fila rotulo="Compartidos contigo" valor={String(r.compartidos)} />}
        </dl>
        {esAdmin && (
          <button
            type="button"
            className={`pt-side-pending${pendientes !== null && pendientes > 0 ? " pt-side-alert" : ""}`}
            onClick={() => go("pending")}
          >
            <span>Cuentas pendientes</span>
            <span className="pt-side-value">{pendientes === null ? "—" : pendientes}</span>
          </button>
        )}
      </section>

      <section className="pt-side-block" aria-labelledby={idActividad}>
        <SectionLabel>
          <span id={idActividad}>Actividad reciente</span>
        </SectionLabel>
        {actividad.fase === "cargando" && <p className="pt-side-note">Cargando…</p>}
        {actividad.fase === "error" && (
          <div className="pt-side-error">
            <p className="pt-side-note">No se pudo cargar la actividad</p>
            <Button variant="outline" size="sm" onClick={pedirActividad}>Reintentar</Button>
          </div>
        )}
        {actividad.fase === "lista" && actividad.items.length === 0 && (
          <p className="pt-side-note">Aún no hay actividad en tus pacientes.</p>
        )}
        {actividad.fase === "lista" && actividad.items.length > 0 && (
          <ul className="pt-side-list">
            {actividad.items.map((a, i) => (
              <li key={`${a.patient_id}-${a.at}-${i}`}>
                <button type="button" className="pt-side-activity" onClick={() => onOpenPatient(a.patient_id)}>
                  <span className="pt-side-activity-text">{a.patient_name} · {etiquetaAccion(a.action)}</span>
                  <time className="pt-side-activity-time" dateTime={a.at} title={fechaHora(a.at)}>{tiempoRelativo(a.at)}</time>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="pt-side-block" aria-labelledby={idAccesos}>
        <SectionLabel>
          <span id={idAccesos}>Accesos</span>
        </SectionLabel>
        <div className="pt-side-links">
          {acceso("PLUS", "Nuevo paciente", onNewPatient)}
          {acceso("STUDIES", "Estudios", () => go("studies"))}
          {acceso("ORDER", "Pedidos de clips", () => go("orders"))}
          {esAdmin && acceso("USERS", "Usuarios", () => go("users"))}
          {esAdmin && acceso("AUDIT", "Auditoría", () => go("audit"))}
        </div>
      </section>
    </aside>
  );
}

/** Rótulo y cifra en el mismo contenedor, para leerse juntos. */
function Fila({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="pt-side-stat">
      <dt>{rotulo}</dt>
      <dd className="pt-side-value">{valor}</dd>
    </div>
  );
}
