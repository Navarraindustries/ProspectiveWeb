import { describe, expect, it } from "vitest";
import { glass } from "./glass";

describe("helper de cristal", () => {
  it("el cristal normal usa los tokens y desenfoque de 30", () => {
    const s = glass();
    expect(s.background).toBe("var(--glass)");
    expect(s.backdropFilter).toBe("blur(var(--glass-blur)) saturate(130%)");
    expect(s.WebkitBackdropFilter).toBe(s.backdropFilter);
    expect(s.border).toBe("1px solid var(--glass-border)");
    expect(String(s.boxShadow)).toContain("var(--glass-highlight)");
  });
  it("denso y visor", () => {
    expect(glass("dense").background).toBe("var(--glass-dense)");
    expect(glass("viewer").background).toBe("var(--glass-dense)");
    expect(glass("viewer").backdropFilter).toBe("blur(var(--glass-blur-viewer)) saturate(130%)");
  });
  it("ningún valor lleva un color literal", () => {
    for (const k of ["normal", "dense", "viewer"] as const)
      expect(JSON.stringify(glass(k))).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i);
  });
});
