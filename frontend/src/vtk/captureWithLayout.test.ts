import { describe, expect, it } from "vitest";
import { captureWithLayout, type CaptureFn, type CaptureLayoutDeps } from "./captureWithLayout";

function fakeDeps(over: Partial<CaptureLayoutDeps>, log: string[]): CaptureLayoutDeps {
  return {
    sceneIsMain: () => false,
    current: () => null,
    promote: () => { log.push("promote"); },
    restore: () => { log.push("restore"); },
    waitForCapture: () => new Promise<CaptureFn | null>(() => { /* nunca */ }),
    nextFrame: async () => { log.push("frame"); },
    ...over,
  };
}

describe("captureWithLayout", () => {
  it("captures directly when the scene is already the main pane", async () => {
    const log: string[] = [];
    const deps = fakeDeps({
      sceneIsMain: () => true,
      current: () => async () => { log.push("capture"); return "data:main"; },
    }, log);
    await expect(captureWithLayout(deps)).resolves.toBe("data:main");
    expect(log).toEqual(["capture"]);
  });

  it("returns null without touching the layout when the main scene has no capture", async () => {
    const log: string[] = [];
    await expect(captureWithLayout(fakeDeps({ sceneIsMain: () => true }, log))).resolves.toBeNull();
    expect(log).toEqual([]);
  });

  it("promotes the scene, waits for the remounted capture and a frame, captures, then restores", async () => {
    const log: string[] = [];
    let register!: (fn: CaptureFn | null) => void;
    const deps = fakeDeps({
      // La captura vieja (la de la franja) no debe usarse.
      current: () => async () => { log.push("capture-strip"); return "data:strip"; },
      waitForCapture: () => { log.push("arm"); return new Promise((r) => { register = r; }); },
    }, log);
    const done = captureWithLayout(deps);
    await Promise.resolve();
    expect(log).toEqual(["arm", "promote"]);
    register(async () => { log.push("capture-main"); return "data:main"; });
    await expect(done).resolves.toBe("data:main");
    expect(log).toEqual(["arm", "promote", "frame", "capture-main", "restore"]);
  });

  it("restores the layout when the scene never registers in time", async () => {
    const log: string[] = [];
    const deps = fakeDeps({ waitForCapture: async () => null }, log);
    await expect(captureWithLayout(deps)).resolves.toBeNull();
    expect(log).toEqual(["promote", "restore"]);
  });

  it("restores the layout when the capture itself fails", async () => {
    const log: string[] = [];
    const deps = fakeDeps({
      waitForCapture: async () => async () => { throw new Error("gl"); },
    }, log);
    await expect(captureWithLayout(deps)).rejects.toThrow("gl");
    expect(log).toEqual(["promote", "frame", "restore"]);
  });
});
