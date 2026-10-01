import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PlanningProvider, usePlanning } from "./planning";
import type { ClipFieldResult } from "../api/types";

const campo: ClipFieldResult = {
  field_mesh_url: "/m/clip_field.vtp?v=1", scalars: { colors: "uint8x3" },
  summary: { covered_pct: 90, residual_pct: 10, unreached_pct: 0, contact_area_mm2: 8, force_g: 120, force_is_band_min: true,
    force_provisional: true, pressure_g_mm2: 15, window_g_mm2: [10, 12, 18, 22], pressure_verdict: "optima", force_window_g: [70, 80, 120, 150], neck_evaluated: true, clips: [{ name: "x", force_g: 120, verdict: "optima" }], verdict: "ok",
    criteria: [], clip_name: "NAVARRO T1 10", note: "Estimación geométrica" },
};

describe("campo del clip en el store", () => {
  it("se guarda, se muestra por defecto y se retira al limpiar los clips", () => {
    const { result } = renderHook(() => usePlanning(), { wrapper: PlanningProvider });
    expect(result.current.showClipField).toBe(true);
    act(() => result.current.setClipField(campo));
    expect(result.current.clipField?.summary.verdict).toBe("ok");
    act(() => result.current.clearDeviceMeshes("clips"));
    expect(result.current.clipField).toBeNull();
  });
  it("limpiar otros dispositivos no lo toca; limpiar todo sí", () => {
    const { result } = renderHook(() => usePlanning(), { wrapper: PlanningProvider });
    act(() => result.current.setClipField(campo));
    act(() => result.current.clearDeviceMeshes("coils"));
    expect(result.current.clipField).not.toBeNull();
    act(() => result.current.clearDeviceMeshes());
    expect(result.current.clipField).toBeNull();
  });
});
