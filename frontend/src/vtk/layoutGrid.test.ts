import { describe, expect, it } from "vitest";
import { ALL_PANES, DEFAULT_LAYOUT, FRACTION_MAX, FRACTION_MIN, setPreset, swapPanes, toggleEqual, togglePane, type PaneId, type ViewerLayout } from "./layout";
import { COMPACT_MAX_WIDTH_PX, COMPACT_MIN_HEIGHT_PX, SPLITTER_PX, effectivePreset, fractionFromPointer, gridFor, isCompact } from "./layoutGrid";

const solo = (id: PaneId): ViewerLayout => ({ ...DEFAULT_LAYOUT, main: id, side: ALL_PANES.filter((p) => p !== id) as ViewerLayout["side"], hidden: ALL_PANES.filter((p) => p !== id) });
const hide = (l: ViewerLayout, ...ids: PaneId[]) => ids.reduce(togglePane, l);

describe("effectivePreset", () => {
  it("derecha en una ventana vertical se pinta como abajo, sin tocar el estado", () => {
    expect(effectivePreset(DEFAULT_LAYOUT, true)).toBe("abajo");
    expect(effectivePreset(DEFAULT_LAYOUT, false)).toBe("derecha");
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
  it("una sola vista: todo el espacio y las demás minimizadas", () => {
    const g = gridFor(solo("scene"), false);
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

/** Qué vista se pinta en cada hueco, en orden de lectura y sin repetir. */
function porOrden(g: ReturnType<typeof gridFor>): string[] {
  const byslot = Object.fromEntries(Object.entries(g.slotOf).map(([id, s]) => [s, id]));
  return [...new Set(g.areas.replace(/"/g, "").split(/\s+/))].filter((s) => s !== "gap").map((s) => byslot[s]);
}

describe("el espacio se reparte según las vistas encendidas", () => {
  it("con menos vistas la columna tiene menos filas y ningún hueco vacío", () => {
    const g3 = gridFor(hide(DEFAULT_LAYOUT, "sagital", "mip"), false);
    expect(g3.rows).toBe("repeat(2, minmax(0, 1fr))");
    expect(g3.areas).toBe('"main gap s0" "main gap s1"');
    expect(g3.slotOf).toEqual({ scene: "main", axial: "s0", coronal: "s1" });
    const g2 = gridFor(hide(DEFAULT_LAYOUT, "coronal", "sagital", "mip"), false);
    expect(g2.rows).toBe("minmax(0, 1fr)");
    expect(g2.areas).toBe('"main gap s0"');
  });
  it("arriba: la franja de abajo tiene tantas columnas como vistas pequeñas", () => {
    const g = gridFor(hide(setPreset(DEFAULT_LAYOUT, "abajo"), "sagital", "mip"), false);
    expect(g.columns).toBe("repeat(2, minmax(0, 1fr))");
    expect(g.areas).toBe('"main main" "gap gap" "s0 s1"');
  });
  it("cada número de vistas pinta exactamente sus huecos, con y sin igualar", () => {
    const quitar: PaneId[][] = [[], ["mip"], ["mip", "sagital"], ["mip", "sagital", "coronal"]];
    for (const ids of quitar) {
      for (const l of [hide(DEFAULT_LAYOUT, ...ids), toggleEqual(hide(DEFAULT_LAYOUT, ...ids))]) {
        const g = gridFor(l, false);
        expect(porOrden(g)).toHaveLength(5 - ids.length);
        expect(Object.keys(g.slotOf)).toHaveLength(5 - ids.length);
      }
    }
  });
  it("igualar no lleva separador", () => {
    expect(gridFor(toggleEqual(DEFAULT_LAYOUT), false).splitter).toBeNull();
  });
  it("cuatro iguales son una rejilla 2×2; arrastrar cambia el cuadrante", () => {
    const l = toggleEqual(hide(DEFAULT_LAYOUT, "mip"));
    const g = gridFor(l, false);
    expect(g.columns).toBe("repeat(2, minmax(0, 1fr))");
    expect(g.rows).toBe("repeat(2, minmax(0, 1fr))");
    expect(porOrden(g)).toEqual(["scene", "axial", "coronal", "sagital"]);
    expect(porOrden(gridFor(swapPanes(l, "axial", "sagital"), false))).toEqual(["scene", "sagital", "coronal", "axial"]);
  });
  it("cinco iguales van tres arriba y dos abajo", () => {
    expect(gridFor(toggleEqual(DEFAULT_LAYOUT), false).areas).toBe('"main main s0 s0 s1 s1" "s2 s2 s2 s3 s3 s3"');
  });
  it("dos iguales respetan el lado: en columnas o una sobre otra", () => {
    const dos = toggleEqual(hide(DEFAULT_LAYOUT, "coronal", "sagital", "mip"));
    expect(gridFor(dos, false).areas).toBe('"main s0"');
    expect(gridFor({ ...dos, preset: "abajo" }, false).areas).toBe('"main" "s0"');
  });
});
