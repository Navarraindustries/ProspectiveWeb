/* La segmentación que el store recibe al «Reanudar» una sesión guardada.

   Aparte de App.tsx para poder probarla: antes el factor iba fijo a 1 y una
   malla a media resolución —lo normal en un equipo de 2 GB con Case 3— volvía
   etiquetada «completa / Nativa», sin la nota que explicaba por qué. */

import type { SegmentResult, SessionRestoreResult } from "./types";

export function restoredSegmentation(r: SessionRestoreResult): SegmentResult {
  return {
    mesh_url: r.mesh_url, vertices: r.n_vertices, faces: r.n_faces,
    voxel_fraction: null, strategy: "restaurada", is_dsa: false,
    // The mesh came back from a snapshot; no cleanup ran now, so there is
    // nothing discarded to report.
    kept_fraction: 1, fragments_removed: 0, largest_removed_mm3: 0,
    main_tree_applied: false, main_tree_warning: "", main_tree_removed: 0,
    // Cómo se hizo la malla, guardado al segmentar. Las sesiones anteriores no
    // lo traen (0 / ""): se cae a lo de antes.
    downsample_factor: r.downsample_factor || 1,
    method: r.method === "tubular" || r.method === "threshold" ? r.method : undefined,
    fallback_note: r.fallback_note || "",
  };
}
