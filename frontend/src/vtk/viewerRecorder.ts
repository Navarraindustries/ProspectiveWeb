/* Grabar el visor en vídeo.

   Es la captura hecha en continuo. Cada fotograma se pinta con `paintFrame`,
   el mismo código que la captura, en un lienzo 2D propio que el navegador
   graba con `MediaRecorder`: así una imagen y un vídeo del mismo visor no
   pueden diferir, y el vídeo lleva lo mismo que la captura —paneles en su
   sitio, orientación, cortes y medidas— y NADA del paciente. Por eso se graba
   el visor y no la pantalla: la barra de arriba lleva su nombre, y un vídeo
   se reenvía sin pensarlo.

   Los paneles se copian con `grab` (captureRenderWindow): dibujar y copiar
   en la misma tarea, porque vtk.js no conserva el búfer entre fotogramas.

   Sin audio a propósito: la voz del profesional en el estudio del paciente es
   otra decisión, y se tomó que no.

   Todo lo del navegador entra por `deps`, para poder probar la secuencia —
   empezar, pintar, cortar a los tres minutos, entregar el vídeo— sin él. */

import type { GrabFn } from "./captureRenderWindow";
import { paintFrame, type Ctx2D, type FrameLayout } from "./composeCapture";

/** Lo que el visor da en cada fotograma: su distribución y cómo copiar cada panel. */
export interface FrameSource {
  /** null si el visor ya no está (se cambió de página): se pinta el anterior. */
  read: () => (FrameLayout & { grabs: (GrabFn | null)[] }) | null;
}

export interface RecordingResult {
  blob: Blob;
  mimeType: string;
  durationS: number;
  width: number;
  height: number;
  /** Se paró sola al llegar al tope. */
  hitLimit: boolean;
}

export interface Recording {
  /** Para y entrega el vídeo. Llamarla dos veces devuelve el mismo. */
  stop: () => Promise<RecordingResult>;
  /** Milisegundos grabados, para el contador. */
  elapsedMs: () => number;
  mimeType: string;
}

export interface RecorderOptions {
  fps?: number;
  /** Tope de duración: al llegar se para sola y avisa por `onLimit`. */
  maxMs?: number;
  bitsPerSecond?: number;
  maxWidth?: number;
  onLimit?: (r: Promise<RecordingResult>) => void;
}

interface RecorderLike {
  start: (timesliceMs?: number) => void;
  stop: () => void;
  state: string;
  ondataavailable: ((e: { data: Blob }) => void) | null;
  onstop: (() => void) | null;
}

/** El contexto del lienzo de grabación: el de la captura, más escalar. */
export type RecCtx = Ctx2D & { setTransform: (a: number, b: number, c: number, d: number, e: number, f: number) => void };

export interface RecorderDeps {
  makeCanvas: (w: number, h: number) => { ctx: RecCtx; stream: unknown };
  makeRecorder: (stream: unknown, mimeType: string, bitsPerSecond: number) => RecorderLike;
  isTypeSupported: (mime: string) => boolean;
  /** Llama a `cb` cada `ms`. Un temporizador y no requestAnimationFrame: en una
   *  pestaña oculta rAF se detiene del todo (medido: 0 llamadas en 2 s) y el
   *  vídeo salía vacío; un intervalo sigue, al menos una vez por segundo. */
  every: (ms: number, cb: () => void) => number;
  cancel: (id: number) => void;
  now: () => number;
  devicePixelRatio: () => number;
}

/** Por orden de preferencia: MP4 se abre en cualquier sitio; WebM es lo que
 *  graba Firefox. Chrome y Edge graban MP4 (H.264) desde la 126. */
export const MIME_CANDIDATES = [
  "video/mp4;codecs=avc1.42E01E",
  "video/mp4",
  "video/webm;codecs=vp9",
  "video/webm;codecs=vp8",
  "video/webm",
];

export function pickMimeType(isTypeSupported: (m: string) => boolean): string | null {
  return MIME_CANDIDATES.find((m) => {
    try { return isTypeSupported(m); } catch { return false; }
  }) ?? null;
}

/** Tamaño del vídeo: el del visor en píxeles reales, sin pasar de `maxWidth`.
 *  Pares, porque H.264 no admite dimensiones impares. */
export function outputSize(cssW: number, cssH: number, dpr: number, maxWidth = 1920): { w: number; h: number; scale: number } {
  const scale = Math.min(Math.max(dpr, 1), maxWidth / Math.max(cssW, 1));
  const par = (v: number) => Math.max(2, Math.floor(v / 2) * 2);
  return { w: par(cssW * scale), h: par(cssH * scale), scale };
}

export const MAX_RECORDING_MS = 3 * 60 * 1000;

/** Empieza a grabar. Lanza si el navegador no sabe grabar vídeo. */
export function startRecording(src: FrameSource, opts: RecorderOptions = {}, deps: RecorderDeps = browserRecorderDeps): Recording {
  const fps = opts.fps ?? 30;
  const maxMs = opts.maxMs ?? MAX_RECORDING_MS;
  const mime = pickMimeType(deps.isTypeSupported);
  if (!mime) throw new Error("Este navegador no puede grabar vídeo. Usa Chrome o Edge actualizados.");

  const primero = src.read();
  if (!primero || primero.width <= 0 || primero.height <= 0) throw new Error("No hay visor que grabar.");
  const size = outputSize(primero.width, primero.height, deps.devicePixelRatio(), opts.maxWidth);
  const { ctx, stream } = deps.makeCanvas(size.w, size.h);
  const recorder = deps.makeRecorder(stream, mime, opts.bitsPerSecond ?? 2_500_000);

  const trozos: Blob[] = [];
  recorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) trozos.push(e.data); };

  const t0 = deps.now();
  let fin: number | null = null;
  let ultimo = -Infinity;
  let timerId = 0;
  let resultado: Promise<RecordingResult> | null = null;
  let tope = false;

  const pintar = () => {
    const f = src.read();
    if (!f || f.width <= 0 || f.height <= 0) return;   // se queda el fotograma anterior
    // Si el visor cambia de tamaño a mitad (se oculta la franja, se redimensiona
    // la ventana), se ajusta dentro del vídeo sin deformar.
    const s = Math.min(size.w / f.width, size.h / f.height);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, size.w, size.h);
    ctx.setTransform(s, 0, 0, s, (size.w - f.width * s) / 2, (size.h - f.height * s) / 2);
    paintFrame(ctx, f, (i, r) => f.grabs[i]?.(ctx as unknown as CanvasRenderingContext2D, r) ?? false);
  };

  const bucle = () => {
    const t = deps.now();
    if (t - t0 >= maxMs) {
      tope = true;
      const r = parar();
      opts.onLimit?.(r);
      return;
    }
    if (t - ultimo >= 1000 / fps - 2) {
      ultimo = t;
      pintar();
    }
  };

  const parar = (): Promise<RecordingResult> => {
    if (resultado) return resultado;
    fin = deps.now();
    deps.cancel(timerId);
    resultado = new Promise<RecordingResult>((resolve) => {
      recorder.onstop = () => resolve({
        blob: new Blob(trozos, { type: mime.split(";")[0] }),
        mimeType: mime.split(";")[0],
        durationS: Math.round(((fin ?? deps.now()) - t0) / 100) / 10,
        width: size.w,
        height: size.h,
        hitLimit: tope,
      });
      if (recorder.state !== "inactive") recorder.stop();
      else recorder.onstop?.();
    });
    return resultado;
  };

  pintar();                 // el primer fotograma, antes de arrancar
  recorder.start(1000);     // un trozo por segundo: si algo falla, no se pierde todo
  timerId = deps.every(Math.round(1000 / fps), bucle);

  return {
    stop: parar,
    elapsedMs: () => (fin ?? deps.now()) - t0,
    mimeType: mime.split(";")[0],
  };
}

export const browserRecorderDeps: RecorderDeps = {
  makeCanvas: (w, h) => {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("sin contexto 2D para grabar");
    return { ctx: ctx as unknown as RecCtx, stream: canvas.captureStream() };
  },
  makeRecorder: (stream, mimeType, bitsPerSecond) =>
    new MediaRecorder(stream as MediaStream, { mimeType, videoBitsPerSecond: bitsPerSecond }) as unknown as RecorderLike,
  isTypeSupported: (m) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m),
  every: (ms, cb) => window.setInterval(cb, ms),
  cancel: (id) => window.clearInterval(id),
  now: () => performance.now(),
  devicePixelRatio: () => window.devicePixelRatio || 1,
};

/** Un nombre de fichero sin datos del paciente: fecha y hora, nada más. */
export function recordingFileName(mimeType: string, when: Date = new Date()): string {
  return `${sello(when)}.${mimeType.includes("mp4") ? "mp4" : "webm"}`;
}

/** Lo mismo para una captura que se descarga: fecha y hora, nada del paciente. */
export function captureFileName(when: Date = new Date()): string {
  return `${sello(when)}.png`;
}

function sello(when: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `prospective-${when.getFullYear()}${p(when.getMonth() + 1)}${p(when.getDate())}-${p(when.getHours())}${p(when.getMinutes())}${p(when.getSeconds())}`;
}
