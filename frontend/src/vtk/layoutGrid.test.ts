import { describe, expect, it } from "vitest";
import { DEFAULT_LAYOUT, FRACTION_MAX, FRACTION_MIN, setPreset } from "./layout";
import { COMPACT_MAX_WIDTH_PX, COMPACT_MIN_HEIGHT_PX, SPLITTER_PX, effectivePreset, fractionFromPointer, gridFor, isCompact } from "./layoutGrid";

describe("effectivePreset", () => {
  it("derecha en una ventana vertical se pinta como abajo, sin tocar el estado", () => {
    expect(effectivePreset(DEFAULT_LAYOUT, true)).toBe("abajo");
    expect(effectivePreset(DEFAULT_LAYOUT, false)).toBe("derecha");
    expect(effectivePreset(setPreset(DEFAULT_LAYOUT, "sola"), true)).toBe("sola");
  });
});

describe("gridFor", () => {
  it("derecha: dos columnas con el separador y cuatro filas", () => {
    const g = gridFor(DEFAULT_LAYOUT, false);
    expect(g.columns).toBe(`0.72fr ${SPLITTER_PX}px 0.28fr`);
    expect(g.rows).toBe("repeat(4, minmax(0, 1fr))");
    expect(g.areas).toBe('"main gap s0" "main gap s1" "main gap s2" "main gap s3"');
    expect(g.slotOf).toEqual({ scene: "main", axial: "s0", coronal: "s1", sagital: "s2", mip: "s3" });
    expect(g.splitter).toBe("x");
    expect(Object.values(g.visible).every(Boolean)).toBe(true);
  });
  it("abajo: dos filas con el separador y cuatro columnas", () => {
    const g = gridFor(setPreset(DEFAULT_LAYOUT, "abajo"), false);
    expect(g.rows).toBe(`0.74fr ${SPLITTER_PX}px 0.26fr`);
    expect(g.columns).toBe("repeat(4, minmax(0, 1fr))");
    expect(g.areas).toBe('"main main main main" "gap gap gap gap" "s0 s1 s2 s3"');
    expect(g.splitter).toBe("y");
  });
  it("sola: una celda y las demás ocultas", () => {
    const g = gridFor(setPreset(DEFAULT_LAYOUT, "sola"), false);
    expect(g.areas).toBe('"main"');
    expect(g.visible).toEqual({ scene: true, axial: false, coronal: false, sagital: false, mip: false });
    expect(g.splitter).toBeNull();
  });
  it("la fracción se escribe con dos decimales y su complemento suma 1", () => {
    const g = gridFor({ ...DEFAULT_LAYOUT, mainFraction: 0.6 }, false);
    expect(g.columns).toBe(`0.60fr ${SPLITTER_PX}px 0.40fr`);
  });
});

describe("fractionFromPointer", () => {
  const rect = { left: 100, top: 50, width: 1000, height: 500 };
  it("en x, la fracción es la posición relativa del puntero", () => {
    expect(fractionFromPointer(rect, 700, 0, "x")).toBeCloseTo(0.6);
  });
  it("en y, usa la altura", () => {
    expect(fractionFromPointer(rect, 0, 400, "y")).toBeCloseTo(0.7);
  });
  it("acota a los límites", () => {
    expect(fractionFromPointer(rect, 100, 0, "x")).toBe(FRACTION_MIN);
    expect(fractionFromPointer(rect, 1100, 0, "x")).toBe(FRACTION_MAX);
  });
});

describe("isCompact", () => {
  it("compacto por debajo de 420 px de ancho", () => {
    expect(isCompact(COMPACT_MAX_WIDTH_PX - 1, 900)).toBe(true);
    expect(isCompact(COMPACT_MAX_WIDTH_PX, 900)).toBe(false);
  });
  it("compacto por debajo de 260 px de alto aunque sea ancha", () => {
    expect(COMPACT_MIN_HEIGHT_PX).toBe(260);
    expect(isCompact(421, 221)).toBe(true);
    expect(isCompact(900, COMPACT_MIN_HEIGHT_PX - 1)).toBe(true);
    expect(isCompact(900, COMPACT_MIN_HEIGHT_PX)).toBe(false);
  });
});

describe("cuatro", () => {
  it("cuatro es una rejilla 2×2 sin separador con side[3] oculta", () => {
    const g = gridFor({ ...DEFAULT_LAYOUT, preset: "cuatro" }, false);
    expect(g.areas).toBe('"main s0" "s1 s2"'); expect(g.splitter).toBeNull();
    expect(g.visible.mip).toBe(false); expect(g.visible.scene).toBe(true);
    expect(gridFor({ ...DEFAULT_LAYOUT, preset: "cuatro" }, true).areas).toBe('"main s0" "s1 s2"');   // en vertical también 2×2
  });
});
