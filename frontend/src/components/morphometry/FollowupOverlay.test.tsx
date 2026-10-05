/* Superposición de un estudio anterior: lo que lista, lo que manda al visor
   y cómo dice si hubo crecimiento. */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FollowupResult } from "../../api/types";

vi.mock("../../api/client", () => ({
  api: { followupStudies: vi.fn(), followup: vi.fn() },
}));

import { api } from "../../api/client";
import { FollowupOverlay } from "./FollowupOverlay";
import { PlanningProvider, usePlanning } from "../../store/planning";

const estudio = { imaging_study_id: 3, session_id: "antes", acquired_at: "2025-01-10", modality: "XA",
                  description: "3D-RA", has_sac: true, has_lesion: true };
const res = (over: Partial<FollowupResult> = {}): FollowupResult => ({
  map_url: "/data/sessions/s1/meshes/seguimiento_mapa.vtp?v=1",
  ghost_url: "/data/sessions/s1/meshes/seguimiento_saco_anterior.vtp?v=1",
  noise_mm: 0.32, residual_median_mm: 0.05, max_growth_mm: 1.37, max_shrink_mm: 0.1,
  grew_area_pct: 5, volume_prev_mm3: 60, volume_curr_mm3: 76, rotation_deg: 6,
  lesion_source_prev: "lesión confirmada", lesion_source_curr: "saco aislado", warnings: [], ...over,
});

let visto: ReturnType<typeof usePlanning> | null = null;
function montar() {
  function Espia({ children }: { children: ReactNode }) {
    const p = usePlanning();
    useEffect(() => { visto = p; });
    return <>{children}</>;
  }
  return render(<PlanningProvider><Espia><FollowupOverlay sessionId="s1" /></Espia></PlanningProvider>);
}

beforeEach(() => {
  vi.mocked(api.followupStudies).mockResolvedValue([estudio]);
  vi.mocked(api.followup).mockReset();
});

describe("superponer un estudio anterior", () => {
  it("lo superpone, lo pinta en el visor y dice cuánto creció", async () => {
    vi.mocked(api.followup).mockResolvedValue(res());
    montar();
    fireEvent.click(await screen.findByText("Superponer"));
    expect(await screen.findByText(/Ha crecido hasta 1.37 mm en 5 % de la lesión/)).toBeInTheDocument();
    expect(api.followup).toHaveBeenCalledWith("s1", "antes");
    await waitFor(() => expect(visto?.followup).toEqual({
      mapUrl: res().map_url, ghostUrl: res().ghost_url, noise: 0.32, range: 1.37,
    }));
    fireEvent.click(screen.getByText("Quitar la superposición del visor"));
    await waitFor(() => expect(visto?.followup).toBeNull());
  });

  it("por debajo del ruido no lo llama crecimiento", async () => {
    vi.mocked(api.followup).mockResolvedValue(res({ max_growth_mm: 0.27, grew_area_pct: 0 }));
    montar();
    fireEvent.click(await screen.findByText("Superponer"));
    expect(await screen.findByText("Sin crecimiento distinguible del ruido")).toBeInTheDocument();
  });

  it("sin otros estudios explica qué hace falta", async () => {
    vi.mocked(api.followupStudies).mockResolvedValue([]);
    montar();
    expect(await screen.findByText(/No hay otro estudio de este paciente/)).toBeInTheDocument();
  });

  it("enseña los avisos del servidor", async () => {
    vi.mocked(api.followup).mockResolvedValue(res({ warnings: ["Modalidades distintas (CT antes, XA ahora)"] }));
    montar();
    fireEvent.click(await screen.findByText("Superponer"));
    expect(await screen.findByRole("alert")).toHaveTextContent("Modalidades distintas");
  });
});
