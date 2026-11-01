/* Las capturas guardadas de un caso: verlas, renombrarlas, bajarlas, borrarlas.

   Las imágenes necesitan el JWT, así que no se pueden poner en un `src` a
   pelo: se piden como blob y se enseñan con una URL de objeto, igual que las
   miniaturas de la galería de estudios. Y las URL de objeto se revocan al
   desmontar — son referencias a memoria del navegador, y una lista de
   capturas abierta y cerrada veinte veces las va acumulando.

   Qué NO hace: no enseña el PNG a tamaño completo en un visor propio. Abrir
   la imagen en una pestaña es lo que cualquiera espera y ya lo hace el
   navegador; añadir aquí un visor con zoom sería otro visor que mantener. */

import { useCallback, useEffect, useRef, useState } from "react";

import { api } from "../api/client";
import { isRecording, type CaptureOut } from "../api/types";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { Card, ErrorNote } from "./PanelHead";
import { Input } from "./Input";
import { ConfirmDialog } from "./ConfirmDialog";
import { Icon } from "./Icon";
import { fechaHora, selloArchivo, type OpcionesFecha } from "../lib/fecha";
import { STEPS } from "../pipeline/steps";
import { cifra } from "../lib/numero";

/** Nombre del fichero al descargar: legible y sin datos del paciente. */
export function downloadName(
  c: Pick<CaptureOut, "id" | "label" | "created_at" | "media_type">,
  o?: OpcionesFecha,
): string {
  // `created_at` llega sin zona y es UTC: el sello lo lee `selloArchivo` en la
  // zona de quien mira, la misma hora que enseña la galería.
  const sello0 = selloArchivo(c.created_at, o);
  const sello = sello0 === "sin-fecha" ? String(c.id) : sello0;
  const limpio = (c.label || "captura")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")   // sin tildes: viaja mejor
    .replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase()
    .slice(0, 60) || "captura";
  const ext = c.media_type === "video/mp4" ? "mp4" : c.media_type === "video/webm" ? "webm" : "png";
  return `prospective-${sello}-${limpio}.${ext}`;
}

/** El paso en castellano: «detect» → «Detección». Clave desconocida → tal cual. */
export function etiquetaPaso(clave: string): string {
  return STEPS.find((p) => p.key === clave)?.label ?? clave;
}

/** Duración de una grabación: «1:05». */
export function formatDuration(seg: number): string {
  const t = Math.max(0, Math.round(seg));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
}

/** Peso legible, para que se vea cuánto ocupa lo que se va acumulando. */
export function humanSize(bytes: number): string {
  if (!bytes) return "";
  return bytes >= 1e6 ? `${cifra(bytes / 1e6, 1)} MB` : `${Math.round(bytes / 1024)} KB`;
}

export function CaptureGallery({
  imagingStudyId, caseId, patientId, emptyHint,
}: {
  imagingStudyId?: number;
  caseId?: number;
  patientId?: number;
  emptyHint?: string;
}) {
  const [rows, setRows] = useState<CaptureOut[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editando, setEditando] = useState<number | null>(null);
  const [borrador, setBorrador] = useState("");
  // F1-3: la ✕ borraba al primer clic, sin aviso ni deshacer. La captura
  // pendiente de confirmar vive aquí hasta que se dice que sí.
  const [aBorrar, setABorrar] = useState<CaptureOut | null>(null);
  // Una URL de objeto por captura, revocadas al desmontar.
  const [urls, setUrls] = useState<Record<number, string>>({});
  const urlsRef = useRef<Record<number, string>>({});
  urlsRef.current = urls;

  const cargar = useCallback(async () => {
    try {
      setError(null);
      setRows(await api.listCaptures({ imagingStudyId, caseId, patientId }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron cargar las capturas");
      setRows([]);
    }
  }, [imagingStudyId, caseId, patientId]);

  useEffect(() => { void cargar(); }, [cargar]);

  // Las miniaturas, una vez cada una. Los vídeos NO: pesan megas cada uno y
  // se piden al darle a reproducir o a descargar.
  useEffect(() => {
    if (!rows) return;
    let vivo = true;
    (async () => {
      for (const r of rows) {
        if (urlsRef.current[r.id] || isRecording(r)) continue;
        try {
          const url = await api.captureObjectUrl(r.id);
          if (!vivo) { URL.revokeObjectURL(url); return; }
          setUrls((u) => ({ ...u, [r.id]: url }));
        } catch { /* una miniatura que no carga deja su hueco, no rompe la lista */ }
      }
    })();
    return () => { vivo = false; };
  }, [rows]);

  useEffect(() => () => {
    for (const url of Object.values(urlsRef.current)) URL.revokeObjectURL(url);
  }, []);

  const [cargandoVideo, setCargandoVideo] = useState<number | null>(null);
  /** La URL del vídeo, pidiéndolo la primera vez. */
  const urlVideo = async (c: CaptureOut): Promise<string | null> => {
    if (urlsRef.current[c.id]) return urlsRef.current[c.id];
    setCargandoVideo(c.id);
    try {
      const url = await api.recordingObjectUrl(c.id);
      setUrls((u) => ({ ...u, [c.id]: url }));
      return url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar el vídeo");
      return null;
    } finally {
      setCargandoVideo(null);
    }
  };

  const descargar = async (c: CaptureOut) => {
    const url = isRecording(c) ? await urlVideo(c) : urls[c.id];
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = downloadName(c);
    a.click();
  };

  const renombrar = async (c: CaptureOut) => {
    const label = borrador.trim();
    setEditando(null);
    if (!label || label === c.label) return;
    try {
      const actualizada = await api.renameCapture(c.id, label);
      setRows((rs) => (rs ?? []).map((r) => (r.id === c.id ? actualizada : r)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo renombrar");
    }
  };

  const borrar = async (c: CaptureOut) => {
    try {
      await api.deleteCapture(c.id);
      const url = urls[c.id];
      if (url) URL.revokeObjectURL(url);
      setUrls((u) => { const { [c.id]: _, ...resto } = u; return resto; });
      setRows((rs) => (rs ?? []).filter((r) => r.id !== c.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo borrar");
    }
  };

  const total = rows?.length ?? 0;

  return (
    <div style={{ marginTop: 14 }}>
      <ConfirmDialog
        open={aBorrar !== null}
        title="¿Borrar la captura?"
        confirmLabel="Borrar captura"
        destructive
        onCancel={() => setABorrar(null)}
        onConfirm={() => { const c = aBorrar; setABorrar(null); if (c) void borrar(c); }}
      >
        «{aBorrar?.label ?? ""}» desaparece de la galería del caso y no se puede recuperar.
      </ConfirmDialog>
      <ErrorNote>{error}</ErrorNote>
      {rows === null ? (
        <div style={{ fontSize: 13, color: "var(--muted-foreground)" }}>Cargando…</div>
      ) : total === 0 ? (
        <div style={{ fontSize: 13, color: "var(--muted-foreground)", lineHeight: 1.5 }}>
          {emptyHint ?? "Todavía no hay capturas. El botón «Captura» del visor guarda aquí la vista cuando la sesión tiene un estudio archivado; si no, la descarga."}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(190px, 100%), 1fr))", gap: 10 }}>
          {rows.map((c) => (
            <Card key={c.id} style={{ padding: 8, display: "flex", flexDirection: "column", gap: 6 }}>
              {isRecording(c) ? (
                <div style={{ background: "var(--viewer-bg)", borderRadius: "var(--radius-md)", overflow: "hidden", aspectRatio: "16 / 10" }}>
                  {urls[c.id] ? (
                    <video src={urls[c.id]} controls autoPlay playsInline
                           aria-label={c.label}
                           style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} />
                  ) : (
                    <button type="button" onClick={() => void urlVideo(c)}
                            disabled={cargandoVideo === c.id}
                            title="Reproducir la grabación"
                            style={{ all: "unset", cursor: "pointer", width: "100%", height: "100%", display: "grid", placeItems: "center",
                                     fontSize: 13, fontFamily: "var(--font-mono)", color: "var(--data)" }}>
                      {cargandoVideo === c.id ? "Cargando…" : `▶ ${formatDuration(c.duration_s ?? 0)}`}
                    </button>
                  )}
                </div>
              ) : (
              <a href={urls[c.id]} target="_blank" rel="noreferrer"
                 title="Abrir a tamaño completo"
                 style={{ display: "block", background: "var(--viewer-bg)", borderRadius: "var(--radius-md)", overflow: "hidden", aspectRatio: "16 / 10" }}>
                {urls[c.id] ? (
                  <img src={urls[c.id]} alt={c.label}
                       style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} />
                ) : (
                  <div style={{ width: "100%", height: "100%", display: "grid", placeItems: "center",
                                fontSize: 13, color: "var(--muted-foreground)" }}>
                    Cargando…
                  </div>
                )}
              </a>
              )}

              {editando === c.id ? (
                <Input
                  autoFocus value={borrador} aria-label="Nuevo nombre de la captura"
                  onChange={(e) => setBorrador(e.target.value)}
                  onBlur={() => void renombrar(c)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void renombrar(c);
                    if (e.key === "Escape") setEditando(null);
                  }}
                />
              ) : (
                <button type="button"
                  onClick={() => { setEditando(c.id); setBorrador(c.label); }}
                  title="Renombrar"
                  style={{ all: "unset", cursor: "text", fontSize: 13, fontWeight: 600, lineHeight: 1.3,
                           color: "var(--foreground)", wordBreak: "break-word" }}>
                  {c.label}
                </button>
              )}

              <div style={{ fontSize: 13, color: "var(--muted-foreground)",
                            display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                {isRecording(c) && <Badge variant="outline">vídeo · {formatDuration(c.duration_s ?? 0)}</Badge>}
                {c.step && <Badge variant="outline">{etiquetaPaso(c.step)}</Badge>}
                <span>{fechaHora(c.created_at)}</span>
                {c.width > 0 && <span style={{ fontSize: 12, fontFamily: "var(--font-mono)" }}>{c.width}×{c.height}</span>}
                {c.size_bytes > 0 && <span style={{ fontSize: 12, fontFamily: "var(--font-mono)" }}>{humanSize(c.size_bytes)}</span>}
              </div>

              <div style={{ display: "flex", gap: 6 }}>
                <Button size="sm" variant="outline" style={{ flex: 1 }}
                  disabled={isRecording(c) ? cargandoVideo === c.id : !urls[c.id]} onClick={() => void descargar(c)}
                  leadingIcon={<Icon name="EXPORT" size={14} />}>
                  Descargar
                </Button>
                <Button size="icon" variant="destructive-ghost"
                  aria-label={`Borrar la captura «${c.label}»`} title="Borrar la captura"
                  onClick={() => setABorrar(c)}>
                  <Icon name="DELETE" size={16} />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
