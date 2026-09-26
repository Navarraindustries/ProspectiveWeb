/* La morfometría automática mide el candidato elegido en Detección.

   El fallo que fija: el panel pedía GET /morphometry sin candidato y el backend
   medía siempre cand-001. En Case 3 la lesión es cand-002, así que al elegirla
   el clínico veía el cuello y los índices de otro sitio a 40–60 mm. */

import { act, render, screen, waitFor } from "@testing-library/react";
import { useEffect, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../api/client", () => ({
  api: {
    morphometry: vi.fn(),
    morphometryNeckPlane: vi.fn(),
    longitudinal: vi.fn().mockRejectedValue(new Error("sin seguimiento")),
  },
}));

import { api } from "../../api/client";
import { MorphometryPanel } from "./MorphometryPanel";
import { PlanningProvider, usePlanning } from "../../store/planning";
import type { AneurysmCandidate, MorphometryResult } from "../../api/types";

const medida = (id: string, neck: number): MorphometryResult => ({
  volume_mm3: 100, surface_area_mm2: 120, eq_sphere_diam_mm: 5.8,
  max_diameter_mm: 6, bbox_w_mm: 5, bbox_h_mm: 4,
  neck_mm: neck, dome_height_mm: 5,
  dnr: 1.2, ar: 1.1, bf: 1.2,
  compactness: 0.8, ui: 0.05, ei: 0.1, nsi: 0.2, sr: 0,
  rupture_risk_label: "Bajo",
  reliable: true, volume_valid: true, neck_valid: true,
  neck_source: "auto", neck_tilt_deg: 0, warning: null,
  centroid: { x: 0, y: 0, z: 0 }, principal_axis: [0, 0, 1],
  neck_origin: { x: 0, y: 0, z: 0 }, candidate_id: id,
} as unknown as MorphometryResult);

const cand = (id: string, x: number) => ({
  id, center_mm: { x, y: 0, z: 0 }, max_diameter_mm: 5, confidence: 0.5,
  dome_mesh_url: "", selected: false, channels: [], patch_kind: "",
} as unknown as AneurysmCandidate);

let store: ReturnType<typeof usePlanning> | null = null;

function Seed({ children }: { children: ReactNode }) {
  const planning = usePlanning();
  store = planning;
  const { setSession, setCandidates, sessionId } = planning;
  useEffect(() => {
    if (!sessionId) { setSession("s1"); setCandidates([cand("cand-001", 0), cand("cand-002", 40)]); }
  }, [sessionId, setSession, setCandidates]);
  return <>{children}</>;
}

describe("morfometría del candidato elegido", () => {
  it("pide el candidato seleccionado y, al cambiar la selección, descarta la medida y pide el nuevo", async () => {
    vi.mocked(api.morphometry).mockImplementation(async (_sid: string, id?: string) =>
      medida(id ?? "cand-001", id === "cand-002" ? 3.3 : 7.7));
    render(<PlanningProvider><Seed><MorphometryPanel onNext={() => {}} /></Seed></PlanningProvider>);

    expect(await screen.findByText("7.7")).toBeInTheDocument();
    expect(vi.mocked(api.morphometry)).toHaveBeenLastCalledWith("s1", "cand-001");

    act(() => store!.setSelectedCandidate(1));
    // La medida vieja se va del store en el mismo cambio: no se enseña la de cand-001.
    expect(store!.morphometry === null || store!.morphometry.candidate_id === "cand-002").toBe(true);
    expect(await screen.findByText("3.3")).toBeInTheDocument();
    expect(screen.queryByText("7.7")).toBeNull();
    expect(vi.mocked(api.morphometry)).toHaveBeenLastCalledWith("s1", "cand-002");

    // Volver a elegir el mismo candidato no vuelve a medir.
    const n = vi.mocked(api.morphometry).mock.calls.length;
    act(() => store!.setSelectedCandidate(1));
    await waitFor(() => expect(screen.getByText("3.3")).toBeInTheDocument());
    expect(vi.mocked(api.morphometry).mock.calls.length).toBe(n);
  });
});
