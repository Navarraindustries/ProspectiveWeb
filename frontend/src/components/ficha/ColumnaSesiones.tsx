/* Columna Sesiones guardadas — las de un estudio de imagen, las del caso sin
   estudio archivado o las que no cuelgan de ningún caso (las filtra quien la
   monta). Cada fila dice su nombre (sin repetir el del paciente), el paso, la
   fecha y hora local, lo que ocupa y el diámetro si lo hay; se renombra en
   línea con el lápiz y se borra con confirmación, y los errores del servidor
   (el 409 de «es el origen de una sesión abierta») van literales bajo su fila.
   Renombrar y borrar es de quien creó al paciente o de un administrador
   (spec §6.2). Elegir una sesión abre su vista previa a la derecha. */

import { useRef, useState } from "react";
import { api } from "../../api/client";
import type { PatientSessionInfo } from "../../api/types";
import { fecha, fechaHora } from "../../lib/fecha";
import { formatBytes } from "../../lib/tamano";
import { STEP_LABELS, clampStep } from "../../pipeline/steps";
import { Button } from "../Button";
import { ConfirmDialog } from "../ConfirmDialog";
import { Icon } from "../Icon";
import { Input } from "../Input";
import { LoadState } from "../LoadState";
import { ErrorNote } from "../PanelHead";
import { MorphoRiskBadge } from "../morphometry/MorphoRiskBadge";
import "./ficha.css";

/** F2-30: la etiqueta que pone el servidor empieza por el nombre del paciente,
 *  que en su ficha ya se sabe («Segura, Juan · Detección»). */
export function etiquetaGuardada(s: PatientSessionInfo, paciente: string): string {
  let label = (s.label ?? "").trim();
  const prefijo = paciente ? `${paciente} · ` : "";
  if (prefijo && label.startsWith(prefijo)) label = label.slice(prefijo.length).trim();
  return label || `Sesión del ${fecha(s.updated_at)}`;
}

/** «7,4 mm», con coma decimal. */
export const milimetros = (mm: number) => `${mm.toFixed(1).replace(".", ",")} mm`;

export function ColumnaSesiones({
  sesiones,
  error,
  onReintentar,
  nombrePaciente,
  vacio,
  seleccionada,
  onSeleccionar,
  puedeGestionar,
  onRenombrada,
  onBorrada,
}: {
  sesiones: PatientSessionInfo[];
  error: string | null;
  onReintentar: () => void;
  /** «Segura, Juan»: se quita del principio de las etiquetas. */
  nombrePaciente: string;
  /** El texto cuando no hay ninguna. */
  vacio: string;
  seleccionada: string | null;
  onSeleccionar: (sessionId: string) => void;
  /** Renombrar y borrar (quien creó al paciente o un administrador). */
  puedeGestionar: boolean;
  onRenombrada: (sessionId: string, label: string) => void;
  onBorrada: (sessionId: string) => void;
}) {
  // Renombrar en línea: la sesión que se edita y lo escrito. La ref evita
  // guardar dos veces cuando Intro desmonta el campo y llega el blur.
  const [renaming, setRenaming] = useState<string | null>(null);
  const renamingRef = useRef<string | null>(null);
  const [draft, setDraft] = useState("");
  // El error de cada fila, bajo esa fila (el 409 va literal).
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [delSession, setDelSession] = useState<PatientSessionInfo | null>(null);
  const [delBusy, setDelBusy] = useState(false);

  const startRename = (s: PatientSessionInfo) => {
    renamingRef.current = s.session_id;
    setRenaming(s.session_id);
    setDraft(etiquetaGuardada(s, nombrePaciente));
  };
  const cancelRename = () => { renamingRef.current = null; setRenaming(null); };
  const commitRename = (s: PatientSessionInfo) => {
    if (renamingRef.current !== s.session_id) return;
    cancelRename();
    const label = draft.trim();
    if (!label || label === etiquetaGuardada(s, nombrePaciente)) return;
    setRowErrors(({ [s.session_id]: _, ...rest }) => rest);
    api.renameSavedSession(s.session_id, label)
      .then((r) => onRenombrada(s.session_id, r.label))
      .catch((e) => setRowErrors((r) => ({ ...r, [s.session_id]: e instanceof Error ? e.message : "No se pudo cambiar el nombre" })));
  };

  const confirmDelete = async () => {
    if (!delSession) return;
    const sid = delSession.session_id;
    setDelBusy(true);
    try {
      await api.deleteSavedSession(sid);
      setDelSession(null);
      onBorrada(sid);
    } catch (e) {
      // El 409 («es el origen de una sesión abierta…») dice qué hacer: va
      // literal bajo la fila, no en un aviso genérico.
      setRowErrors((r) => ({ ...r, [sid]: e instanceof Error ? e.message : "No se pudo borrar la sesión guardada" }));
      setDelSession(null);
    } finally {
      setDelBusy(false);
    }
  };

  if (error) return <LoadState state="error" mensaje={error} onRetry={onReintentar} />;

  return (
    <div className="fc-col">
      {sesiones.length === 0 ? (
        <div className="fc-vacio">{vacio}</div>
      ) : (
        <div className="fc-lista">
          {sesiones.map((s) => {
            const step = clampStep(s.current_step);
            const paso = STEP_LABELS[step];
            const label = etiquetaGuardada(s, nombrePaciente);
            const elegida = seleccionada === s.session_id;
            const diametro = s.max_diameter_mm != null ? ` · Ø ${milimetros(s.max_diameter_mm)}` : "";
            return (
              <div key={s.session_id} className="fc-fila" data-guardada data-elegida={elegida}>
                <div className="fc-fila-cabeza">
                  {renaming === s.session_id ? (
                    <div style={{ flex: 1 }}>
                      <Input
                        aria-label="Nombre de la sesión guardada"
                        autoFocus
                        maxLength={256}
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onBlur={() => commitRename(s)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") { e.preventDefault(); commitRename(s); }
                          else if (e.key === "Escape") {
                            // Escape cancela el nombre y nada más: sin cortarlo
                            // aquí, una hoja o diálogo que escucha en `document` lo oiría.
                            e.preventDefault();
                            e.stopPropagation();
                            cancelRename();
                          }
                        }}
                      />
                    </div>
                  ) : (
                    <>
                      <button type="button" className="fc-fila-boton" aria-pressed={elegida} onClick={() => onSeleccionar(s.session_id)}>
                        <span className="fc-fila-texto">
                          <span className="fc-fila-titulo">{label}</span>
                          {/* F2-30, F2-73: paso (sin repetirlo si ya es el nombre), hora local y lo que ocupa en disco. */}
                          <span className="fc-fila-meta fc-fila-mono">
                            {`Paso ${step + 1}${label === paso ? "" : ` · ${paso}`} · ${fechaHora(s.updated_at)} · ${formatBytes(s.size_bytes)}${diametro}`}
                          </span>
                        </span>
                      </button>
                      {puedeGestionar && (
                        <Button type="button" size="icon" variant="ghost" title="Cambiar el nombre"
                                aria-label={`Renombrar «${label}»`} onClick={() => startRename(s)}>
                          <Icon name="RENAME" size={13} />
                        </Button>
                      )}
                    </>
                  )}
                </div>
                {/* F1-68: «Alto» a secas se leía como riesgo de rotura. */}
                {(s.rupture_risk_label || puedeGestionar) && (
                  <div className="fc-fila-acciones" style={{ alignItems: "center" }}>
                    {s.rupture_risk_label && <MorphoRiskBadge label={s.rupture_risk_label} />}
                    {puedeGestionar && (
                      <Button type="button" size="sm" variant="ghost" leadingIcon={<Icon name="DELETE" />}
                              aria-label={`Borrar «${label}»`} onClick={() => setDelSession(s)}>
                        Borrar
                      </Button>
                    )}
                  </div>
                )}
                {rowErrors[s.session_id] && (
                  <div role="alert"><ErrorNote>{rowErrors[s.session_id]}</ErrorNote></div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={!!delSession}
        title="Borrar la sesión guardada"
        destructive
        busy={delBusy}
        confirmLabel={delBusy ? "Borrando…" : "Borrar"}
        onCancel={() => setDelSession(null)}
        onConfirm={confirmDelete}
      >
        ¿Borrar <b style={{ color: "var(--foreground)" }}>«{delSession ? etiquetaGuardada(delSession, nombrePaciente) : ""}»</b>?{" "}
        {"Se borra la copia guardada y no se puede deshacer. Si la acabas de reanudar, no se podrá borrar hasta que esa sesión abierta caduque sola."}
      </ConfirmDialog>
    </div>
  );
}
