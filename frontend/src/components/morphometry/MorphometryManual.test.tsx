/* Revisión de F1-146: el candidato «marcado a mano» se mide marcando cuello y
   ápice. La morfometría automática responde 422 (no hay saco detectado), y los
   botones de marcar vivían dentro de `{m && …}`: con `m` vacío el panel decía
   qué hacer y no dejaba hacerlo. */

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

const TEXTO_422 = "Candidato marcado a mano: no hay saco detectado que aislar. Mide en Morfometría marcando el cuello y el ápice.";

const manual = {
  id: "cand-004", center_mm: { x: 0, y: 7, z: 0 }, max_diameter_mm: 0, confidence: 0,
  dome_mesh_url: "", selected: false, channels: ["manual"], patch_kind: "manual", rank: 0, veto: null,
} as AneurysmCandidate;

const medida = {
  volume_mm3: 100, surface_area_mm2: 120, eq_sphere_diam_mm: 5.8,
  max_diameter_mm: 6, bbox_w_mm: 5, bbox_h_mm: 4, neck_mm: 3.1, dome_height_mm: 5,
  dnr: 1.2, ar: 1.1, bf: 1.2, compactness: 0.8, ui: 0.05, ei: 0.1, nsi: 0.2, sr: 0,
  rupture_risk_label: "Bajo", reliable: true, volume_valid: true, neck_valid: true,
  neck_source: "manual", neck_tilt_deg: 0, warning: null,
  centroid: { x: 0, y: 0, z: 0 }, principal_axis: [0, 0, 1],
  neck_origin: { x: 0, y: 3, z: 0 }, candidate_id: "cand-004",
} as unknown as MorphometryResult;

let store: ReturnType<typeof usePlanning> | null = null;

function Seed({ children }: { children: ReactNode }) {
  const p = usePlanning();
  store = p;
  useEffect(() => {
    if (!p.sessionId) { p.setSession("s1"); p.setCandidates([manual]); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.sessionId]);
  return p.sessionId ? <>{children}</> : null;
}

describe("Morfometría con un candidato marcado a mano", () => {
  it("con el 422 enseña los controles de cuello y ápice, y «Medir saco cerrado» da la medida", async () => {
    vi.mocked(api.morphometry).mockRejectedValue(new Error(TEXTO_422));
    vi.mocked(api.morphometryNeckPlane).mockResolvedValue(medida);
    render(<PlanningProvider><Seed><MorphometryPanel onNext={() => {}} /></Seed></PlanningProvider>);

    // El texto del 422 como información, no como error.
    const nota = await screen.findByRole("note", { name: "Candidato marcado a mano" });
    expect(nota).toHaveTextContent(TEXTO_422);
    // Una sola vez: en la nota, no repetido en la caja roja de error.
    expect(screen.getAllByText(TEXTO_422)).toHaveLength(1);
    expect(screen.getByRole("button", { name: /Marcar cuello/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Marcar ápice del domo/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Marcar borde del cuello" })).toBeInTheDocument();
    const medir = screen.getByRole("button", { name: "Medir saco cerrado" });
    expect(medir).toBeDisabled();

    act(() => { store!.setNeckOrigin([0, 3, 0]); store!.setNeckDome([0, 7, 0]); });
    await waitFor(() => expect(screen.getByRole("button", { name: "Medir saco cerrado" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Medir saco cerrado" }));

    await waitFor(() => expect(api.morphometryNeckPlane).toHaveBeenCalledWith("s1", expect.objectContaining({
      candidate_id: "cand-004", origin: { x: 0, y: 3, z: 0 },
    })));
    // Las métricas se pintan y la nota se va.
    expect(await screen.findByText("3.1")).toBeInTheDocument();
    expect(screen.queryByRole("note", { name: "Candidato marcado a mano" })).toBeNull();
  });

  /* Revisión 2: solo el 422 esperado se calla; un 500 o un fallo de red con
     un marcado a mano elegido es un error y se dice. */
  it("otro fallo de la medida automática sí se enseña como error", async () => {
    vi.mocked(api.morphometry).mockRejectedValue(new Error("Morphometry error: boom"));
    render(<PlanningProvider><Seed><MorphometryPanel onNext={() => {}} /></Seed></PlanningProvider>);
    expect(await screen.findByText("Morphometry error: boom")).toBeInTheDocument();
  });
});
