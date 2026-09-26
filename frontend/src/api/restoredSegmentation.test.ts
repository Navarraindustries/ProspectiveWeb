import { describe, expect, it } from "vitest";
import { restoredSegmentation } from "./restoredSegmentation";
import type { SessionRestoreResult } from "./types";

const base = {
  session_id: "s2", current_step: 2, label: "", has_segmentation: true,
  has_detection: false, has_morphometry: false, has_plan: false, restored_at: "",
  mesh_url: "/m/vessel_tree.vtp", n_vertices: 10594, n_faces: 21000, modality: "XA",
  patient_id: 1, study_id: null, study_label: "", imaging_study_id: null, series: null,
  centerline_mesh_url: "", centerline_arc_mm: 0,
} as SessionRestoreResult;

describe("restoredSegmentation", () => {
  it("conserva la media resolución, el método y la nota con que se segmentó", () => {
    const s = restoredSegmentation({
      ...base, downsample_factor: 2, method: "tubular",
      fallback_note: "El volumen no cabe en memoria: se segmentó a media resolución.",
    });
    expect(s.downsample_factor).toBe(2);
    expect(s.method).toBe("tubular");
    expect(s.fallback_note).toMatch(/media resolución/);
  });

  it("una sesión guardada antes de esto cae a lo de antes: nativa, sin método ni nota", () => {
    const s = restoredSegmentation(base);
    expect(s.downsample_factor).toBe(1);
    expect(s.method).toBeUndefined();
    expect(s.fallback_note).toBe("");
  });
});
