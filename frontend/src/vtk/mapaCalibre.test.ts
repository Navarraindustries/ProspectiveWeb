import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../api/client", () => ({ api: { calibreMesh: vi.fn() } }));
import { conCalibre, degradadoSecuencial, esCapaCalibre, MAPA_SECUENCIAL, olvidarCalibres, pedirCalibre } from "./mapaCalibre";

const SID = "86e46bdb-0f84-49b8-8381-b2de86ad028f";
const RESUMEN = { url: `/data/sessions/${SID}/meshes/vessel_tree.calibre.vtp?v=2`, campo: "calibre_mm", p5_mm: 0.2, mediana_mm: 0.8, p95_mm: 2.4, maximo_mm: 5.5 };

describe("pedirCalibre", () => {
  beforeEach(() => olvidarCalibres());

  it("pide la copia de una malla de sesión una sola vez por versión, con o sin #calibre", async () => {
    const pedir = vi.fn().mockResolvedValue(RESUMEN);
    const url = `/data/sessions/${SID}/meshes/vessel_tree.vtp?v=1`;
    expect(await pedirCalibre(conCalibre(url), pedir)).toEqual(RESUMEN);
    await pedirCalibre(url, pedir);
    expect(pedir).toHaveBeenCalledTimes(1);
    expect(pedir).toHaveBeenCalledWith(SID, "vessel_tree.vtp");
    await pedirCalibre(`/data/sessions/${SID}/meshes/vessel_tree.vtp?v=9`, pedir);
    expect(pedir).toHaveBeenCalledTimes(2);
  });

  it("también sin versión en la URL", async () => {
    const pedir = vi.fn().mockResolvedValue(RESUMEN);
    expect(await pedirCalibre(conCalibre(`/data/sessions/${SID}/meshes/vessel_tree.vtp`), pedir)).toEqual(RESUMEN);
  });

  it("si el servidor falla da null, y se vuelve a intentar después", async () => {
    const pedir = vi.fn().mockRejectedValueOnce(new Error("500")).mockResolvedValue(RESUMEN);
    const url = `/data/sessions/${SID}/meshes/vessel_tree.vtp`;
    expect(await pedirCalibre(url, pedir)).toBeNull();
    expect(await pedirCalibre(url, pedir)).toEqual(RESUMEN);
  });

  it("lo que no es una malla de sesión, ni las copias, no se pide", async () => {
    const pedir = vi.fn();
    expect(await pedirCalibre("/static/x.vtp", pedir)).toBeNull();
    expect(await pedirCalibre(`/data/sessions/${SID}/meshes/vessel_tree.suave.vtp`, pedir)).toBeNull();
    expect(await pedirCalibre(`/data/sessions/${SID}/meshes/vessel_tree.calibre.vtp`, pedir)).toBeNull();
    expect(pedir).not.toHaveBeenCalled();
  });
});

describe("capa y leyenda", () => {
  it("la capa con mapa se reconoce por el fragmento", () => {
    expect(esCapaCalibre(conCalibre("/a.vtp?v=1"))).toBe(true);
    expect(esCapaCalibre("/a.vtp?v=1")).toBe(false);
  });

  it("el degradado tiene las cinco paradas, de fino a grueso", () => {
    const g = degradadoSecuencial();
    expect(g.startsWith("linear-gradient(90deg, rgb(68, 1, 84)")).toBe(true);
    expect(g.match(/rgb\(/g)).toHaveLength(MAPA_SECUENCIAL.length);
    expect(g.endsWith("rgb(253, 231, 37))")).toBe(true);
  });
});
