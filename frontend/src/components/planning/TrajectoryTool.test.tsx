/* El ángulo del corredor dice respecto a qué se mide (spec §4.1). */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const setTrajectory = vi.fn();
vi.mock("../../api/client", () => ({ api: { setTrajectory: (...a: unknown[]) => setTrajectory(...a), suggestCorridors: vi.fn() }, ApiError: class extends Error {} }));
let planning: Record<string, unknown> = {};
// La trayectoria guardada vive en el store (F1-247): aquí, en un estado de React.
vi.mock("../../store/planning", async () => {
  const { useState } = await import("react");
  return {
    usePlanning: () => {
      const [trajSaved, setTrajSaved] = useState(planning.trajSaved ?? null);
      return { ...planning, trajSaved, setTrajSaved };
    },
  };
});

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

  // F1-247: reanudar volvía con los puntos pero sin el análisis ni «Guardada ✓».
  it("con la trayectoria guardada que volvió al reanudar, dice «Guardada ✓» y el ángulo", () => {
    planning.trajSaved = { entry: [0, 0, 0], target: [0, 0, 10], depth_mm: 10, angle_deg: 41.5, corridor: null };
    render(<TrajectoryTool />);
    expect(screen.getByText("Guardada ✓")).toBeInTheDocument();
    expect(screen.getByText("41.5°")).toBeInTheDocument();
    expect(setTrajectory).not.toHaveBeenCalled();
  });
  it("si los puntos ya no son los guardados, no dice «Guardada ✓»", () => {
    planning.trajSaved = { entry: [0, 0, 0], target: [0, 0, 12], depth_mm: 12, angle_deg: 41.5, corridor: null };
    render(<TrajectoryTool />);
    expect(screen.getByText("Guardar trayectoria")).toBeInTheDocument();
    expect(screen.queryByText("41.5°")).toBeNull();
  });
});
