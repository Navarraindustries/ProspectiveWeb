import { describe, expect, it } from "vitest";
import type { Orientation } from "./geometry";
import { BARRIDO_MS, FRANJA_MIN_MM, frenteBarrido, superiorEnMalla, tramoBarrido } from "./meshSweep";

const orient = (direction: number[] | null): Orientation => ({ direction, manual: null }) as unknown as Orientation;

describe("meshSweep", () => {
  it("el superior sigue la dirección del volumen", () => {
    const id = superiorEnMalla(orient([1, 0, 0, 0, 1, 0, 0, 0, 1]));
    expect(id.map((v) => Math.round(v * 1e6) / 1e6)).toEqual([0, 0, 1]);
    // Columnas, filas y cortes con el corte hacia anterior (como el Case 3):
    // el superior cae en otro eje de la malla, y sigue siendo unitario.
    const s = superiorEnMalla(orient([1, 0, 0, 0, 0, -1, 0, 1, 0]));
    expect(Math.hypot(...s)).toBeCloseTo(1);
    expect(Math.abs(s[2])).toBeLessThan(1e-9);
  });

  it("el tramo es la proyección de la caja, con franja mínima", () => {
    const t = tramoBarrido([0, 10, 0, 20, 5, 45], [0, 0, 1]);
    expect(t.desde).toBe(5);
    expect(t.hasta).toBe(45);
    expect(t.franja).toBeCloseTo(1.6);
    expect(tramoBarrido([0, 1, 0, 1, 0, 1], [0, 0, 1]).franja).toBe(FRANJA_MIN_MM);
  });

  it("el frente sale de debajo de la malla y acaba por encima", () => {
    const t = { desde: 0, hasta: 40, franja: 2 };
    expect(frenteBarrido(0, t)).toEqual({ frente: -2, fin: false });
    expect(frenteBarrido(BARRIDO_MS, t)).toEqual({ frente: 42, fin: true });
    expect(frenteBarrido(BARRIDO_MS * 2, t).frente).toBe(42);
    // La curva del proyecto (--ease-in-out) frena más de lo que arranca: a
    // mitad de tiempo ya pasó la mitad del camino, sin llegar al final.
    const mitad = frenteBarrido(BARRIDO_MS / 2, t).frente;
    expect(mitad).toBeGreaterThan(20);
    expect(mitad).toBeLessThan(42);
    let prev = -Infinity;
    for (let ms = 0; ms <= BARRIDO_MS; ms += 40) { const f = frenteBarrido(ms, t).frente; expect(f).toBeGreaterThanOrEqual(prev); prev = f; }
  });
});
