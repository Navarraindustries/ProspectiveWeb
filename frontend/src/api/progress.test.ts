import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "./client";
import { watchProgress, type ProgressState } from "./progress";

class FakeWs {
  static instances: FakeWs[] = [];
  onmessage: ((e: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  closed = false;
  constructor(public url: string) { FakeWs.instances.push(this); }
  close() { this.closed = true; this.onclose?.(); }
  emit(s: ProgressState) { this.onmessage?.({ data: JSON.stringify(s) }); }
}

const running = (phase: string, pct: number): ProgressState => ({ phase, pct, running: true, ok: null, message: "" });
const done: ProgressState = { phase: "guardado", pct: 100, running: false, ok: true, message: "" };

describe("watchProgress", () => {
  beforeEach(() => { FakeWs.instances = []; vi.useFakeTimers(); });
  afterEach(() => vi.useRealTimers());

  it("relays WebSocket states and stops when the job finishes", () => {
    const seen: ProgressState[] = [];
    const stop = watchProgress("sid", (s) => seen.push(s), { wsFactory: (u) => new FakeWs(u) as unknown as WebSocket, fetchState: async () => done });
    const ws = FakeWs.instances[0];
    expect(ws.url).toMatch(/\/ws\/progress\/sid\?token=/);
    ws.emit(running("tubularidad 2/6", 20));
    ws.emit(done);
    expect(seen.map((s) => s.phase)).toEqual(["tubularidad 2/6", "guardado"]);
    expect(ws.closed).toBe(true);
    stop();
  });

  it("vuelve al GET cuando el WebSocket falla", async () => {
    const states = [running("núcleo", 2), running("superficie", 90), done];
    const fetchState = vi.fn(async () => states.shift() ?? done);
    const seen: ProgressState[] = [];
    watchProgress("sid", (s) => seen.push(s), { pollMs: 100, wsFactory: (u) => new FakeWs(u) as unknown as WebSocket, fetchState });
    FakeWs.instances[0].onerror?.();
    await vi.advanceTimersByTimeAsync(350);
    expect(fetchState).toHaveBeenCalled();
    expect(seen.map((s) => s.phase)).toEqual(["núcleo", "superficie", "guardado"]);
    await vi.advanceTimersByTimeAsync(500);
    expect(fetchState).toHaveBeenCalledTimes(3);   // se detiene al terminar
  });

  it("stop() cierra el socket y para el polling", async () => {
    const fetchState = vi.fn(async () => running("x", 1));
    const stop = watchProgress("sid", () => {}, { pollMs: 100, wsFactory: (u) => new FakeWs(u) as unknown as WebSocket, fetchState });
    FakeWs.instances[0].onerror?.();
    await vi.advanceTimersByTimeAsync(150);
    stop();
    const n = fetchState.mock.calls.length;
    await vi.advanceTimersByTimeAsync(500);
    expect(fetchState.mock.calls.length).toBe(n);
  });

  it("tras 5 fallos seguidos del GET, emite un estado terminal y deja de sondear", async () => {
    const fetchState = vi.fn(async () => { throw new Error("network"); });
    const seen: ProgressState[] = [];
    watchProgress("sid", (s) => seen.push(s), { pollMs: 100, wsFactory: (u) => new FakeWs(u) as unknown as WebSocket, fetchState });
    FakeWs.instances[0].onerror?.();
    await vi.advanceTimersByTimeAsync(500);
    expect(fetchState).toHaveBeenCalledTimes(5);
    expect(seen).toEqual([{ phase: "", pct: 0, running: false, ok: false, message: "Sin conexión con el progreso del servidor" }]);
    await vi.advanceTimersByTimeAsync(2000);
    expect(fetchState).toHaveBeenCalledTimes(5);   // no sigue sondeando tras el estado terminal
  });

  it("un 401 del GET para el sondeo de inmediato, sin agotar los 5 reintentos", async () => {
    const fetchState = vi.fn(async () => { throw new ApiError(401, "no autorizado"); });
    const seen: ProgressState[] = [];
    watchProgress("sid", (s) => seen.push(s), { pollMs: 100, wsFactory: (u) => new FakeWs(u) as unknown as WebSocket, fetchState });
    FakeWs.instances[0].onerror?.();
    await vi.advanceTimersByTimeAsync(50);
    expect(fetchState).toHaveBeenCalledTimes(1);
    expect(seen).toEqual([{ phase: "", pct: 0, running: false, ok: false, message: "Sin conexión con el progreso del servidor" }]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchState).toHaveBeenCalledTimes(1);
  });

  it("dos fallos seguidos de un éxito no cuentan como fallo definitivo", async () => {
    let calls = 0;
    const fetchState = vi.fn(async () => {
      calls += 1;
      if (calls <= 2) throw new Error("network");
      return running("recuperado", 50);
    });
    const seen: ProgressState[] = [];
    watchProgress("sid", (s) => seen.push(s), { pollMs: 100, wsFactory: (u) => new FakeWs(u) as unknown as WebSocket, fetchState });
    FakeWs.instances[0].onerror?.();
    await vi.advanceTimersByTimeAsync(250);
    expect(seen.map((s) => s.phase)).toEqual(["recuperado"]);
    expect(seen.some((s) => s.ok === false)).toBe(false);
  });

  it("un sondeo en vuelo no emite nada después de llamar a stop() (fallo duro)", async () => {
    let rejectFetch!: (err: unknown) => void;
    const fetchState = vi.fn(() => new Promise<ProgressState>((_res, rej) => { rejectFetch = rej; }));
    const onState = vi.fn();
    const stop = watchProgress("sid", onState, { pollMs: 100, wsFactory: (u) => new FakeWs(u) as unknown as WebSocket, fetchState });
    FakeWs.instances[0].onerror?.();
    expect(fetchState).toHaveBeenCalledTimes(1);   // el GET quedó pendiente
    stop();
    rejectFetch(new ApiError(401, "no autorizado"));   // llegaría tarde: la sesión ya no existe para el vigilante
    await vi.advanceTimersByTimeAsync(1000);
    expect(onState).not.toHaveBeenCalled();
  });

  it("un sondeo en vuelo no emite nada después de llamar a stop() (éxito)", async () => {
    let resolveFetch!: (s: ProgressState) => void;
    const fetchState = vi.fn(() => new Promise<ProgressState>((res) => { resolveFetch = res; }));
    const onState = vi.fn();
    const stop = watchProgress("sid", onState, { pollMs: 100, wsFactory: (u) => new FakeWs(u) as unknown as WebSocket, fetchState });
    FakeWs.instances[0].onerror?.();
    stop();
    resolveFetch(running("tarde", 50));
    await vi.advanceTimersByTimeAsync(1000);
    expect(onState).not.toHaveBeenCalled();
  });

  it("ignora el final del trabajo anterior que llega por el WebSocket y sigue vigilando", async () => {
    const failedBefore: ProgressState = { phase: "tubularidad", pct: 30, running: false, ok: false, message: "viejo" };
    const states = [running("carga", 5), done];
    const fetchState = vi.fn(async () => states.shift() ?? done);
    const seen: ProgressState[] = [];
    watchProgress("sid", (s) => seen.push(s), { pollMs: 100, wsFactory: (u) => new FakeWs(u) as unknown as WebSocket, fetchState });
    const ws = FakeWs.instances[0];
    ws.emit(done);          // final del trabajo anterior: ni se emite ni para
    ws.emit(failedBefore);  // tampoco un fallo viejo
    expect(seen).toEqual([]);
    ws.onclose?.();         // el servidor cierra tras un estado terminal
    await vi.advanceTimersByTimeAsync(350);
    expect(seen.map((s) => s.phase)).toEqual(["carga", "guardado"]);
    await vi.advanceTimersByTimeAsync(500);
    expect(fetchState).toHaveBeenCalledTimes(2);   // ahora sí se detiene
  });

  it("el WebSocket releva el trabajo nuevo aunque antes llegue el final viejo", () => {
    const seen: ProgressState[] = [];
    const stop = watchProgress("sid", (s) => seen.push(s), { wsFactory: (u) => new FakeWs(u) as unknown as WebSocket, fetchState: async () => done });
    const ws = FakeWs.instances[0];
    ws.emit(done);
    ws.emit(running("tubularidad 1/6", 10));
    expect(ws.closed).toBe(false);
    ws.emit(done);
    expect(seen.map((s) => s.phase)).toEqual(["tubularidad 1/6", "guardado"]);
    expect(ws.closed).toBe(true);
    stop();
  });

  it("el GET que devuelve el final viejo sigue sondeando hasta ver el trabajo nuevo", async () => {
    const states = [done, done, running("núcleo", 3)];
    const fetchState = vi.fn(async () => states.shift() ?? running("núcleo", 4));
    const seen: ProgressState[] = [];
    const stop = watchProgress("sid", (s) => seen.push(s), { pollMs: 100, wsFactory: (u) => new FakeWs(u) as unknown as WebSocket, fetchState });
    FakeWs.instances[0].onerror?.();
    await vi.advanceTimersByTimeAsync(250);
    expect(fetchState.mock.calls.length).toBeGreaterThanOrEqual(3);
    expect(seen[0].phase).toBe("núcleo");
    expect(seen.some((s) => !s.running)).toBe(false);
    stop();
  });
});
