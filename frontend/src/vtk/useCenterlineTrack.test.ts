/* Los puntos de la línea central tienen que estar aunque el panel de la línea
   central no se haya abierto: tras «Reanudar», el recorrido VASO del Oblicuo
   no tendría qué recorrer. */
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const centerlinePoints = vi.fn();
vi.mock("../api/client", () => ({ api: { centerlinePoints: (...a: unknown[]) => centerlinePoints(...a) } }));

let planning: Record<string, unknown> = {};
vi.mock("../store/planning", () => ({ usePlanning: () => planning }));

import { useCenterlineTrack } from "./useCenterlineTrack";

const wire = { points: [{ x: 1, y: 2, z: 3 }], radii_mm: [1.5], arc_mm: [0] };

beforeEach(() => {
  centerlinePoints.mockReset().mockResolvedValue(wire);
  planning = { sessionId: "s", centerlineMesh: "/cl.vtp", centerline: null, setCenterline: vi.fn() };
});

describe("useCenterlineTrack", () => {
  it("con tubo y sin puntos, los pide y los guarda en el store", async () => {
    renderHook(() => useCenterlineTrack());
    await waitFor(() => expect(planning.setCenterline).toHaveBeenCalledWith({ points: [[1, 2, 3]], radiiMm: [1.5], arcMm: [0] }));
    expect(centerlinePoints).toHaveBeenCalledWith("s");
  });

  it("si ya están los puntos, no los vuelve a pedir", () => {
    planning.centerline = { points: [], radiiMm: [], arcMm: [] };
    renderHook(() => useCenterlineTrack());
    expect(centerlinePoints).not.toHaveBeenCalled();
  });

  it("sin tubo no pide nada", () => {
    planning.centerlineMesh = null;
    renderHook(() => useCenterlineTrack());
    expect(centerlinePoints).not.toHaveBeenCalled();
  });

  it("una respuesta que llega tras desmontar no toca el store", async () => {
    let resolve!: (w: typeof wire) => void;
    centerlinePoints.mockReturnValue(new Promise((r) => { resolve = r; }));
    const { unmount } = renderHook(() => useCenterlineTrack());
    unmount();
    resolve(wire);
    await Promise.resolve(); await Promise.resolve();
    expect(planning.setCenterline).not.toHaveBeenCalled();
  });
});
