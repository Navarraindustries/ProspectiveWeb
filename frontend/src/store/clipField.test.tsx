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
  it("guarda la lista para la que se calculó el campo y la olvida con él", () => {
    const { result } = renderHook(() => usePlanning(), { wrapper: PlanningProvider });
    expect(result.current.fieldClips).toBeNull();
    const clips = [{ key: 1, clip_id: "x", name: "x", position: [1, 2, 3] as [number, number, number], rotation_deg: 0, azimuthDeg: 0, elevationDeg: 0 }];
    act(() => result.current.setClipField(campo, clips));
    expect(result.current.fieldClips).toEqual(clips);
    act(() => result.current.setClipField(null, clips));
    expect(result.current.fieldClips).toBeNull();
    act(() => result.current.setClipField(campo, clips));
    act(() => result.current.clearDeviceMeshes("clips"));
    expect(result.current.fieldClips).toBeNull();
  });
  it("lo que enseña el 3D del campo: por defecto nada; el visor fija si se ve y qué fichero tiene", () => {
    const { result } = renderHook(() => usePlanning(), { wrapper: PlanningProvider });
    expect(result.current.fieldMeshOnScreen).toEqual({ shown: false, url: null });
    act(() => result.current.setFieldMeshShown(true));
    act(() => result.current.setFieldMeshUrl("/m/clip_field.vtp?v=2"));
    expect(result.current.fieldMeshOnScreen).toEqual({ shown: true, url: "/m/clip_field.vtp?v=2" });
    const same = result.current.fieldMeshOnScreen;
    act(() => result.current.setFieldMeshShown(true));
    expect(result.current.fieldMeshOnScreen).toBe(same);   // sin cambio, sin render
  });
  it("la pestaña de clips se anuncia montada; por defecto no lo está", () => {
    const { result } = renderHook(() => usePlanning(), { wrapper: PlanningProvider });
    expect(result.current.clipsTabActive).toBe(false);
    act(() => result.current.setClipsTabActive(true));
    expect(result.current.clipsTabActive).toBe(true);
    act(() => result.current.setClipsTabActive(false));
    expect(result.current.clipsTabActive).toBe(false);
  });
});
