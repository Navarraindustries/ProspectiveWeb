import { describe, expect, it, vi } from "vitest";

const fdSizing = vi.fn();
vi.mock("../../api/client", () => ({ api: { fdSizing: (...a: unknown[]) => fdSizing(...a) } }));

const { cargarPlan } = await import("./HudIvus");

describe("plan del flow diverter en el IVUS (FE-14)", () => {
  it("otra medida del cuello pide otro plan", async () => {
    fdSizing.mockReset().mockResolvedValue({ opciones: [] });
    await cargarPlan("s-medida", "linea", "cuello-4mm");
    await cargarPlan("s-medida", "linea", "cuello-4mm");
    expect(fdSizing).toHaveBeenCalledTimes(1);
    await cargarPlan("s-medida", "linea", "cuello-5mm");
    expect(fdSizing).toHaveBeenCalledTimes(2);
  });

  it("un error no se queda fijo: la siguiente vez se vuelve a pedir", async () => {
    fdSizing.mockReset().mockRejectedValueOnce(new Error("caído")).mockResolvedValue({ opciones: [] });
    expect(await cargarPlan("s-error", "linea", "m")).toEqual({ nota: "caído" });
    await Promise.resolve();
    expect(await cargarPlan("s-error", "linea", "m")).toEqual({ fd: { opciones: [] } });
    expect(fdSizing).toHaveBeenCalledTimes(2);
  });
});
