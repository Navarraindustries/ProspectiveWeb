import { describe, expect, it } from "vitest";
import { MAIN_LABELS, mainOptions } from "./mainOptions";

describe("mainOptions", () => {
  it("cinco vistas en orden fijo con rótulos cortos", () => {
    expect(mainOptions().map((o) => o.key)).toEqual(["scene", "axial", "coronal", "sagital", "mip"]);
    expect(mainOptions().map((o) => o.label)).toEqual(["3D", "AX", "COR", "SAG", "VOL"]);
    expect(MAIN_LABELS.mip).toBe("VOL");
  });
  it("cada opción explica qué hace", () => {
    for (const o of mainOptions()) expect(o.title).toMatch(/principal/i);
  });
});
