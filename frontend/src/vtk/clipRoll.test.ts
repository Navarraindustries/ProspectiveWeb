/* El giro de partida del clip: palas paralelas a la arteria madre.
 *
 * En Case 3 (22-11) el clip se añadía con giro 0, que solo es la rotación
 * mínima de su eje al del cuello: las palas cruzaban la basilar. */
import { describe, expect, it } from "vitest";
import { applyPoint, poseMatrix, rollAlong } from "./clipPose";
import { neckRoll } from "../components/planning/placedClips";
import type { MorphometryResult } from "../api/types";
import type { Vec3 } from "./geometry";

const unit = (v: Vec3): Vec3 => { const l = Math.hypot(...v); return [v[0] / l, v[1] / l, v[2] / l]; };
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
/** Hacia dónde apuntan las palas (+x local) con esa normal y ese giro. */
const palas = (normal: Vec3, roll: number): Vec3 =>
  unit(applyPoint(poseMatrix([0, 0, 0], normal, roll), [1, 0, 0]));

describe("rollAlong", () => {
  it.each<[Vec3, Vec3]>([
    [[0, 0, 1], [0, 1, 0]],
    [[0, 0, 1], [1, 1, 0]],
    [[0, 1, 0], [1, 0, 0]],
    [[0.3, -0.5, 0.8], [1, 0.2, 0]],
    [[0, 0, -1], [1, 0, 0]],            // antiparalela: la rama de 180° de VTK
    [[-0.6, 0.1, -0.2], [0, 0, 1]],
  ])("normal %j, arteria %j: las palas quedan paralelas a ella", (n, d) => {
    const g = rollAlong(n, d);
    expect(g).not.toBeNull();
    expect(g!).toBeGreaterThan(-90);
    expect(g!).toBeLessThanOrEqual(90);
    // La parte de d en el plano del cuello, y las palas: paralelas (±1 por el redondeo a 1°).
    const nn = unit(n);
    const enPlano = unit([d[0] - dot(d, nn) * nn[0], d[1] - dot(d, nn) * nn[1], d[2] - dot(d, nn) * nn[2]]);
    expect(Math.abs(dot(palas(n, g!), enPlano))).toBeGreaterThan(0.999);
  });

  it("una arteria a lo largo del eje del cuello no da dirección", () => {
    expect(rollAlong([0, 0, 1], [0, 0.05, 1])).toBeNull();
  });
});

describe("neckRoll", () => {
  const base = { principal_axis: [0, 0, 1], neck_origin: { x: 0, y: 0, z: 0 } };
  it("con la dirección de la arteria, gira las palas hacia ella", () => {
    const m = { ...base, parent_direction: { x: 0, y: 1, z: 0 } } as unknown as MorphometryResult;
    expect(Math.abs(neckRoll(m))).toBe(90);
  });
  it("sin dirección (medida antigua o vaso sin eje claro), 0 como antes", () => {
    expect(neckRoll(base as unknown as MorphometryResult)).toBe(0);
    expect(neckRoll({ ...base, parent_direction: null } as unknown as MorphometryResult)).toBe(0);
    expect(neckRoll(null)).toBe(0);
  });
});
