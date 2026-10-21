/* La banda de vasos sale del servidor una vez por volumen y sirve a los tres
   sistemas de ventana; sin ella «Vasos» desaparecía al terminar de segmentar. */
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../api/client";
import type { SegmentResult } from "../api/types";
import { useVesselBand } from "./useVesselBand";

const sugerida = { lower: 1470, upper: 4200, vmin: 12, vmax: 4717 };
const segmentada = { threshold_lower: 1600 } as unknown as SegmentResult;

afterEach(() => vi.restoreAllMocks());

describe("useVesselBand", () => {
  it("sin segmentación usa el inferior sugerido y el techo robusto", async () => {
    vi.spyOn(api, "suggestedBand").mockResolvedValue(sugerida);
    const { result } = renderHook(() => useVesselBand("s1", null));
    await waitFor(() => expect(result.current).toEqual([1470, 4717]));
  });
  it("con segmentación el inferior es el umbral que se usó", async () => {
    vi.spyOn(api, "suggestedBand").mockResolvedValue(sugerida);
    const { result } = renderHook(() => useVesselBand("s1", segmentada));
    await waitFor(() => expect(result.current).toEqual([1600, 4717]));
  });
  it("pide la banda una vez por sesión y otra al cambiar el volumen", async () => {
    const spy = vi.spyOn(api, "suggestedBand").mockResolvedValue(sugerida);
    const { result, rerender } = renderHook(({ seg, v }) => useVesselBand("s1", seg, v), { initialProps: { seg: null as SegmentResult | null, v: 0 } });
    await waitFor(() => expect(result.current).not.toBeNull());
    rerender({ seg: segmentada, v: 0 });
    expect(spy).toHaveBeenCalledTimes(1);
    rerender({ seg: segmentada, v: 1 });
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
  });
  it("sin sesión o con error de red devuelve null", async () => {
    vi.spyOn(api, "suggestedBand").mockRejectedValue(new Error("red"));
    const { result } = renderHook(() => useVesselBand("s1", null));
    await waitFor(() => expect(api.suggestedBand).toHaveBeenCalled());
    expect(result.current).toBeNull();
    const { result: sinSesion } = renderHook(() => useVesselBand(null, null));
    expect(sinSesion.current).toBeNull();
  });
  it("una banda degenerada (techo ≤ suelo) es null", async () => {
    vi.spyOn(api, "suggestedBand").mockResolvedValue({ ...sugerida, vmax: 1500 });
    const { result } = renderHook(() => useVesselBand("s1", segmentada));
    await waitFor(() => expect(api.suggestedBand).toHaveBeenCalled());
    expect(result.current).toBeNull();
  });
});
