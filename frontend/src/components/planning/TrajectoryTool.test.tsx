/* El ángulo del corredor dice respecto a qué se mide (spec §4.1). */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const setTrajectory = vi.fn();
const suggestCorridors = vi.fn();
// Con `status`, como el de verdad: el panel distingue «no responde» (0) de un
// 500 que trae explicación. Hoisted porque vi.mock sube por encima del import.
const { ApiErrorMock } = vi.hoisted(() => ({
  ApiErrorMock: class extends Error {
    status: number;
    constructor(status: number, detail: string) { super(detail); this.status = status; }
  },
}));
vi.mock("../../api/client", () => ({
  api: {
    setTrajectory: (...a: unknown[]) => setTrajectory(...a),
    suggestCorridors: (...a: unknown[]) => suggestCorridors(...a),
  },
  ApiError: ApiErrorMock,
}));
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
  suggestCorridors.mockReset();
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
  // La malla cambió después de guardar: el corredor guardado ya no vale.
  it("con el análisis desfasado pide volver a guardar en vez de «Guardada ✓»", () => {
    planning.trajSaved = { entry: [0, 0, 0], target: [0, 0, 10], depth_mm: 10, angle_deg: 41.5, corridor: null, stale: true };
    render(<TrajectoryTool />);
    expect(screen.getByText("Vuelve a guardar la trayectoria")).toBeInTheDocument();
    expect(screen.queryByText("Guardada ✓")).toBeNull();
  });
});

// F1-20: «Sugerir corredor» con el servidor caído dejaba un «Error 500» y nada
// más. Ahora el panel dice qué pasó, ofrece «Reintentar» y la vía manual.
describe("TrajectoryTool · «Sugerir corredor» que falla", () => {
  it("un 500 enseña la explicación del servidor y «Reintentar», que la borra", async () => {
    suggestCorridors.mockRejectedValueOnce(new ApiErrorMock(500,
      "El cálculo del corredor falló en el servidor; la sesión no se ha perdido. Coloca la entrada y la diana a mano."));
    render(<TrajectoryTool />);
    fireEvent.click(screen.getByText("Sugerir corredor"));
    expect(await screen.findByText(/Coloca la entrada y la diana a mano/)).toBeInTheDocument();

    suggestCorridors.mockReturnValueOnce(new Promise(() => {}));   // reintento en curso
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    await waitFor(() => expect(suggestCorridors).toHaveBeenCalledTimes(2));
    expect(screen.queryByText(/Coloca la entrada y la diana a mano/)).toBeNull();
  });

  it("sin respuesta del servidor dice que no responde y que se marque a mano", async () => {
    suggestCorridors.mockRejectedValueOnce(new ApiErrorMock(0, "Sin conexión con el servidor"));
    render(<TrajectoryTool />);
    fireEvent.click(screen.getByText("Sugerir corredor"));
    expect(await screen.findByText("El servidor no responde. Marca Entrada y Diana a mano")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeInTheDocument();
  });
});
