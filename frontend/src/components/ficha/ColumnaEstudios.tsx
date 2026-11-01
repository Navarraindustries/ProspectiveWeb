/* Columna Estudios de imagen — las adquisiciones archivadas de un caso (TAC,
   angiografía, control…), con su miniatura, modalidad, fecha, cortes y cuántas
   sesiones guardadas cuelgan de cada una. Elegir un estudio abre sus sesiones
   a la derecha; «Abrir estudio» lo carga en el flujo y «Borrar estudio» borra
   su DICOM archivado. Al final, si el caso tiene sesiones guardadas sin estudio
   archivado, la entrada «Sesiones sin estudio archivado» (spec §8.9). Pide la
   lista como lo hacía la galería de la ficha antigua (`StudyGallery`). */

import { useCallback, useEffect, useState } from "react";
import { api } from "../../api/client";
import type { PatientSessionInfo, StudyCard, StudySummary } from "../../api/types";
import { Button } from "../Button";
import { ConfirmDialog } from "../ConfirmDialog";
import { Icon } from "../Icon";
import { LoadState, loadErrorText } from "../LoadState";
import "./ficha.css";

/** Lo elegido en la columna: un estudio de imagen, o las sesiones del caso sin estudio. */
export type SeleccionEstudio = number | "sin-estudio";

const sesionesTexto = (n: number) =>
  n === 0 ? "Sin sesiones guardadas" : `${n} ${n === 1 ? "sesión guardada" : "sesiones guardadas"}`;

/** La imagen de vista previa de un estudio. Va con el token, así que pasa por
 *  un blob; sin miniatura (o si falla) dice «Sin vista previa». */
export function MiniaturaEstudio({ estudio, grande = false }: { estudio: StudyCard | null; grande?: boolean }) {
  const [url, setUrl] = useState<string | null>(null);
  const [fallo, setFallo] = useState(false);
  const id = estudio?.id;
  const conMiniatura = !!estudio?.has_thumbnail;

  useEffect(() => {
    setUrl(null);
    setFallo(false);
    if (id == null || !conMiniatura) return;
    let vigente = true;
    let creada: string | null = null;
    api.studyThumbnailObjectUrl(id)
      .then((u) => { if (vigente) { creada = u; setUrl(u); } else URL.revokeObjectURL(u); })
      .catch(() => { if (vigente) setFallo(true); });
    return () => { vigente = false; if (creada) URL.revokeObjectURL(creada); };
  }, [id, conMiniatura]);

  return (
    <span className="fc-miniatura" data-grande={grande}>
      {url && estudio ? (
        <img src={url} alt={`Vista previa de ${estudio.description || estudio.modality || "estudio"}`} />
      ) : (
        <>
          <Icon name="FOLDER" size={grande ? 22 : 16} />
          {conMiniatura && !fallo ? "Cargando…" : "Sin vista previa"}
        </>
      )}
    </span>
  );
}

export function ColumnaEstudios({
  caso,
  sesiones,
  sesionesError,
  onReintentarSesiones,
  seleccionado,
  onSeleccionar,
  onOpenStudy,
  puedeBorrar,
  onEstudioBorrado,
}: {
  caso: StudySummary;
  /** Todas las sesiones guardadas del paciente: aquí se cuentan las de cada estudio. */
  sesiones: PatientSessionInfo[];
  sesionesError: string | null;
  onReintentarSesiones: () => void;
  seleccionado: SeleccionEstudio | null;
  onSeleccionar: (s: StudyCard | "sin-estudio") => void;
  /** Abre un estudio archivado en el flujo. */
  onOpenStudy?: (img: StudyCard) => void;
  /** «Borrar estudio»: quien creó al paciente o un administrador. */
  puedeBorrar: boolean;
  /** El estudio se borró: sus sesiones pasan a no tener estudio archivado. */
  onEstudioBorrado: (id: number) => void;
}) {
  const [estudios, setEstudios] = useState<StudyCard[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);
  const [aBorrar, setABorrar] = useState<StudyCard | null>(null);
  const [borrando, setBorrando] = useState(false);
  const [borrarError, setBorrarError] = useState<string | null>(null);

  useEffect(() => {
    let vigente = true;
    setEstudios(null);
    setError(null);
    Promise.resolve()
      .then(() => api.listStudies("", undefined, caso.id))
      .then((s) => { if (vigente) setEstudios(s); })
      .catch((e) => { if (vigente) setError(loadErrorText(e)); });
    return () => { vigente = false; };
  }, [caso.id, intento]);

  const reintentar = useCallback(() => setIntento((n) => n + 1), []);

  const borrar = async () => {
    if (!aBorrar) return;
    const id = aBorrar.id;
    setBorrando(true);
    try {
      await api.deleteImagingStudy(id);
      setEstudios((all) => (all ?? []).filter((x) => x.id !== id));
      setABorrar(null);
      setBorrarError(null);
      onEstudioBorrado(id);
    } catch (e) {
      // La fila se queda: nada se ha borrado y el motivo (p. ej. capturas) se lee.
      setABorrar(null);
      setBorrarError(loadErrorText(e));
    } finally {
      setBorrando(false);
    }
  };

  const nSinEstudio = sesiones.filter((s) => s.case_id === caso.id && s.imaging_study_id == null).length;

  return (
    <div className="fc-col">
      {borrarError && <div role="alert" className="fc-vacio" style={{ color: "var(--destructive)" }}>{borrarError}</div>}

      {error ? (
        <LoadState state="error" mensaje={error} onRetry={reintentar} />
      ) : estudios === null ? (
        <LoadState state="cargando" />
      ) : estudios.length === 0 ? (
        <div className="fc-vacio">Sin imágenes archivadas todavía.</div>
      ) : (
        <div className="fc-lista">
          {estudios.map((img) => {
            const elegido = seleccionado === img.id;
            const n = sesiones.filter((s) => s.imaging_study_id === img.id).length;
            const detalle = [img.modality, img.acquired_at, img.n_slices > 0 ? `${img.n_slices} cortes` : ""].filter(Boolean).join(" · ");
            return (
              <div key={img.id} className="fc-fila" data-elegida={elegido}>
                <button type="button" className="fc-fila-boton" aria-pressed={elegido} onClick={() => onSeleccionar(img)}>
                  <span className="fc-fila-texto" style={{ flex: 1 }}>
                    <span className="fc-fila-titulo">{img.description || img.modality || "Estudio de imagen"}</span>
                    {detalle && <span className="fc-fila-meta fc-fila-mono">{detalle}</span>}
                    <span className="fc-fila-meta">{sesionesTexto(n)}</span>
                  </span>
                  <MiniaturaEstudio estudio={img} />
                </button>
                <div className="fc-fila-acciones">
                  {onOpenStudy && (
                    <Button type="button" size="sm" variant="outline" leadingIcon={<Icon name="OPEN" size={12} />}
                            onClick={() => onOpenStudy(img)}>
                      Abrir estudio
                    </Button>
                  )}
                  {puedeBorrar && (
                    <Button type="button" size="sm" variant="ghost" leadingIcon={<Icon name="DELETE" size={12} />}
                            onClick={() => { setBorrarError(null); setABorrar(img); }}>
                      Borrar estudio
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {sesionesError ? (
        <LoadState state="error" mensaje={sesionesError} onRetry={onReintentarSesiones} />
      ) : nSinEstudio > 0 && (
        <button type="button" className="fc-entrada" aria-pressed={seleccionado === "sin-estudio"} onClick={() => onSeleccionar("sin-estudio")}>
          <span>{`Sesiones sin estudio archivado · ${nSinEstudio}`}</span>
          <Icon name="CHEVRON_RIGHT" size={14} />
        </button>
      )}

      <ConfirmDialog
        open={aBorrar !== null}
        title="¿Borrar el estudio archivado?"
        confirmLabel="Borrar estudio"
        destructive
        busy={borrando}
        onCancel={() => setABorrar(null)}
        onConfirm={() => void borrar()}
      >
        {/* Un borrado irreversible elegido entre filas parecidas: se nombra el
            estudio y se dice si queda alguna copia de sus imágenes. */}
        {aBorrar && (
          <>
            <b style={{ color: "var(--foreground)" }}>
              {[aBorrar.patient_name, aBorrar.description || aBorrar.dx_principal || "sin descripción",
                aBorrar.acquired_at || "sin fecha", `${aBorrar.n_files} archivos`].join(" · ")}
            </b>
            <br />
            {"Se borra el DICOM archivado de este estudio. "}
            {aBorrar.resumable_session_id
              ? "Las sesiones guardadas de este estudio conservan su copia y siguen abriéndose. "
              : "Ninguna sesión guardada conserva copia: las imágenes se pierden del todo. "}
            {"No se puede deshacer."}
          </>
        )}
      </ConfirmDialog>
    </div>
  );
}
