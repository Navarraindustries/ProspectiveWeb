/* F1-8: un 500 suelto en la meta del volumen dejaba el visor en «CARGANDO…»
   para siempre: el error se tragaba y nadie volvía a pedirla. Ahora se
   reintenta tres veces (1, 2 y 4 s) y, si sigue fallando, hay un `error` que
   el visor enseña con «Reintentar». */
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const volumeMeta = vi.fn();
vi.mock("../api/client", () => ({
  api: { volumeMeta: (...a: unknown[]) => volumeMeta(...a) },
}));

import { useVolumeMeta } from "./useVolumeMeta";

const META = { shape: [10, 20, 30], spacing: [1, 1, 1], wc: 40, ww: 400 };
const fallo = () => Promise.reject(new Error("Error 500"));

beforeEach(() => {
  vi.useFakeTimers();
  volumeMeta.mockReset();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("useVolumeMeta", () => {
  it("un 500 y luego un 200 carga la meta sin error", async () => {
    volumeMeta.mockImplementationOnce(fallo).mockResolvedValueOnce(META);
    const { result } = renderHook(() => useVolumeMeta("s1"));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(result.current.meta).toBeNull();
    expect(result.current.error).toBeNull();

    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(volumeMeta).toHaveBeenCalledTimes(2);
    expect(result.current.meta).toEqual(META);
    expect(result.current.error).toBeNull();
  });

  it("tres reintentos (1, 2 y 4 s) y después el error", async () => {
    volumeMeta.mockImplementation(fallo);
    const { result } = renderHook(() => useVolumeMeta("s1"));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(volumeMeta).toHaveBeenCalledTimes(1);

    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(volumeMeta).toHaveBeenCalledTimes(2);
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(volumeMeta).toHaveBeenCalledTimes(3);
    expect(result.current.error).toBeNull();          // aún reintentando
    await act(async () => { await vi.advanceTimersByTimeAsync(4000); });
    expect(volumeMeta).toHaveBeenCalledTimes(4);
    expect(result.current.error).toBe("Error 500");
    expect(result.current.meta).toBeNull();

    // No sigue pidiendo por su cuenta: la persona decide con «Reintentar».
    await act(async () => { await vi.advanceTimersByTimeAsync(30000); });
    expect(volumeMeta).toHaveBeenCalledTimes(4);
  });

  it("«Reintentar» vuelve a pedirla y quita el error", async () => {
    volumeMeta.mockImplementation(fallo);
    const { result } = renderHook(() => useVolumeMeta("s1"));
    await act(async () => { await vi.advanceTimersByTimeAsync(7000); });
    expect(result.current.error).not.toBeNull();

    volumeMeta.mockReset().mockResolvedValue(META);
    await act(async () => { result.current.retry(); await vi.advanceTimersByTimeAsync(0); });
    expect(volumeMeta).toHaveBeenCalledTimes(1);
    expect(result.current.error).toBeNull();
    expect(result.current.meta).toEqual(META);
  });

  it("cambiar de sesión cancela los reintentos de la anterior", async () => {
    volumeMeta.mockImplementation(fallo);
    const { rerender } = renderHook(({ sid }) => useVolumeMeta(sid), { initialProps: { sid: "s1" } });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    volumeMeta.mockReset().mockResolvedValue(META);
    rerender({ sid: "s2" });
    await act(async () => { await vi.advanceTimersByTimeAsync(10000); });
    expect(volumeMeta.mock.calls.map((c) => c[0])).toEqual(["s2"]);
  });
});

/* Las de antes de F1-8: la meta es la que decide qué volumen pinta el visor;
   si no se vuelve a pedir tras cambiar de serie o preprocesar, las celdas
   siguen con el volumen viejo. */
describe("useVolumeMeta · versión del volumen", () => {
  const metaWith = (cache_key: string) => ({ cache_key, shape: [4, 4, 4] });

  it("refetches the meta when the volume version changes within the session", async () => {
    volumeMeta.mockResolvedValueOnce(metaWith("serie-a")).mockResolvedValueOnce(metaWith("serie-b"));
    const { result, rerender } = renderHook(({ v }) => useVolumeMeta("s1", v), { initialProps: { v: 0 } });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(result.current.meta?.cache_key).toBe("serie-a");
    expect(result.current.forSession).toBe("s1");

    rerender({ v: 1 });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(result.current.meta?.cache_key).toBe("serie-b");
    expect(volumeMeta).toHaveBeenCalledTimes(2);
    expect(result.current.forSession).toBe("s1");
  });

  it("does not refetch when nothing changed", async () => {
    volumeMeta.mockResolvedValue(metaWith("x"));
    const { result, rerender } = renderHook(({ v }) => useVolumeMeta("s1", v), { initialProps: { v: 3 } });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(result.current.meta).not.toBeNull();
    rerender({ v: 3 });
    expect(volumeMeta).toHaveBeenCalledTimes(1);
  });
});
