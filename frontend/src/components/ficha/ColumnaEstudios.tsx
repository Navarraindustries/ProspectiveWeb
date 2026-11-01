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
import { useEnCurso } from "../../hooks/useEnCurso";
import { useTableta } from "../../hooks/useEstrecho";
import { fechaDia } from "../../lib/fecha";
import { Button } from "../Button";
import { ConfirmDialog } from "../ConfirmDialog";
import { Icon } from "../Icon";
import { LoadState, loadErrorText } from "../LoadState";
import { MenuMas, type ItemMenu } from "../MenuMas";
import "./ficha.css";

/** Lo elegido en la columna: un estudio de imagen, o las sesiones del caso sin estudio. */
export type SeleccionEstudio = number | "sin-estudio";

const sesionesTexto = (n: number) =>
  n === 0 ? "Sin sesiones guardadas" : `${n} ${n === 1 ? "sesión guardada" : "sesiones guardadas"}`;

/** La imagen de vista previa de un estudio. Va con el token, así que pasa por
 *  un blob; sin miniatura (o si falla) dice «Sin vista previa»: la grande con
 *  texto; la pequeña de la fila, solo el icono con ese nombre accesible. */
export function MiniaturaEstudio({ estudio, estudioId, grande = false, decorativa = false }: {
  estudio: StudyCard | null;
  /** Si viene, pide la miniatura de ese estudio aunque no haya tarjeta. */
  estudioId?: number | null;
  grande?: boolean;
  /** Dentro de un botón que ya se llama por su texto: la imagen no añade nombre. */
  decorativa?: boolean;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [fallo, setFallo] = useState(false);
  const id = estudioId ?? estudio?.id;
  const conMiniatura = estudioId != null ? true : !!estudio?.has_thumbnail;

  useEffect(() => {
    setUrl(null);
    setFallo(false);
    if (id == null || !conMiniatura) return;
    let vigente = true;
    let creada: string | null = null;
    Promise.resolve()
      .then(() => api.studyThumbnailObjectUrl(id))
      .then((u) => { if (vigente) { creada = u; setUrl(u); } else URL.revokeObjectURL(u); })
      .catch(() => { if (vigente) setFallo(true); });
    return () => { vigente = false; if (creada) URL.revokeObjectURL(creada); };
  }, [id, conMiniatura]);

  const conImagen = !!url;
  const texto = conMiniatura && !fallo ? "Cargando…" : "Sin vista previa";
  const soloIcono = !conImagen && !grande && !decorativa;
  return (
    <span className="fc-miniatura" data-grande={grande} {...(decorativa ? { "aria-hidden": true } : {})}
          {...(soloIcono ? { role: "img", "aria-label": texto, title: texto } : {})}>
      {conImagen ? (
        <img src={url!} alt={`Vista previa de ${estudio?.description || estudio?.modality || "estudio"}`} />
      ) : (
        <>
          <Icon name="FOLDER" size={grande ? 22 : 16} />
          {grande && texto}
        </>
      )}
    </span>
  );
}

/** «Reanudar» con su estado de carga: «Abriendo…» y sin segundo clic mientras dura. */
export function BotonReanudar({ onResume, sessionId, title, size = "sm" }: {
  onResume: (sessionId: string) => void | Promise<unknown>;
  sessionId: string;
  title?: string;
  size?: "sm" | "md";
}) {
  const [abriendo, lanzar] = useEnCurso();
  return (
    <Button type="button" size={size} disabled={abriendo} leadingIcon={<Icon name="RESUME" size={size === "sm" ? 12 : undefined} />}
            title={title} onClick={() => lanzar(() => onResume(sessionId))}>
      {abriendo ? "Abriendo…" : "Reanudar"}
    </Button>
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
  onResume,
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
  /** «Reanudar» la sesión guardada de un estudio; la promesa dura lo que tarda en abrirse. */
  onResume?: (sessionId: string) => void | Promise<unknown>;
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
  const tableta = useTableta();

  useEffect(() => {
    let vigente = true;
    setEstudios(null);
    setError(null);
    Promise.resolve()
      .then(() => api.listStudies("", undefined, caso.id))
      .then((lista) => { if (vigente) setEstudios(lista); })
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

  const menuDe = (img: StudyCard): ItemMenu[] => [
    ...(onOpenStudy ? [{ id: "abrir", label: "Abrir estudio", icon: "OPEN" as const, onSelect: () => onOpenStudy(img) }] : []),
    ...(puedeBorrar ? [{
      id: "borrar", label: "Borrar estudio", icon: "DELETE" as const, destructive: true, abreDialogo: true,
      separadoAntes: !!onOpenStudy, onSelect: () => { setBorrarError(null); setABorrar(img); },
    }] : []),
  ];

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
            const detalle = [img.modality, img.acquired_at ? fechaDia(img.acquired_at) : "", img.n_slices > 0 ? `${img.n_slices} cortes` : ""].filter(Boolean).join(" · ");
            return (
              <div key={img.id} className="fc-fila" data-elegida={elegido}>
                <button type="button" className="fc-fila-boton" aria-pressed={elegido} onClick={() => onSeleccionar(img)}>
                  <span className="fc-fila-texto" style={{ flex: 1 }}>
                    <span className="fc-fila-titulo">{img.description || img.modality || "Estudio de imagen"}</span>
                    {detalle && <span className="fc-fila-meta fc-fila-mono">{detalle}</span>}
                    <span className="fc-fila-meta">
                      {sesionesTexto(n)}
                      {n > 0 && <> <Icon name="CHEVRON_RIGHT" size={12} /></>}
                    </span>
                  </span>
                  <MiniaturaEstudio estudio={img} />
                </button>
                <div className="fc-fila-acciones">
                  {img.resumable_session_id && onResume && (
                    <BotonReanudar onResume={onResume} sessionId={img.resumable_session_id} />
                  )}
                  {menuDe(img).length > 0 && (
                    <MenuMas items={menuDe(img)} tactil={tableta}
                             label={`Más acciones del estudio ${img.description || img.modality}`} />
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
                aBorrar.acquired_at ? fechaDia(aBorrar.acquired_at) : "sin fecha", `${aBorrar.n_files} archivos`].join(" · ")}
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
