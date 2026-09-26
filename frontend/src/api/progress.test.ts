import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
});
