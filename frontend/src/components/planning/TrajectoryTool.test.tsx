/* El ángulo del corredor dice respecto a qué se mide (spec §4.1). */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const setTrajectory = vi.fn();
vi.mock("../../api/client", () => ({ api: { setTrajectory: (...a: unknown[]) => setTrajectory(...a), suggestCorridors: vi.fn() }, ApiError: class extends Error {} }));
let planning: Record<string, unknown> = {};
vi.mock("../../store/planning", () => ({ usePlanning: () => planning }));

import { TrajectoryTool } from "./DevicesPanel";

beforeEach(() => {
  setTrajectory.mockReset().mockResolvedValue({ entry: [0, 0, 0], target: [0, 0, 10], depth_mm: 10, angle_deg: 37.2, corridor: null });
  planning = {
    sessionId: "s", segmentation: { mesh_url: "/m.vtp" }, pickMode: null, setPickMode: vi.fn(),
    trajEntry: [0, 0, 0], trajTarget: [0, 0, 10], setTrajEntry: vi.fn(), setTrajTarget: vi.fn(),
    morphometry: { principal_axis: [0, 0, 1] },
  };
});

describe("TrajectoryTool", () => {
  it("con eje medido, el ángulo se dice respecto al eje del aneurisma", async () => {
    render(<TrajectoryTool />);
    fireEvent.click(screen.getByText("Guardar trayectoria"));
    await waitFor(() => expect(setTrajectory).toHaveBeenCalled());
    expect(await screen.findByText("Ángulo respecto al eje del aneurisma")).toBeInTheDocument();
    expect(screen.getByText("37.2°")).toBeInTheDocument();
  });
  it("sin morfometría avisa de que la referencia es el eje vertical", async () => {
    planning.morphometry = null;
    render(<TrajectoryTool />);
    fireEvent.click(screen.getByText("Guardar trayectoria"));
    expect(await screen.findByText(/eje vertical del estudio/)).toBeInTheDocument();
  });
});
