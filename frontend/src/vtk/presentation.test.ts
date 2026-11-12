import { describe, expect, it } from "vitest";
import type { AneurysmCandidate, MorphometryResult } from "../api/types";
import { cifrasClave, escenaVecina, escenasDisponibles } from "./presentation";

const morfo = (o: Partial<MorphometryResult>) => ({ max_diameter_mm: 6.24, neck_mm: 3.1, dome_height_mm: 5.55, ar: 1.79, neck_valid: true, ...o }) as MorphometryResult;
const cand = (d: number) => ({ max_diameter_mm: d }) as AneurysmCandidate;

describe("presentation", () => {
  it("las escenas van de lo general a lo concreto y solo las que el caso tiene", () => {
    expect(escenasDisponibles({ lesion: false, abordaje: false, linea: false }).map((e) => e.id)).toEqual(["arbol"]);
    expect(escenasDisponibles({ lesion: true, abordaje: true, linea: true }).map((e) => e.id)).toEqual(["arbol", "lesion", "abordaje", "dentro"]);
    expect(escenasDisponibles({ lesion: true, abordaje: false, linea: true }).map((e) => e.id)).toEqual(["arbol", "lesion", "dentro"]);
  });

  it("pasar de escena no da la vuelta", () => {
    expect(escenaVecina(0, -1, 3)).toBe(0);
    expect(escenaVecina(0, 1, 3)).toBe(1);
    expect(escenaVecina(2, 1, 3)).toBe(2);
  });

  it("con morfometría enseña sus medidas con coma decimal", () => {
    const c = cifrasClave(morfo({}), cand(9));
    expect(c.map((x) => x.etiqueta)).toEqual(["Ø máximo", "Cuello", "Altura del domo", "Relación de aspecto"]);
    expect(c[0]).toEqual({ etiqueta: "Ø máximo", valor: "6,2", unidad: "mm" });
    expect(c[3].valor).toBe("1,79");
  });

  it("sin cuello válido no enseña nada que dependa de él", () => {
    expect(cifrasClave(morfo({ neck_valid: false }), null).map((x) => x.etiqueta)).toEqual(["Ø máximo"]);
  });

  it("sin morfometría, la estimación del detector marcada como tal", () => {
    expect(cifrasClave(null, cand(5.27))).toEqual([{ etiqueta: "Ø máximo", valor: "5,3", unidad: "mm", estimada: true }]);
    expect(cifrasClave(null, cand(0))).toEqual([]);
    expect(cifrasClave(null, null)).toEqual([]);
  });
});
