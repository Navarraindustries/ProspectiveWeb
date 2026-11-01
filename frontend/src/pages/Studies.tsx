/* Estudios — galería de los estudios cargados.

   Rejilla de tarjetas con vista previa (una imagen del estudio) y buscador por
   paciente, HC (el dato que el resto de la aplicación llama así) o diagnóstico.
   Cada tarjeta abre el estudio, reanuda su sesión, salta a la ficha del paciente
   y, para quien creó al paciente o un administrador, lo borra. El mismo componente `StudyGallery` se reutiliza dentro de la ficha
   del paciente pasando `patientId`. */

import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { StudyCard } from "../api/types";
import { Badge, riskVariant } from "../components/Badge";
import { Button } from "../components/Button";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { useAuth } from "../store/auth";
import { Icon } from "../components/Icon";
import { Input } from "../components/Input";
import { MenuMas } from "../components/MenuMas";
import type { ItemMenu } from "../components/MenuMas";
import { EstadoVacio } from "../components/EstadoVacio";
import { useTableta } from "../hooks/useEstrecho";
import { useEnCurso } from "../hooks/useEnCurso";
import { fechaDia } from "../lib/fecha";
import { AppShell } from "../components/shell/AppShell";
import { LoadState, loadErrorText } from "../components/LoadState";

import { STEP_LABELS } from "../pipeline/steps";
import { conTransicion } from "../lib/viewTransition";
import "../styles/office.css";
import { PageBody } from "../components/shell/PageBody";

/** Preview image of a study — fetched with the JWT, so it goes through a blob. */
function Thumbnail({ study }: { study: StudyCard }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!study.has_thumbnail) return;
    let alive = true;
    let created: string | null = null;
    api.studyThumbnailObjectUrl(study.id)
      .then((u) => { if (alive) { created = u; setUrl(u); } else URL.revokeObjectURL(u); })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; if (created) URL.revokeObjectURL(created); };
  }, [study.id, study.has_thumbnail]);

  const box: React.CSSProperties = {
    width: "100%", height: 170, background: "var(--viewer-bg)",
    display: "flex", alignItems: "center", justifyContent: "center",
    borderTopLeftRadius: "var(--radius-card-lg)", borderTopRightRadius: "var(--radius-card-lg)",
    overflow: "hidden", position: "relative",
  };

  // Chip de modalidad arriba a la izquierda e insignia de riesgo arriba a la derecha.
  const chipTexto = study.modality
    ? (study.n_slices > 0 ? `${study.modality} · ${study.n_slices} cortes` : study.modality)
    : (study.n_slices > 0 ? `${study.n_slices} cortes` : "");
  const sobre = (
    <>
      {chipTexto && (
        <span
          className="es-insignia"
          data-insignia="modalidad"
          style={{
            position: "absolute", top: 8, left: 8, fontSize: 12, padding: "2px 8px", borderRadius: 6,
            background: "var(--glass-solid)", color: "var(--foreground)", border: "1px solid var(--glass-border)",
            fontFamily: "var(--font-mono)",
          }}
        >
          {chipTexto}
        </span>
      )}
      {study.rupture_risk_label && (
        <span
          className="es-insignia"
          data-insignia="riesgo"
          style={{
            position: "absolute", top: 8, right: 8, padding: 2, borderRadius: 8,
            background: "var(--glass-solid)", border: "1px solid var(--glass-border)", color: "var(--foreground)",
          }}
        >
          <Badge variant={riskVariant(study.rupture_risk_label as never)}>{study.rupture_risk_label}</Badge>
        </span>
      )}
    </>
  );

  if (url) {
    return (
      <div style={box}>
        <img src={url} alt={`Vista previa de ${study.description}`}
             style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        {sobre}
      </div>
    );
  }
  return (
    <div style={{ ...box, color: "var(--muted-foreground)", fontSize: 13, gap: 6, flexDirection: "column" }}>
      <Icon name="FOLDER" size={22} />
      {failed ? "Sin vista previa" : study.has_thumbnail ? "Cargando…" : "Sin archivar"}
      {sobre}
    </div>
  );
}

export function StudyGallery({
  patientId,
  caseId,
  onOpen,
  onResume,
  onOpenPatient,
  emptyHint,
  onNew,
  onCount,
}: {
  /** Pinta al final de la rejilla la tarjeta punteada «Subir un estudio nuevo». */
  onNew?: () => void;
  /** Avisa del número de estudios cargados (null mientras carga). */
  onCount?: (n: number | "error" | null) => void;
  /** Restrict to one patient (used inside the patient sheet). */
  patientId?: number;
  /** Restrict to one clinical case — a case can hold several acquisitions. */
  caseId?: number;
  onOpen: (study: StudyCard) => void;
  /** Restore the study's saved session instead of starting a new one. Si
      devuelve una promesa, el botón enseña «Abriendo…» hasta que acabe. */
  onResume?: (study: StudyCard) => unknown;
  /** Ir a la ficha del paciente de la tarjeta. Dentro de la propia ficha no se pasa. */
  onOpenPatient?: (patientId: number) => void;
  /** Message shown when this scope has no imaging studies yet. */
  emptyHint?: string;
}) {
  const [studies, setStudies] = useState<StudyCard[]>([]);
  // Reanudar: «Abriendo…» en la tarjeta pulsada y ningún otro Reanudar
  // mientras dura (como en Pacientes).
  const [abriendo, lanzar] = useEnCurso();
  const [abriendoId, setAbriendoId] = useState<number | null>(null);
  const reanudar = (est: StudyCard) => {
    if (abriendo) return;
    setAbriendoId(est.id);
    lanzar(() => onResume?.(est));
  };
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [q, setQ] = useState("");
  const { user } = useAuth();
  const [toDelete, setToDelete] = useState<StudyCard | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const tactil = useTableta();

  // El servidor es quien decide (solo el creador o un administrador); esto solo
  // evita ofrecer un botón que acabaría en 403.
  const canDelete = (est: StudyCard) =>
    !!user && (user.role === "admin" || (est.owner_id != null && est.owner_id === user.id));

  const confirmDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await api.deleteImagingStudy(toDelete.id);
      setStudies((all) => all.filter((x) => x.id !== toDelete.id));
      setToDelete(null);
      setDeleteError(null);
    } catch (e) {
      // La tarjeta se queda: nada se ha borrado y el motivo (p. ej. capturas) se lee.
      setToDelete(null);
      setDeleteError(loadErrorText(e));
    } finally {
      setDeleting(false);
    }
  };

  // The search goes to the server (debounced). Filtering only on the client
  // searched whatever page happened to be loaded, so on a real archive an older
  // patient came back empty with nothing to explain why.
  useEffect(() => {
    let alive = true;
    const t = setTimeout(() => {
      setLoading(true);
      setError(null);
      api.listStudies(q.trim(), patientId, caseId)
        .then((est) => { if (alive) setStudies(est); })
        // F1-75: el error salía encima del texto de vacío («Aún no hay estudios
        // archivados»), y el vacío ganaba; ahora el error ocupa su sitio.
        .catch((e) => { if (alive) setError(loadErrorText(e)); })
        .finally(() => { if (alive) setLoading(false); });
    }, q.trim() ? 280 : 0);
    return () => { alive = false; clearTimeout(t); };
  }, [patientId, caseId, q, attempt]);

  const rows = studies;

  const menuDe = (est: StudyCard, canResume: boolean): ItemMenu[] => [
    ...(canResume ? [{
      id: "nueva", label: "Nueva sesión", onSelect: () => onOpen(est),
      title: "La sesión anterior se conserva en la ficha",
    }] : []),
    ...(onOpenPatient ? [{ id: "ficha", label: "Abrir ficha", icon: "OPEN" as const, onSelect: () => onOpenPatient(est.patient_id) }] : []),
    ...(canDelete(est) ? [{
      id: "borrar", label: "Borrar estudio", icon: "DELETE" as const, destructive: true, separadoAntes: true, abreDialogo: true,
      onSelect: () => { setDeleteError(null); setToDelete(est); },
    }] : []),
  ];

  useEffect(() => { onCount?.(loading ? null : error ? "error" : studies.length); }, [onCount, loading, error, studies.length]);

  return (
    <div>
      <div style={{ maxWidth: 420, width: "100%", marginBottom: 18 }}>
        <Input
          icon={<Icon name="SEARCH" size={15} />}
          aria-label="Buscar por paciente, HC o diagnóstico"
          placeholder="Buscar por paciente, HC o diagnóstico…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {deleteError && (
        <div role="alert" style={{ color: "var(--destructive)", fontSize: 13, marginBottom: 12 }}>
          {deleteError}
        </div>
      )}

      {loading ? (
        <LoadState state="cargando" />
      ) : error ? (
        <LoadState state="error" mensaje={error} onRetry={() => setAttempt((n) => n + 1)} />
      ) : rows.length === 0 ? (
        <EstadoVacio icono="STUDIES" titulo={q.trim() ? "Sin coincidencias" : "Aún no hay estudios"}>
          {q.trim()
            ? `Ningún estudio coincide con «${q.trim()}».`
            : (emptyHint ?? "Aún no hay estudios archivados. Abre un caso con «Planificar este caso», carga el DICOM y pulsa «Guardar estudio» en el Paso 1.")}
        </EstadoVacio>
      ) : (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(min(220px, 100%), 1fr))",
          gap: 14,
        }}>
          {rows.map((est) => {
            const canResume = !!est.resumable_session_id && !!onResume;
            return (
            <div
              key={est.id}
              className="tarjeta-estudio"
              data-glass
              title={`${est.patient_name} · ${est.description}`}
              style={{
                display: "flex", flexDirection: "column", textAlign: "left", padding: 0,
                borderRadius: "var(--radius-card-lg)", overflow: "hidden",
                fontFamily: "var(--font-sans)",
              }}
            >
              <button
                type="button"
                disabled={canResume && abriendo}
                onClick={() => (canResume ? reanudar(est) : onOpen(est))}
                style={{ display: "block", padding: 0, border: "none", background: "transparent", cursor: "pointer", width: "100%" }}
              >
                <Thumbnail study={est} />
              </button>
              <div style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 4, minWidth: 0, flex: 1 }}>
                <div className="truncate" style={{ fontSize: 15, fontWeight: 600, color: "var(--foreground)" }}>
                  {est.patient_name || "—"}
                </div>
                <div className="truncate" style={{ fontSize: 12, color: "var(--muted-foreground)", fontFamily: "var(--font-mono)" }}>
                  {est.hospital_id || "sin HC"}
                </div>
                <div className="truncate" style={{ fontSize: 13, color: "var(--muted-foreground)" }}>
                  {est.description}
                </div>
                <div style={{ fontSize: 13, color: "var(--muted-foreground)", marginTop: 2 }}>
                  {est.last_step != null
                    ? `Último paso: ${STEP_LABELS[est.last_step] ?? est.last_step}`
                    : est.archived ? "Sin procesar" : "No archivado"}
                </div>

                {/* La tarjeta anuncia progreso: la acción principal es la que lo
                    conserva. «Nueva sesión» empieza desde el paso 1 y dice que la
                    anterior no se pierde; lo demás vive en «⋯». */}
                <div style={{ display: "flex", gap: 8, marginTop: "auto", paddingTop: 8, alignItems: "center" }}>
                  <Button
                    size="sm"
                    disabled={canResume && abriendo}
                    onClick={() => (canResume ? reanudar(est) : onOpen(est))}
                    title={canResume
                      ? (est.last_step != null ? `Reanudar en «${STEP_LABELS[est.last_step] ?? est.last_step}»` : "Reanudar la sesión guardada")
                      : undefined}
                    style={{ flex: 1 }}
                  >
                    {canResume ? (abriendo && abriendoId === est.id ? "Abriendo…" : "Reanudar") : "Abrir"}
                  </Button>
                  {menuDe(est, canResume).length > 0 && (
                    <MenuMas
                      label={`Más acciones del estudio de ${est.patient_name}`}
                      tactil={tactil}
                      items={menuDe(est, canResume)}
                    />
                  )}
                </div>
              </div>
            </div>
            );
          })}
          {/* Última casilla de la rejilla: invita a subir un estudio. */}
          {onNew && (
            <button
              type="button"
              className="tarjeta-nueva"
              onClick={onNew}
              style={{
                alignSelf: "stretch", height: "100%", display: "flex", flexDirection: "column", alignItems: "center",
                justifyContent: "center", gap: 8, cursor: "pointer",
                color: "var(--data)", fontFamily: "var(--font-sans)", fontSize: 14,
              }}
            >
              <Icon name="UPLOAD" size={22} />
              Subir un estudio nuevo
            </button>
          )}
        </div>
      )}

      <ConfirmDialog
        open={toDelete !== null}
        title="¿Borrar el estudio archivado?"
        confirmLabel="Borrar estudio"
        destructive
        busy={deleting}
        onCancel={() => setToDelete(null)}
        onConfirm={() => void confirmDelete()}
      >
        {/* Un borrado irreversible elegido entre tarjetas parecidas: se nombra
            el estudio y se dice si queda alguna copia de sus imágenes. */}
        {toDelete && (
          <>
            <b style={{ color: "var(--foreground)" }}>
              {[toDelete.patient_name, toDelete.description || toDelete.dx_principal || "sin descripción",
                toDelete.acquired_at ? fechaDia(toDelete.acquired_at) : "sin fecha", `${toDelete.n_files} archivos`].join(" · ")}
            </b>
            <br />
            {"Se borra el DICOM archivado de este estudio. "}
            {toDelete.resumable_session_id
              ? "Las sesiones guardadas de este estudio conservan su copia y siguen abriéndose. "
              : "Ninguna sesión guardada conserva copia: las imágenes se pierden del todo. "}
            {"No se puede deshacer."}
          </>
        )}
      </ConfirmDialog>
    </div>
  );
}

export function Studies({
  onOpen, onResume, onOpenPatient, onNew,
}: {
  onOpen: (study: StudyCard) => void;
  /** Devuelve la promesa de reanudar: la tarjeta enseña «Abriendo…» mientras dura. */
  onResume: (study: StudyCard) => unknown;
  onOpenPatient: (patientId: number) => void;
  onNew: () => void;
}) {
  const [count, setCount] = useState<number | "error" | null>(null);
  // Sección de primer nivel, como Pacientes: la miga es solo ella.
  return (
    <AppShell
      crumbs={[{ label: "Estudios" }]}
      subtitle={count == null
        ? "Cargando…"
        : count === "error"
          ? "No se pudo cargar la lista"
          : `${count} ${count === 1 ? "estudio" : "estudios"} de imagen ${count === 1 ? "archivado" : "archivados"}${count > 0 ? " · pulsa uno para reanudarlo o abrirlo" : ""}`}
    >
      <PageBody className="fade-rise">
          <StudyGallery
            onOpen={(est) => conTransicion(() => onOpen(est))}
            onResume={(est) => new Promise<unknown>((resolver, rechazar) => {
              // La transición llama más tarde: la promesa sigue a la de reanudar.
              conTransicion(() => { Promise.resolve(onResume(est)).then(resolver, rechazar); });
            })}
            onOpenPatient={onOpenPatient}
            onNew={onNew}
            onCount={setCount}
          />
      </PageBody>
    </AppShell>
  );
}
