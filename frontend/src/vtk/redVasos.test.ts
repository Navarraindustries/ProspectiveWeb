import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../api/client", () => ({ api: { vesselNetwork: vi.fn() } }));
import { olvidarRedes, pedirRed } from "./redVasos";

const SID = "86e46bdb-0f84-49b8-8381-b2de86ad028f";
const RED = { url: `/data/sessions/${SID}/meshes/vessel_tree.red.vtp?v=2`, tramos: 269, uniones: 120, extremos: 135, largo_total_mm: 2594, segundos: 13.7, voxel_mm: 0.4 };

describe("pedirRed", () => {
  beforeEach(() => olvidarRedes());

  it("pide la red de una malla de sesión una sola vez por versión, con o sin fragmento", async () => {
    const pedir = vi.fn().mockResolvedValue(RED);
    const url = `/data/sessions/${SID}/meshes/vessel_tree.vtp?v=1`;
    expect(await pedirRed(url, pedir)).toEqual(RED);
    await pedirRed(`${url}#calibre`, pedir);
    expect(pedir).toHaveBeenCalledTimes(1);
    expect(pedir).toHaveBeenCalledWith(SID, "vessel_tree.vtp");
    await pedirRed(`/data/sessions/${SID}/meshes/vessel_tree.vtp?v=9`, pedir);
    expect(pedir).toHaveBeenCalledTimes(2);
  });

  it("si el servidor falla da null, y se vuelve a intentar después", async () => {
    const pedir = vi.fn().mockRejectedValueOnce(new Error("500")).mockResolvedValue(RED);
    const url = `/data/sessions/${SID}/meshes/vessel_tree.vtp`;
    expect(await pedirRed(url, pedir)).toBeNull();
    expect(await pedirRed(url, pedir)).toEqual(RED);
  });

  it("ni las copias para el visor ni lo que no es de una sesión se piden", async () => {
    const pedir = vi.fn();
    for (const n of ["vessel_tree.suave.vtp", "vessel_tree.calibre.vtp", "vessel_tree.red.vtp"]) {
      expect(await pedirRed(`/data/sessions/${SID}/meshes/${n}`, pedir)).toBeNull();
    }
    expect(await pedirRed("/static/x.vtp", pedir)).toBeNull();
    expect(pedir).not.toHaveBeenCalled();
  });
});
