import { describe, expect, it } from "vitest";
import { captureWithLayout, type CaptureLayoutDeps } from "./captureWithLayout";

function fakeDeps(over: Partial<CaptureLayoutDeps>, log: string[]): CaptureLayoutDeps {
  return {
    sceneIsMain: () => false,
    current: () => null,
    promote: () => { log.push("promote"); },
    restore: () => { log.push("restore"); },
    nextFrame: async () => { log.push("frame"); },
    ...over,
  };
}

describe("captureWithLayout", () => {
  it("con la escena en principal captura directamente", async () => {
    const log: string[] = [];
    const deps = fakeDeps({ sceneIsMain: () => true, current: () => async () => { log.push("capture"); return "data:main"; } }, log);
    await expect(captureWithLayout(deps)).resolves.toBe("data:main");
    expect(log).toEqual(["capture"]);
  });
  it("sin captura registrada devuelve null sin tocar la distribución", async () => {
    const log: string[] = [];
    await expect(captureWithLayout(fakeDeps({}, log))).resolves.toBeNull();
    expect(log).toEqual([]);
  });
  it("si la escena no es principal: sube, espera un fotograma, captura con el lienzo grande y restaura", async () => {
    const log: string[] = [];
    const deps = fakeDeps({ current: () => async () => { log.push("capture"); return "data:big"; } }, log);
    await expect(captureWithLayout(deps)).resolves.toBe("data:big");
    expect(log).toEqual(["promote", "frame", "capture", "restore"]);
  });
  it("restaura aunque la captura falle", async () => {
    const log: string[] = [];
    const deps = fakeDeps({ current: () => async () => { throw new Error("gl"); } }, log);
    await expect(captureWithLayout(deps)).rejects.toThrow("gl");
    expect(log).toEqual(["promote", "frame", "restore"]);
  });
});
