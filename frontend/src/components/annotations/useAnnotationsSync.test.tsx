/* Guardado automático de las anotaciones: un PUT por ráfaga de cambios, el
   error no toca el store, flush espera al vuelo y reanudar no guarda nada. */

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Annotation } from "../../vtk/annotations";

vi.mock("../../api/client", () => ({ api: { putAnnotations: vi.fn() } }));

import { api } from "../../api/client";
import { useAnnotationsSync } from "./useAnnotationsSync";

const regla = (id: string, label = "R1", created_by = ""): Annotation => ({
  id, kind: "regla", points: [[0, 0, 0], [5, 0, 0]], plane: null, label, note: "",
  visible: true, created_at: "2026-10-08T10:00:00Z", created_by,
});

type Props = { sid: string | null; list: Annotation[] };

function montar(initial: Props) {
  const setSync = vi.fn();
  const loadedRef = { current: null as Annotation[] | null };
  const setLoaded = vi.fn((a: Annotation[]) => { loadedRef.current = a; });
  const hook = renderHook(
    ({ sid, list }: Props) => useAnnotationsSync(sid, list, setSync, loadedRef, setLoaded),
    { initialProps: initial },
  );
  return { ...hook, setSync, setLoaded, loadedRef };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(api.putAnnotations).mockReset();
});
afterEach(() => vi.useRealTimers());

describe("useAnnotationsSync", () => {
  it("dos cambios en 300 ms dan un solo PUT con la lista final", async () => {
    vi.mocked(api.putAnnotations).mockImplementation(async (_s, l) => l);
    const { rerender, setSync } = montar({ sid: "s1", list: [] });
    const a = [regla("a")];
    rerender({ sid: "s1", list: a });
    act(() => { vi.advanceTimersByTime(300); });
    const b = [regla("a"), regla("b", "R2")];
    rerender({ sid: "s1", list: b });
    expect(setSync).toHaveBeenLastCalledWith("guardando");
    await act(async () => { await vi.advanceTimersByTimeAsync(600); });
    expect(api.putAnnotations).toHaveBeenCalledTimes(1);
    expect(api.putAnnotations).toHaveBeenCalledWith("s1", b);
    expect(setSync).toHaveBeenLastCalledWith("guardado");
  });

  it("un PUT que falla deja «error» y no toca el store", async () => {
    vi.mocked(api.putAnnotations).mockRejectedValue(new Error("500"));
    const { rerender, setSync, setLoaded } = montar({ sid: "s1", list: [] });
    rerender({ sid: "s1", list: [regla("a")] });
    await act(async () => { await vi.advanceTimersByTimeAsync(600); });
    expect(setSync).toHaveBeenLastCalledWith("error");
    expect(setLoaded).not.toHaveBeenCalled();
  });

  it("flush adelanta el PUT pendiente y resuelve cuando termina", async () => {
    let resolve!: (l: Annotation[]) => void;
    vi.mocked(api.putAnnotations).mockImplementation(() => new Promise((r) => { resolve = r; }));
    const { rerender, result } = montar({ sid: "s1", list: [] });
    const a = [regla("a")];
    rerender({ sid: "s1", list: a });
    let done = false;
    let p!: Promise<void>;
    act(() => { p = result.current.flush().then(() => { done = true; }); });
    await act(async () => { await Promise.resolve(); });
    expect(api.putAnnotations).toHaveBeenCalledWith("s1", a);
    expect(done).toBe(false);
    await act(async () => { resolve(a); await p; });
    expect(done).toBe(true);
    // El temporizador ya no dispara otro PUT.
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(api.putAnnotations).toHaveBeenCalledTimes(1);
  });

  it("sin sesión no llama", async () => {
    const { rerender } = montar({ sid: null, list: [] });
    rerender({ sid: null, list: [regla("a")] });
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(api.putAnnotations).not.toHaveBeenCalled();
  });

  it("lo cargado al reanudar no se vuelve a guardar", async () => {
    const { rerender, loadedRef } = montar({ sid: null, list: [] });
    rerender({ sid: "s1", list: [] });
    const loaded = [regla("a", "R1", "admin")];
    loadedRef.current = loaded;
    rerender({ sid: "s1", list: loaded });
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(api.putAnnotations).not.toHaveBeenCalled();
  });

  it("cambiar de sesión no guarda la lista de la anterior", async () => {
    const { rerender } = montar({ sid: "s1", list: [regla("a")] });
    rerender({ sid: "s2", list: [] });
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(api.putAnnotations).not.toHaveBeenCalled();
  });

  it("el autor que pone el servidor vuelve al store sin otro PUT", async () => {
    const a = [regla("a")];
    const server = [regla("a", "R1", "admin")];
    vi.mocked(api.putAnnotations).mockResolvedValue(server);
    const { rerender, setLoaded } = montar({ sid: "s1", list: [] });
    rerender({ sid: "s1", list: a });
    await act(async () => { await vi.advanceTimersByTimeAsync(600); });
    expect(setLoaded).toHaveBeenCalledWith(server);
    rerender({ sid: "s1", list: server });
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(api.putAnnotations).toHaveBeenCalledTimes(1);
  });
});
