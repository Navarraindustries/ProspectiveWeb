/* Columna Casos — la segunda de la ficha en cascada (L3).

   Arriba, lo que se viene a hacer: «Planificar este caso» y «Subir DICOM de
   este paciente», sobre el caso elegido o, si no se ha elegido ninguno, el más
   reciente (F2-29, F2-72). Después cada caso con su diagnóstico, fecha, tipo,
   región, lateralidad e imágenes, y sus botones «Editar caso» y «Eliminar
   caso». Elegir un caso abre a la derecha sus estudios de imagen. Al final, si
   hay sesiones guardadas que no cuelgan de ningún caso (p. ej. las de un caso
   eliminado, que el servidor conserva desvinculadas), su propia entrada: la
   ficha antigua las listaba todas y aquí no deben perderse. */

import { useState } from "react";
import { api } from "../../api/client";
import type { PatientSessionInfo, StudySummary } from "../../api/types";
import { fechaDia } from "../../lib/fecha";
import { modalidadesDe } from "../../lib/modalidades";
import { NuevoEstudioSheet } from "../../pages/NuevoCaso";
import { STEP_LABELS, clampStep } from "../../pipeline/steps";
import { Badge, riskVariant } from "../Badge";
import { Button } from "../Button";
import { ConfirmDialog } from "../ConfirmDialog";
import { Icon } from "../Icon";
import { LoadState } from "../LoadState";
import { ErrorNote } from "../PanelHead";
import { BotonReanudar, MiniaturaEstudio } from "./ColumnaEstudios";
import "./ficha.css";

/** F2-T5: un caso sin diagnóstico se llamaba «Estudio», que es otra cosa. */
export const CASO_SIN_DX = "Caso sin diagnóstico";
export const nombreCaso = (st: StudySummary) => st.dx_principal || CASO_SIN_DX;

/** Lo elegido en la columna: un caso por su id, o las sesiones sin caso. */
export type SeleccionCaso = number | "sin-caso";

/** El caso elegido o, sin elegir, el más reciente (id más alto). */
export function casoEnFoco(casos: readonly StudySummary[], sel: SeleccionCaso | null): StudySummary | null {
  const recientes = [...casos].sort((a, b) => b.id - a.id);
  return recientes.find((c) => c.id === sel) ?? recientes[0] ?? null;
}

/** La sesión guardada más reciente (updated_at) de un caso, o null. */
export function ultimaSesionDelCaso(sesiones: readonly PatientSessionInfo[], casoId: number): PatientSessionInfo | null {
  let mejor: PatientSessionInfo | null = null;
  for (const s of sesiones) {
    if (s.case_id !== casoId) continue;
    if (!mejor || s.updated_at > mejor.updated_at) mejor = s;
  }
  return mejor;
}

export function ColumnaCasos({
  patientId,
  patientName,
  casos,
  sesiones,
  onResume,
  error,
  onReintentar,
  seleccionado,
  onSeleccionar,
  puedePlanificar,
  puedeEliminar,
  nSesionesSinCaso,
  sesionesError,
  onReintentarSesiones,
  onPlanificar,
  onCambio,
}: {
  patientId: number;
  patientName?: string;
  /** null mientras cargan. */
  casos: StudySummary[] | null;
  /** Todas las sesiones guardadas del paciente: de ellas salen la miniatura, el paso y el riesgo de cada caso. */
  sesiones: PatientSessionInfo[];
  /** «Reanudar» la última sesión de un caso; la promesa dura lo que tarda en abrirse. */
  onResume?: (sessionId: string) => void | Promise<unknown>;
  error: string | null;
  onReintentar: () => void;
  seleccionado: SeleccionCaso | null;
  onSeleccionar: (s: SeleccionCaso) => void;
  /** Sin la fila de la lista la página no sabría a qué paciente llevar el
   *  flujo: ni «Planificar» ni «Subir DICOM». */
  puedePlanificar: boolean;
  /** «Eliminar caso»: quien creó al paciente o un administrador (T7-rights). */
  puedeEliminar: boolean;
  nSesionesSinCaso: number;
  /** Si las sesiones no cargaron, no se sabe si hay sueltas: se dice aquí, con
   *  su «Reintentar», en vez de esconder la entrada (también sin casos). */
  sesionesError: string | null;
  onReintentarSesiones: () => void;
  /** Entra al flujo con este caso fijado; empieza en el paso 1. */
  onPlanificar: (st: StudySummary) => void;
  /** Un caso se creó, editó o eliminó (con su id si se eliminó): que se recarguen. */
  onCambio: (eliminado?: number) => void;
}) {
  const [formOpen, setFormOpen] = useState(false);
  const [editCaso, setEditCaso] = useState<StudySummary | null>(null);
  // «Subir DICOM» sin casos abre primero el formulario del caso; al crearlo,
  // entra al paso 1 con él.
  const [subirTrasCrear, setSubirTrasCrear] = useState(false);
  const [delCaso, setDelCaso] = useState<StudySummary | null>(null);
  const [delBusy, setDelBusy] = useState(false);
  const [delError, setDelError] = useState<string | null>(null);

  const lista = casos ?? [];
  // Arriba va el caso elegido o, sin elegir, el más reciente (el id más alto).
  const enFoco = casoEnFoco(lista, seleccionado);

  const subirDicom = () => {
    if (enFoco) return onPlanificar(enFoco);
    setSubirTrasCrear(true);
    setEditCaso(null);
    setFormOpen(true);
  };

  const eliminar = async () => {
    if (!delCaso) return;
    const id = delCaso.id;
    setDelBusy(true);
    try {
      await api.deleteStudy(patientId, id);
      setDelCaso(null);
      onCambio(id);
    } catch (e) {
      setDelError(e instanceof Error ? e.message : "Error al eliminar el caso");
      setDelCaso(null);
    } finally {
      setDelBusy(false);
    }
  };

  return (
    <div className="fc-col">
      {puedePlanificar && casos && !error && (
        <div className="fc-barra">
          {enFoco && (
            <Button size="sm" leadingIcon={<Icon name="STEP_PLAN" />} onClick={() => onPlanificar(enFoco)}
                    title={`Abre el paso 1 con el caso «${nombreCaso(enFoco)}» fijado`}>
              Planificar este caso
            </Button>
          )}
          <Button size="sm" variant={enFoco ? "outline" : "default"} leadingIcon={<Icon name="UPLOAD" />} onClick={subirDicom}
                  title={enFoco ? `Abre el paso 1 con el caso «${nombreCaso(enFoco)}» fijado` : "Crea primero el caso al que se archiva el DICOM"}>
            Subir DICOM de este paciente
          </Button>
        </div>
      )}

      <ErrorNote>{delError}</ErrorNote>

      {error ? (
        <LoadState state="error" mensaje={error} onRetry={onReintentar} />
      ) : casos === null ? (
        <LoadState state="cargando" />
      ) : lista.length === 0 ? (
        <div className="fc-vacio">
          Sin casos. Crea uno con «Nuevo caso» para archivar el DICOM y las capturas de este paciente.
        </div>
      ) : (
        <div className="fc-lista">
          {lista.map((st) => {
            const mods = modalidadesDe(st);
            const elegido = seleccionado === st.id;
            const ultima = ultimaSesionDelCaso(sesiones, st.id);
            const tipoRegion = [
              st.tipo_aneurisma && `Tipo: ${st.tipo_aneurisma}`,
              [st.region_anatomica, st.lateralidad && `(${st.lateralidad})`].filter(Boolean).join(" "),
            ].filter(Boolean).join(" · ");
            return (
              <div key={st.id} className="fc-fila" data-elegida={elegido}>
                <div className="fc-fila-cabeza">
                  <button type="button" className="fc-fila-boton" aria-pressed={elegido} onClick={() => onSeleccionar(st.id)}>
                    <MiniaturaEstudio estudio={null} estudioId={ultima?.imaging_study_id ?? null} decorativa />
                    <span className="fc-fila-texto">
                      <span className="fc-fila-titulo">{nombreCaso(st)}</span>
                      {st.acquired_at && <span className="fc-fila-meta">Fecha: {fechaDia(st.acquired_at)}</span>}
                      {tipoRegion && <span className="fc-fila-meta">{tipoRegion}</span>}
                      {st.tratamiento_propuesto && <span className="fc-fila-meta">Tratamiento: {st.tratamiento_propuesto}</span>}
                      {mods && <span className="fc-fila-meta">Imágenes: {mods}</span>}
                      {st.angiographer && <span className="fc-fila-meta">Angiógrafo: {st.angiographer}</span>}
                    </span>
                  </button>
                  <span className="fc-fila-iconos">
                    <Button type="button" size="icon" variant="ghost" title="Editar caso" aria-label={`Editar caso «${nombreCaso(st)}»`}
                            onClick={() => { setSubirTrasCrear(false); setEditCaso(st); setFormOpen(true); }}>
                      <Icon name="EDIT" size={13} />
                    </Button>
                    {puedeEliminar && (
                      <Button type="button" size="icon" variant="destructive-ghost" title="Eliminar caso" aria-label={`Eliminar caso «${nombreCaso(st)}»`}
                              onClick={() => { setDelError(null); setDelCaso(st); }}>
                        <Icon name="DELETE" size={13} />
                      </Button>
                    )}
                  </span>
                </div>
                {ultima && (
                  <div className="fc-fila-acciones" style={{ alignItems: "center" }}>
                    <Badge variant="data">{`Paso ${clampStep(ultima.current_step) + 1} · ${STEP_LABELS[clampStep(ultima.current_step)]}`}</Badge>
                    {ultima.rupture_risk_label && (
                      <Badge variant={riskVariant(ultima.rupture_risk_label)}>{`Riesgo ${ultima.rupture_risk_label.toLowerCase()}`}</Badge>
                    )}
                    {onResume && <BotonReanudar onResume={onResume} sessionId={ultima.session_id} />}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {sesionesError ? (
        <LoadState state="error" mensaje={sesionesError} onRetry={onReintentarSesiones} />
      ) : nSesionesSinCaso > 0 && (
        <button type="button" className="fc-entrada" aria-pressed={seleccionado === "sin-caso"} onClick={() => onSeleccionar("sin-caso")}>
          <span>{`Sesiones sin caso · ${nSesionesSinCaso}`}</span>
          <Icon name="CHEVRON_RIGHT" size={14} />
        </button>
      )}

      <NuevoEstudioSheet
        open={formOpen}
        patientId={patientId}
        patientName={patientName}
        study={editCaso}
        onClose={() => { setFormOpen(false); setEditCaso(null); setSubirTrasCrear(false); }}
        onCreated={(creado) => {
          onCambio();
          if (subirTrasCrear && creado) {
            setSubirTrasCrear(false);
            onPlanificar(creado);
          }
        }}
      />
      <ConfirmDialog
        open={!!delCaso}
        title="Eliminar caso"
        destructive
        busy={delBusy}
        confirmLabel={delBusy ? "Eliminando…" : "Eliminar"}
        onCancel={() => setDelCaso(null)}
        onConfirm={eliminar}
      >
        ¿Seguro que quieres eliminar el caso <b style={{ color: "var(--foreground)" }}>{delCaso ? nombreCaso(delCaso) : ""}</b>?
        {(delCaso?.session_count ?? 0) === 1 && <> Su sesión de planificación se conservará pero quedará desvinculada.</>}
        {(delCaso?.session_count ?? 0) > 1 && <> Sus {delCaso?.session_count} sesiones de planificación se conservarán pero quedarán desvinculadas.</>} Esta acción no se puede deshacer.
      </ConfirmDialog>
    </div>
  );
}
