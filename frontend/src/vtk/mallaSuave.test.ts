import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../api/client", () => ({ api: { smoothMesh: vi.fn() } }));
import { olvidarCopiasSuaves, urlSuave } from "./mallaSuave";

const SID = "86e46bdb-0f84-49b8-8381-b2de86ad028f";

describe("urlSuave", () => {
  beforeEach(() => olvidarCopiasSuaves());

  it("pide la copia de una malla de sesión una sola vez por versión", async () => {
    const pedir = vi.fn().mockResolvedValue({ url: `/data/sessions/${SID}/meshes/vessel_tree.suave.vtp?v=2` });
    const url = `/data/sessions/${SID}/meshes/vessel_tree.vtp?v=1`;
    expect(await urlSuave(url, pedir)).toContain("vessel_tree.suave.vtp");
    await urlSuave(url, pedir);
    expect(pedir).toHaveBeenCalledTimes(1);
    expect(pedir).toHaveBeenCalledWith(SID, "vessel_tree.vtp");
    await urlSuave(`/data/sessions/${SID}/meshes/vessel_tree.vtp?v=9`, pedir);
    expect(pedir).toHaveBeenCalledTimes(2);
  });

  it("si el servidor falla se ve la original, y se vuelve a intentar después", async () => {
    const pedir = vi.fn().mockRejectedValueOnce(new Error("500")).mockResolvedValue({ url: "/x.suave.vtp" });
    const url = `/data/sessions/${SID}/meshes/vessel_tree.vtp`;
    expect(await urlSuave(url, pedir)).toBe(url);
    expect(await urlSuave(url, pedir)).toBe("/x.suave.vtp");
  });

  it("lo que no es una malla de sesión se queda como está", async () => {
    const pedir = vi.fn();
    expect(await urlSuave("/static/demo.vtp", pedir)).toBe("/static/demo.vtp");
    expect(await urlSuave(`/data/sessions/${SID}/meshes/a.suave.vtp`, pedir)).toBe(`/data/sessions/${SID}/meshes/a.suave.vtp`);
    expect(pedir).not.toHaveBeenCalled();
  });
});
