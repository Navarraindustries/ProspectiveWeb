import { describe, expect, it } from "vitest";
import { glass } from "./glass";

describe("helper de cristal", () => {
  it("el cristal normal usa los tokens y desenfoque de 30", () => {
    const s = glass();
    expect(s.background).toBe("var(--glass-luz), var(--glass)");
    expect(s.backdropFilter).toBe("blur(var(--glass-blur)) saturate(150%)");
    expect(s.WebkitBackdropFilter).toBe(s.backdropFilter);
    expect(s.border).toBe("var(--glass-rim) solid var(--glass-border)");
    expect(String(s.boxShadow)).toContain("var(--glass-highlight)");
  });
  it("denso y visor", () => {
    expect(glass("dense").background).toBe("var(--glass-luz), var(--glass-dense)");
    // El visor tiene su propio token: flota sobre la imagen sin --veil y pide más opacidad.
    expect(glass("viewer").background).toBe("var(--glass-viewer)");
    expect(glass("viewer").backdropFilter).toBe("blur(var(--glass-blur-viewer)) saturate(150%)");
  });
  it("plano: mismo fondo y borde que el normal, sin desenfoque propio", () => {
    const s = glass("flat");
    expect(s.background).toBe("var(--glass-luz), var(--glass)");
    expect(s.border).toBe("var(--glass-rim) solid var(--glass-border)");
    expect(s.boxShadow).toBe("var(--glass-highlight)");
    expect(s.backdropFilter).toBeUndefined();
    expect(s.WebkitBackdropFilter).toBeUndefined();
  });
  it("ningún valor lleva un color literal", () => {
    for (const k of ["normal", "dense", "viewer", "flat"] as const)
      expect(JSON.stringify(glass(k))).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i);
  });
});
