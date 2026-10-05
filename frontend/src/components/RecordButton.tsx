/* «● Grabar» del topbar: graba el visor en vídeo.

   Vive al lado de «Captura» por la misma razón que ella: es donde se busca
   «guardar algo de este caso», y el visor está en todos los pasos.

   Al parar hace las dos cosas a la vez, porque los tres usos que se pidieron
   las necesitan: se DESCARGA al momento (presentar, enviar a un colega) y se
   GUARDA en el estudio de imagen como una captura más (el historial del
   caso). Sin estudio archivado solo se descarga, y lo dice.

   Si el profesional se va del visor grabando, la grabación se cierra y se
   descarga igual: perderla sin avisar sería peor que un fichero de más. */

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import { usePlanning } from "../store/planning";
import { STEPS } from "../pipeline/steps";
import {
  MAX_RECORDING_MS, recordingFileName, startRecording,
  type Recording, type RecordingResult,
} from "../vtk/viewerRecorder";
import { Button } from "./Button";
import { Icon } from "./Icon";

type Estado = "idle" | "rec" | "saving";

export function formatElapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/** Descarga un Blob con un nombre, sin datos del paciente. */
export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function RecordButton({ step, onMessage }: {
  step: string;
  /** Qué pasó al terminar: error o aviso, para la franja de avisos del topbar. */
  onMessage: (m: { tone: "ok" | "err"; text: string } | null) => void;
}) {
  const { viewerRecording, imagingStudyId, sessionId } = usePlanning();
  const [estado, setEstado] = useState<Estado>("idle");
  const [ms, setMs] = useState(0);
  const rec = useRef<Recording | null>(null);
  // Lo que se necesita al terminar, leído entonces y no al empezar.
  const ctx = useRef({ imagingStudyId, sessionId, step, viewerRecording });
  ctx.current = { imagingStudyId, sessionId, step, viewerRecording };

  const terminar = useCallback(async (resultado: Promise<RecordingResult>) => {
    rec.current = null;
    setEstado("saving");
    let r: RecordingResult;
    try {
      r = await resultado;
    } catch (e) {
      setEstado("idle");
      onMessage({ tone: "err", text: `No se pudo cerrar la grabación: ${e instanceof Error ? e.message : e}` });
      return;
    }
    if (r.blob.size === 0) {
      setEstado("idle");
      onMessage({ tone: "err", text: "La grabación salió vacía: el navegador no entregó ningún fotograma." });
      return;
    }
    downloadBlob(r.blob, recordingFileName(r.mimeType));
    const { imagingStudyId: estudio, sessionId: sesion, step: paso, viewerRecording: fuente } = ctx.current;
    const aviso = r.hitLimit ? " Se paró sola al llegar a los 3 minutos." : "";
    if (!estudio) {
      setEstado("idle");
      onMessage({ tone: "err", text: `Vídeo descargado, pero no guardado en el caso: usa «Adjuntar a un caso» para que las siguientes se guarden en él.${aviso}` });
      return;
    }
    try {
      const ahora = new Date();
      await api.saveRecording(r.blob, {
        imaging_study_id: estudio,
        session_id: sesion ?? "",
        step: paso,
        label: `Grabación · ${STEPS.find((x) => x.key === paso)?.label ?? ""} · ${ahora.toLocaleString("es", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}`,
        width: r.width,
        height: r.height,
        duration_s: r.durationS,
        state: fuente?.state() ?? {},
      });
      onMessage({ tone: "ok", text: `Grabación de ${formatElapsed(r.durationS * 1000)} guardada en el caso y descargada.${aviso}` });
    } catch (e) {
      onMessage({ tone: "err", text: `Vídeo descargado, pero no se guardó en el caso: ${e instanceof Error ? e.message : e}` });
    } finally {
      setEstado("idle");
    }
  }, [onMessage]);

  const empezar = () => {
    const fuente = ctx.current.viewerRecording;
    if (!fuente) return;
    onMessage(null);
    try {
      rec.current = startRecording(fuente, {
        maxMs: MAX_RECORDING_MS,
        onLimit: (r) => void terminar(r),
      });
      setMs(0);
      setEstado("rec");
    } catch (e) {
      onMessage({ tone: "err", text: e instanceof Error ? e.message : "No se pudo empezar a grabar." });
    }
  };

  const parar = () => {
    const r = rec.current;
    if (r) void terminar(r.stop());
  };

  // El contador, dos veces por segundo mientras graba.
  useEffect(() => {
    if (estado !== "rec") return;
    const id = setInterval(() => setMs(rec.current?.elapsedMs() ?? 0), 500);
    return () => clearInterval(id);
  }, [estado]);

  // Se va el visor (otra página, otro paso sin visor): se cierra y se entrega.
  useEffect(() => {
    if (!viewerRecording && rec.current) parar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewerRecording]);
  // Por ref y con dependencias vacías: si dependiera de `terminar`, un
  // `onMessage` nuevo en un render cerraría la grabación a mitad.
  const terminarRef = useRef(terminar);
  terminarRef.current = terminar;
  useEffect(() => () => { if (rec.current) void terminarRef.current(rec.current.stop()); }, []);

  if (estado === "rec") {
    return (
      <Button variant="outline" size="sm" onClick={parar}
              title="Parar y descargar; se guarda también en el caso"
              leadingIcon={<Icon name="STOP" color="var(--destructive)" />}
              style={{ marginRight: 8, color: "var(--destructive)", borderColor: "var(--destructive)" }}>
        <span aria-live="polite">REC {formatElapsed(ms)} · Detener</span>
      </Button>
    );
  }
  return (
    <Button variant="outline" size="sm" onClick={empezar}
            disabled={!viewerRecording || estado === "saving"}
            title={!viewerRecording
              ? "Abre un paso con el visor para grabarlo"
              : `Graba el visor en vídeo (máx. ${MAX_RECORDING_MS / 60000} min), sin audio ni datos del paciente`}
            leadingIcon={<Icon name="RECORD" color={viewerRecording ? "var(--destructive)" : undefined} />}
            style={{ marginRight: 8 }}>
      {estado === "saving" ? "Guardando vídeo…" : "Grabar"}
    </Button>
  );
}
