/* La tabla de la línea central tras «Reanudar».

   El tubo volvía al visor pero las métricas vivían solo en el estado local del
   panel, así que la tabla salía vacía hasta volver a extraer. */
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getCenterline = vi.fn();
const centerlinePoints = vi.fn();
vi.mock("../../api/client", () => ({ api: {
  getCenterline: (...a: unknown[]) => getCenterline(...a),
  centerlinePoints: (...a: unknown[]) => centerlinePoints(...a),
} }));

let planning: Record<string, unknown> = {};
vi.mock("../../store/planning", () => ({ usePlanning: () => planning }));
vi.mock("./DiameterChart", () => ({ DiameterChart: () => null }));
vi.mock("../../vtk/useVolumeMeta", () => ({ useVolumeMeta: () => ({ meta: null, forSession: null }) }));

import { CenterlinePanel } from "./CenterlinePanel";

const metricas = {
  centerline_mesh_url: "/data/sessions/s/meshes/centerline.vtp?v=1", n_points: 80,
  arc_length_mm: 42.3, chord_length_mm: 38.1, tortuosity: 1.11, tortuosity_index_pct: 11.0,
  mean_diameter_mm: 3.4, min_diameter_mm: 2.1, max_diameter_mm: 4.6, warning: null,
};

beforeEach(() => {
  getCenterline.mockReset().mockResolvedValue(metricas);
  centerlinePoints.mockReset().mockResolvedValue({ points: [], radii_mm: [], arc_mm: [] });
  planning = {
    sessionId: "s", segmentation: { mesh_url: "/m.vtp" }, pickMode: null,
    clSource: null, clTarget: null, centerlineMesh: "/data/sessions/s/meshes/centerline.vtp",
    setPickMode: vi.fn(), setClSource: vi.fn(), setClTarget: vi.fn(),
    setCenterlineMesh: vi.fn(), setCenterlineArcMm: vi.fn(), clearDeviceMeshes: vi.fn(),
    centerline: null, setCenterline: vi.fn(), focusPoint: null, setFocusMm: vi.fn(),
    setFreePlane: vi.fn(), volumeVersion: 0,
  };
});

describe("la línea central al reanudar", () => {
  it("con el tubo ya en el visor, pide las métricas y las enseña", async () => {
    render(<CenterlinePanel />);
    await waitFor(() => expect(getCenterline).toHaveBeenCalledWith("s"));
    expect(await screen.findByText("1.110")).toBeInTheDocument();   // tortuosidad
  });

  it("sin línea central no pide nada", () => {
    planning.centerlineMesh = null;
    render(<CenterlinePanel />);
    expect(getCenterline).not.toHaveBeenCalled();
  });

  it("si el backend no la tiene, no inventa una tabla", async () => {
    getCenterline.mockResolvedValue(null);
    render(<CenterlinePanel />);
    await waitFor(() => expect(getCenterline).toHaveBeenCalled());
    expect(screen.queryByText("Tortuosidad")).toBeNull();
  });

  it("con el tubo en el visor pide también los puntos", async () => {
    render(<CenterlinePanel />);
    await waitFor(() => expect(planning.setCenterline).toHaveBeenCalledWith({ points: [], radiiMm: [], arcMm: [] }));
  });
});
