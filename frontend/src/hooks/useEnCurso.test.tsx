import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useEnCurso } from "./useEnCurso";

describe("useEnCurso", () => {
  it("está en curso hasta que la promesa se resuelve y ignora un segundo lanzamiento", async () => {
    let resolver!: () => void;
    const accion = vi.fn(() => new Promise<void>((r) => { resolver = r; }));
    const { result } = renderHook(() => useEnCurso());
    expect(result.current[0]).toBe(false);
    act(() => { result.current[1](accion); result.current[1](accion); });
    expect(result.current[0]).toBe(true);
    expect(accion).toHaveBeenCalledTimes(1);
    await act(async () => { resolver(); });
    expect(result.current[0]).toBe(false);
  });
  it("vuelve a false si la acción rechaza o lanza", async () => {
    const { result } = renderHook(() => useEnCurso());
    await act(async () => { result.current[1](() => Promise.reject(new Error("x"))); });
    expect(result.current[0]).toBe(false);
    await act(async () => { result.current[1](() => { throw new Error("y"); }); });
    expect(result.current[0]).toBe(false);
  });
  it("una acción síncrona también termina", async () => {
    const { result } = renderHook(() => useEnCurso());
    await act(async () => { result.current[1](() => 1); });
    expect(result.current[0]).toBe(false);
  });
  it("no toca el estado tras desmontar", async () => {
    let resolver!: () => void;
    const { result, unmount } = renderHook(() => useEnCurso());
    act(() => { result.current[1](() => new Promise<void>((r) => { resolver = r; })); });
    unmount();
    await act(async () => { resolver(); });
    expect(result.current[0]).toBe(true);
  });
});
