/* Columna Datos — la primera de la ficha en cascada (L3).

   Quién es el paciente (nombre, HC, sexo y edad, institución y antecedentes
   resumidos), «Editar datos» y «Nuevo caso», con quién está compartido, las
   entradas que abren la columna de la derecha (Casos, Capturas) o los pedidos,
   y al pie «Eliminar paciente». Los datos completos se editan en la hoja
   PatientFormSheet, que abre quien monta la columna. */

import { useCallback, useEffect, useState } from "react";
import { api } from "../../api/client";
import type { PatientDetail, PatientShareOut, PatientSummary, UserInfo } from "../../api/types";
import { ROLE_LABEL } from "../../lib/roles";
import { useAuth } from "../../store/auth";
import { Button } from "../Button";
import { ConfirmDialog } from "../ConfirmDialog";
import { Icon } from "../Icon";
import { LoadState, loadErrorText } from "../LoadState";
import { ErrorNote, SectionLabel } from "../PanelHead";
import { ShareSheet } from "../ShareSheet";
import { ageFromDob } from "../patientAge";
import "./ficha.css";

/** Lo que se abre a la derecha de la columna Datos. */
export type SeccionFicha = "casos" | "capturas";

/** Derechos sobre el paciente (spec §6.1, T7-rights). Compartir y eliminar es
 *  de quien lo creó o de un administrador; quien lo tiene compartido trabaja
 *  en sus casos pero no cambia sus datos. Sin la fila de la lista no se sabe
 *  quién lo creó: falla cerrado (solo lectura, sin compartir ni eliminar) hasta
 *  comprobarlo; antes dejaba editar a una cuenta compartida si la lista fallaba. */
export function derechosPaciente(user: UserInfo | null, summary: PatientSummary | null) {
  const creadorOAdmin = !!user && !!summary && (user.role === "admin" || summary.owner_id === user.id);
  return { creadorOAdmin, puedeEditar: creadorOAdmin };
}

/** «Segura, Juan», como lo escribe la lista; "" sin apellidos ni nombre. */
export const nombrePaciente = (p: { surname?: string; given_name?: string }) =>
  [p.surname, p.given_name].filter(Boolean).join(", ");

const ANTECEDENTES: [keyof PatientDetail, string][] = [
  ["antecedentes_patologicos", "Patológicos"],
  ["antecedentes_toxicologicos", "Toxicológicos"],
  ["antecedentes_quirurgicos", "Quirúrgicos"],
  ["antecedentes_alergicos", "Alérgicos"],
  ["antecedentes_farmacologicos", "Farmacológicos"],
];

function lineaSexoEdad(p: PatientDetail): string {
  const edad = ageFromDob(p.dob);
  return [p.sex ?? "", edad ? `${edad} ${edad === "1" ? "año" : "años"}` : ""].filter(Boolean).join(" · ");
}

function antecedentesResumidos(p: PatientDetail): string {
  return ANTECEDENTES
    .map(([k, rotulo]) => [rotulo, String(p[k] ?? "").trim()] as const)
    .filter(([, v]) => v)
    .map(([rotulo, v]) => `${rotulo}: ${v}`)
    .join(" · ");
}

export function ColumnaDatos({
  patient,
  summary,
  casosCargados,
  puedeEditar,
  seccion,
  onSeccion,
  onEditar,
  onNuevoCaso,
  onEliminado,
  onOpenOrders,
  onReintentarPermisos,
}: {
  patient: PatientDetail;
  /** La fila de la lista: trae quién lo creó y cuántos casos tiene. null = no
   *  se pudo comprobar (la lista falló o no lo trae): solo lectura con aviso. */
  summary: PatientSummary | null;
  /** Los casos ya cargados de la ficha: respaldo del contador cuando no hay fila de la lista. */
  casosCargados?: number | null;
  /** Si la cuenta cambia los datos del paciente («Editar datos») o solo los consulta («Ver datos»). */
  puedeEditar: boolean;
  /** La sección abierta a la derecha; null = ninguna (las migas la cerraron). */
  seccion: SeccionFicha | null;
  onSeccion: (s: SeccionFicha) => void;
  /** Abre la hoja de los datos (editable o de solo lectura según `puedeEditar`). */
  onEditar: () => void;
  onNuevoCaso: () => void;
  /** El paciente se acaba de eliminar desde el pie de la columna. */
  onEliminado: () => void;
  /** Abre el registro de pedidos de clip filtrado por este paciente. */
  onOpenOrders?: () => void;
  /** Vuelve a pedir la fila de la lista para comprobar los derechos. */
  onReintentarPermisos?: () => void;
}) {
  const { user } = useAuth();
  const { creadorOAdmin } = derechosPaciente(user, summary);
  const puedeEliminar = !!summary && creadorOAdmin;

  const [shares, setShares] = useState<PatientShareOut[]>([]);
  const [sharesError, setSharesError] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  // null mientras no se sabe (o si falla): la entrada sale sin contador.
  const [nCapturas, setNCapturas] = useState<number | null>(null);
  const [askDelete, setAskDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Aparte de la carga de la ficha: si falla, la columna sigue siendo útil y
  // la sección lo dice con su «Reintentar».
  const loadShares = useCallback(() => {
    setSharesError(null);
    Promise.resolve()
      .then(() => api.patientShares(patient.id))
      .then(setShares)
      .catch((e) => setSharesError(loadErrorText(e)));
  }, [patient.id]);
  useEffect(loadShares, [loadShares]);

  useEffect(() => { setNCapturas(null); }, [patient.id]);
  // Se cuentan al abrir la ficha y cada vez que se abre o se cierra Capturas:
  // un borrado dentro de la galería se refleja al volver.
  useEffect(() => {
    let vigente = true;
    Promise.resolve()
      .then(() => api.listCaptures({ patientId: patient.id }))
      .then((rows) => { if (vigente) setNCapturas(rows.length); })
      .catch(() => { /* sin cifra: la entrada sigue abriendo la galería */ });
    return () => { vigente = false; };
  }, [patient.id, seccion]);

  const nombre = nombrePaciente(patient) || summary?.full_name || "Paciente sin nombre";
  const sexoEdad = lineaSexoEdad(patient);
  const antecedentes = antecedentesResumidos(patient);
  const nCasos = summary?.study_count ?? casosCargados;

  return (
    <div className="fc-datos">
      <div className="fc-datos-quien">
        <h2 className="fc-datos-nombre">{nombre}</h2>
        {patient.hospital_id && <div className="fc-datos-hc">{patient.hospital_id}</div>}
        {sexoEdad && <div className="fc-datos-linea">{sexoEdad}</div>}
        {patient.institution && <div className="fc-datos-linea">{patient.institution}</div>}
        <div className="fc-datos-antecedentes">
          {antecedentes || "Sin antecedentes anotados."}
        </div>
      </div>

      {!summary && (
        <div role="status" className="fc-datos-aviso">
          <span>No se pudieron comprobar tus permisos sobre este paciente; los datos se muestran de solo lectura.</span>
          {onReintentarPermisos && (
            <Button type="button" size="sm" variant="outline" onClick={onReintentarPermisos}>Reintentar</Button>
          )}
        </div>
      )}

      <div className="fc-datos-acciones">
        <Button size="sm" variant="outline" leadingIcon={<Icon name={puedeEditar ? "EDIT" : "USER"} />} onClick={onEditar}>
          {puedeEditar ? "Editar datos" : "Ver datos"}
        </Button>
        <Button size="sm" leadingIcon={<Icon name="PLUS" />} onClick={onNuevoCaso}>
          Nuevo caso
        </Button>
      </div>

      <nav className="fc-datos-entradas" aria-label="Secciones del paciente">
        <button type="button" className="fc-entrada" aria-pressed={seccion === "casos"} onClick={() => onSeccion("casos")}>
          <span>{nCasos == null ? "Casos" : `Casos · ${nCasos}`}</span>
          <Icon name="CHEVRON_RIGHT" size={14} />
        </button>
        <button type="button" className="fc-entrada" aria-pressed={seccion === "capturas"} onClick={() => onSeccion("capturas")}>
          <span>{nCapturas == null ? "Capturas" : `Capturas · ${nCapturas}`}</span>
          <Icon name="CHEVRON_RIGHT" size={14} />
        </button>
        {onOpenOrders && (
          <button type="button" className="fc-entrada" onClick={onOpenOrders}>
            <span>Pedidos de clip</span>
            <Icon name="ARROW_UP_RIGHT" size={14} />
          </button>
        )}
      </nav>

      <section>
        <div className="fc-datos-cabeza">
          <SectionLabel style={{ flex: 1, marginBottom: 0 }}>Compartido con</SectionLabel>
          {creadorOAdmin && (
            <Button size="sm" variant="ghost" leadingIcon={<Icon name="SHARE" />} onClick={() => setShareOpen(true)}>
              Compartir con…
            </Button>
          )}
        </div>
        {sharesError ? (
          <LoadState state="error" mensaje={sharesError} onRetry={loadShares} />
        ) : shares.length === 0 ? (
          <div className="fc-datos-nota">No está compartido con ninguna cuenta.</div>
        ) : (
          <ul className="fc-datos-compartido">
            {shares.map((s) => (
              <li key={s.user_id}>{`${s.full_name || s.username} · ${ROLE_LABEL[s.role] ?? s.role}`}</li>
            ))}
          </ul>
        )}
        {summary?.is_shared_with_me && (
          <div className="fc-datos-nota" style={{ marginTop: 6 }}>
            Te lo han compartido: puedes trabajar con él y crear o editar casos, pero no cambiar sus datos, borrar casos ni compartirlo con otras cuentas.
          </div>
        )}
      </section>

      {puedeEliminar && (
        <div className="fc-datos-pie">
          <Button type="button" size="sm" variant="ghost" leadingIcon={<Icon name="DELETE" />}
                  style={{ color: "var(--destructive)" }}
                  onClick={() => { setDeleteError(null); setAskDelete(true); }}>
            Eliminar paciente
          </Button>
          <ErrorNote>{deleteError}</ErrorNote>
        </div>
      )}

      <ShareSheet
        open={shareOpen}
        patientId={patient.id}
        patientName={nombre}
        current={shares}
        ownerId={summary?.owner_id ?? null}
        onClose={() => setShareOpen(false)}
        onSaved={setShares}
      />
      {askDelete && summary && (
        <DeleteConfirm
          patient={summary}
          onCancel={() => setAskDelete(false)}
          onConfirm={async () => {
            try {
              await api.deletePatient(summary.id);
              setAskDelete(false);
              onEliminado();
            } catch (e) {
              setDeleteError(e instanceof Error ? e.message : "Error al eliminar el paciente");
              setAskDelete(false);
            }
          }}
        />
      )}
    </div>
  );
}

/** «Eliminar paciente» con lo que se lleva por delante. */
export function DeleteConfirm({
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
