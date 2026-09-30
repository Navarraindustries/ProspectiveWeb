import { describe, expect, it, vi } from "vitest";
import {
  MAX_RECORDING_MS, outputSize, pickMimeType, recordingFileName, startRecording,
  type FrameSource, type RecorderDeps,
} from "./viewerRecorder";

function dobles(soporta: (m: string) => boolean = (m) => m.startsWith("video/mp4")) {
  let t = 0;
  let pendiente: (() => void) | null = null;
  const pintados: string[] = [];
  const recorder = {
    state: "inactive",
    ondataavailable: null as ((e: { data: Blob }) => void) | null,
    onstop: null as (() => void) | null,
    start: vi.fn(function (this: { state: string }) { recorder.state = "recording"; }),
    stop: vi.fn(() => {
      recorder.state = "inactive";
      recorder.ondataavailable?.({ data: new Blob(["trozo"]) });
      recorder.onstop?.();
    }),
  };
  const ctx = {
    fillStyle: "", strokeStyle: "", font: "", textAlign: "left", textBaseline: "top",
    fillRect: vi.fn(), fillText: vi.fn((s: string) => pintados.push(s)),
    drawImage: vi.fn(), setTransform: vi.fn(),
  };
  const deps: RecorderDeps = {
    makeCanvas: vi.fn(() => ({ ctx: ctx as never, stream: "stream" })),
    makeRecorder: vi.fn(() => recorder),
    isTypeSupported: soporta,
    every: (_ms, cb) => { pendiente = cb; return 1; },
    cancel: () => { pendiente = null; },
    now: () => t,
    devicePixelRatio: () => 1,
  };
  return {
    deps, recorder, ctx, pintados,
    avanzar: (ms: number) => { t += ms; pendiente?.(); },
  };
}

function visor(grab = vi.fn(() => true)): FrameSource & { grab: typeof grab } {
  return {
    grab,
    read: () => ({
      width: 800, height: 600,
      panes: [{ id: "scene", rect: { x: 0, y: 0, w: 800, h: 600 }, label: "ESCENA", readouts: [{ at: "tl", lines: ["DER"] }] }],
      heading: "AZ 10°", colors: { hud: "#0f0", dim: "#080", gap: "#040" }, fontFamily: "mono",
      grabs: [grab],
    }),
  };
}

describe("formato", () => {
  it("prefiere MP4 y cae a WebM", () => {
    expect(pickMimeType((m) => m.startsWith("video/mp4"))).toMatch(/^video\/mp4/);
    expect(pickMimeType((m) => m === "video/webm")).toBe("video/webm");
    expect(pickMimeType(() => false)).toBeNull();
  });

  it("dimensiones pares y sin pasar de 1920 de ancho", () => {
    const s = outputSize(2561, 1441, 2);
    expect(s.w).toBeLessThanOrEqual(1920);
    expect(s.w % 2).toBe(0);
    expect(s.h % 2).toBe(0);
    expect(outputSize(801, 601, 1)).toMatchObject({ w: 800, h: 600 });
  });

  it("el nombre del fichero no lleva nada del paciente", () => {
    expect(recordingFileName("video/mp4", new Date(2026, 8, 30, 9, 5, 7))).toBe("prospective-20260930-090507.mp4");
    expect(recordingFileName("video/webm")).toMatch(/\.webm$/);
  });
});

describe("grabar", () => {
  it("sin soporte de vídeo lo dice en vez de fallar a medias", () => {
    const d = dobles(() => false);
    expect(() => startRecording(visor(), {}, d.deps)).toThrow(/navegador/);
  });

  it("pinta los paneles con grab y el HUD encima, sin audio", async () => {
    const d = dobles();
    const v = visor();
    const rec = startRecording(v, {}, d.deps);
    expect(d.recorder.start).toHaveBeenCalled();
    d.avanzar(40);
    d.avanzar(40);
    expect(v.grab).toHaveBeenCalled();
    expect(d.pintados).toContain("ESCENA");
    expect(d.pintados).toContain("DER");
    const r = await rec.stop();
    expect(r.mimeType).toBe("video/mp4");
    expect(r.blob.size).toBeGreaterThan(0);
    expect(r.hitLimit).toBe(false);
    expect(d.deps.makeRecorder).toHaveBeenCalledWith("stream", expect.stringMatching(/^video\/mp4/), expect.any(Number));
  });

  it("no pinta más de lo que pide el fps", () => {
    const d = dobles();
    const v = visor();
    startRecording(v, { fps: 10 }, d.deps);
    const antes = v.grab.mock.calls.length;
    for (let i = 0; i < 10; i++) d.avanzar(10);   // 100 ms a 10 fps: uno o dos
    expect(v.grab.mock.calls.length - antes).toBeLessThanOrEqual(2);
  });

  it("se para sola al tope y avisa", async () => {
    const d = dobles();
    const onLimit = vi.fn();
    startRecording(visor(), { onLimit }, d.deps);
    d.avanzar(MAX_RECORDING_MS + 10);
    expect(onLimit).toHaveBeenCalledTimes(1);
    const r = await onLimit.mock.calls[0][0];
    expect(r.hitLimit).toBe(true);
    expect(r.durationS).toBeCloseTo(180, 0);
  });

  it("parar dos veces entrega el mismo vídeo", async () => {
    const d = dobles();
    const rec = startRecording(visor(), {}, d.deps);
    const a = rec.stop();
    const b = rec.stop();
    expect(a).toBe(b);
    await a;
    expect(d.recorder.stop).toHaveBeenCalledTimes(1);
  });

  it("un panel que no se deja copiar queda en negro con aviso", () => {
    const d = dobles();
    startRecording(visor(vi.fn(() => false)), {}, d.deps);
    expect(d.pintados).toContain("SIN IMAGEN");
  });
});
