/* «Reanudar» (familia S): lo que vuelve con la sesión llega al store, la
   detección no se rehace y la sesión no queda marcada con cambios. La
   auditoría reanudó y volvió sin decisión («Planificar dispositivos»
   apagado), sin corredor, con los clips como mallas, con la ventana del DICOM
   y sin los enlaces del informe; la detección se rehacía y salía otra lista. */
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MorphometryResult, SessionRestoreResult } from "./api/types";

const api = {
  detect: vi.fn(),
  morphometry: vi.fn(),
  clipField: vi.fn(),
  getAnnotations: vi.fn(),
};
class ApiError extends Error {
  status: number;
  constructor(status: number, detail: string) { super(detail); this.status = status; }
}
vi.mock("./api/client", () => ({ api, ApiError }));

const { PlanningProvider, usePlanning } = await import("./store/planning");
const { rehydrateSession } = await import("./resume");

const SID = "nueva-0001";
const cand = (id: string) => ({
  id, center_mm: { x: 0, y: 0, z: 0 }, max_diameter_mm: 6, confidence: 0.8,
  dome_mesh_url: `/data/sessions/${SID}/meshes/x.vtp`, selected: id === "cand-001",
  patch_kind: "region", channels: [], rank: 1, veto: null,
});
const morpho = {
  candidate_id: "cand-001", max_diameter_mm: 8, neck_mm: 3, principal_axis: [0, 0, 1],
  neck_origin: { x: 1, y: 2, z: 3 }, rim_points: [], neck_source: "auto",
} as unknown as MorphometryResult;
const decision = {
  recommendation: "CLIPAJE", recommendation_key: "clip", confidence: "Moderada",
  factors: [], clip_factors: [], endo_factors: [], coverage_pct: 80, missing_inputs: [],
  endovascular: null, jsdb: null, perforators: null, notes: [],
};
const clip = { key: 2, clip_id: "c1", name: "Clip 1", position: [1, 2, 3], rotation_deg: 15, azimuthDeg: 10, elevationDeg: 5 };

function restored(extra: Partial<SessionRestoreResult> = {}): SessionRestoreResult {
  return {
    session_id: SID, current_step: 7, label: "s", has_segmentation: true, has_detection: true,
    has_morphometry: true, has_plan: true, restored_at: "2026-10-11T10:00:00Z",
    mesh_url: `/data/sessions/${SID}/meshes/vessel_tree.vtp?v=1`, n_vertices: 10, n_faces: 20,
    modality: "CT", patient_id: 1, study_id: null, study_label: "", imaging_study_id: null,
    series: null, centerline_mesh_url: "", centerline_arc_mm: 0,
    treatment: decision as unknown as SessionRestoreResult["treatment"],
    treatment_inputs: { session_id: SID, location: "ACoP — Arteria Comunicante Posterior", is_ruptured: false, has_comorbidities: true } as SessionRestoreResult["treatment_inputs"],
    trajectory: { entry: [0, 0, 0], target: [3, 4, 0], depth_mm: 5, angle_deg: 37.5, corridor: null },
    placed_clips: {
      clips: [clip],
      plan: { clips_mesh_url: `/data/sessions/${SID}/meshes/clips_placed.vtp?v=2`, neck_coverage_pct: 96,
        collision_detected: false, neck_region_excluded: true, branches_under_clip: [], warning: null } as never,
    },
    window: { wc: 300, ww: 900 },
    report_urls: { pdf_url: `/data/sessions/${SID}/reports/vieja_report.pdf?v=3`, dicom_sr_url: null },
    lesion_confirmed: true,
    ...extra,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  api.detect.mockResolvedValue({ found: true, candidates: [cand("cand-001"), cand("cand-002")], rejected: [], diagnostics: {}, morphometry_invalidated: false });
  api.morphometry.mockResolvedValue(morpho);
  api.clipField.mockResolvedValue({ field_mesh_url: "/f.vtp", summary: { verdict: "ok" } });
  api.getAnnotations.mockResolvedValue([]);
});

const montar = () => renderHook(() => usePlanning(), { wrapper: PlanningProvider });

describe("Reanudar rellena el store con lo guardado", () => {
  it("decisión, trayectoria, clips, ventana e informe; sin cambios pendientes", async () => {
    const { result } = montar();
    let out: { step: number; invalidated: boolean } | undefined;
    await act(async () => { out = await rehydrateSession(result.current, restored()); });
    const p = result.current;
    expect(out).toEqual({ step: 7, invalidated: false });
    // F1-27: la decisión y lo que se tecleó para pedirla.
    expect(p.treatment?.recommendation_key).toBe("clip");
    expect(p.treatmentInputs?.location).toBe("ACoP — Arteria Comunicante Posterior");
    expect(p.treatmentInputs?.has_comorbidities).toBe(true);
    // F1-247: el corredor guardado, para que el botón diga «Guardada ✓».
    expect(p.trajSaved?.angle_deg).toBe(37.5);
    expect(p.trajEntry).toEqual([0, 0, 0]);
    expect(p.trajTarget).toEqual([3, 4, 0]);
    // F1-28: la fila editable, lo planificado, la verificación y el mapa.
    expect(p.placedClips).toEqual([clip]);
    expect(p.plannedClips).toEqual([clip]);
    expect(p.clipPlan?.neck_coverage_pct).toBe(96);
    expect(p.deviceMeshes.clips).toContain("clips_placed.vtp");
    expect(api.clipField).toHaveBeenCalledTimes(1);
    expect(p.clipField).not.toBeNull();
    expect(p.fieldClips).toEqual([clip]);
    // F1-248: la ventana, también para el visor que todavía no ha montado.
    expect(p.mprWl).toEqual({ wc: 300, ww: 900 });
    // F1-249: el PDF que sigue en disco.
    expect(p.reportUrls?.pdf_url).toContain("vieja_report.pdf");
    // F1-250: nada de esto es un cambio sin guardar.
    expect(p.dirty).toBe(false);
  });

  it("la detección se pide guardada, no se rehace (F1-246)", async () => {
    const { result } = montar();
    await act(async () => { await rehydrateSession(result.current, restored()); });
    expect(api.detect).toHaveBeenCalledTimes(1);
    expect(api.detect).toHaveBeenCalledWith(SID, { cached: true });
    expect(result.current.candidates.map((c) => c.id)).toEqual(["cand-001", "cand-002"]);
  });

  it("sin detección guardada (404) cae a detectar como antes", async () => {
    api.detect.mockImplementationOnce(() => Promise.reject(new ApiError(404, "sin detección")));
    const { result } = montar();
    await act(async () => { await rehydrateSession(result.current, restored()); });
    expect(api.detect).toHaveBeenNthCalledWith(1, SID, { cached: true });
    expect(api.detect).toHaveBeenNthCalledWith(2, SID);
    expect(result.current.candidates).toHaveLength(2);
  });

  it("lo que no se guardó no se inventa", async () => {
    const { result } = montar();
    await act(async () => {
      await rehydrateSession(result.current, restored({
        treatment: null, treatment_inputs: null, trajectory: null, placed_clips: null, window: null, report_urls: null,
      }));
    });
    const p = result.current;
    expect(p.treatment).toBeNull();
    expect(p.trajSaved).toBeNull();
    expect(p.placedClips).toEqual([]);
    expect(p.clipPlan).toBeNull();
    expect(api.clipField).not.toHaveBeenCalled();
    expect(p.reportUrls).toBeNull();
    expect(p.dirty).toBe(false);
  });

  it("el visor toma la ventana restaurada una sola vez", async () => {
    const { result } = montar();
    await act(async () => { await rehydrateSession(result.current, restored()); });
    expect(result.current.takeRestoredWl()).toEqual({ wc: 300, ww: 900 });
    expect(result.current.takeRestoredWl()).toBeNull();
  });

  it("reponer la malla de un dispositivo guardado no marca cambios", async () => {
    const { result } = montar();
    await act(async () => { await rehydrateSession(result.current, restored()); });
    act(() => result.current.restoreDeviceMesh("coils", "/c.vtp"));
    expect(result.current.deviceMeshes.coils).toBe("/c.vtp");
    expect(result.current.dirty).toBe(false);
  });
  it("otra malla después de reanudar deja la trayectoria guardada desfasada", async () => {
    const { result } = montar();
    await act(async () => { await rehydrateSession(result.current, restored()); });
    expect(result.current.trajSaved?.stale).toBeFalsy();
    act(() => result.current.setSegmentation({ ...result.current.segmentation!, mesh_url: "/otra.vtp?v=9" }));
    expect(result.current.trajSaved?.stale).toBe(true);
    expect(result.current.trajSaved?.corridor).toBeNull();
  });
});
