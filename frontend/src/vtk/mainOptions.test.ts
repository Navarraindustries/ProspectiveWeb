import { describe, expect, it } from "vitest";
import { bandTier, MAIN_LABELS } from "./mainOptions";

describe("rótulos de las vistas", () => {
  it("VOLUMEN va entero: la celda se rotula así y «VOL» parecía otra vista", () => {
    expect(MAIN_LABELS.mip).toBe("VOLUMEN");
  });
});

describe("bandTier", () => {
  it("bandTier por ancho y táctil", () => {
    expect(bandTier(1400, false)).toBe("ancho");
    expect(bandTier(1399, false)).toBe("medio");
    expect(bandTier(1100, false)).toBe("medio");
    expect(bandTier(1099, false)).toBe("estrecho");
    expect(bandTier(800, false)).toBe("estrecho");
    expect(bandTier(799, false)).toBe("iconos");
    expect(bandTier(2132, true)).toBe("iconos");
    expect(bandTier(Number.POSITIVE_INFINITY, false)).toBe("ancho");
  });
});
