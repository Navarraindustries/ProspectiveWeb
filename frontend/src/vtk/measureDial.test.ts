import { describe, expect, it } from "vitest";
import { measureDial } from "./measureDial";

describe("measureDial", () => {
  it("sin progreso no dibuja nada y con 1 cierra la circunferencia", () => {
    expect(measureDial([0, 0, 0], [0, 0, 1], 5, 0)).toEqual([]);
    const full = measureDial([0, 0, 0], [0, 0, 1], 5, 1, { segments: 8, tickEveryMm: 100, tickLenMm: 1 });
    expect(full).toHaveLength(8);
    expect(full[7].b).toEqual(full[0].a);
    for (const l of full) expect(Math.hypot(l.a[0], l.a[1])).toBeCloseTo(5, 6);
  });
  it("las marcas van cada 2 mm de perímetro y hasta donde llega el progreso", () => {
    const half = measureDial([0, 0, 0], [0, 0, 1], 5, 0.5, { segments: 8, tickEveryMm: 2, tickLenMm: 1 });
    const ticks = half.length - 4;
    expect(ticks).toBe(Math.floor((Math.PI * 5) / 2) + 1);
  });
});
