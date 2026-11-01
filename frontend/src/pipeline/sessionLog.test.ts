import { describe, it, expect } from "vitest";
import { entradaPara } from "./sessionLog";

const t = new Date(2026, 9, 31, 10, 0, 0);

describe("entradaPara", () => {
  it("la lista de candidatos cuenta cuántos hay", () => {
    const e = entradaPara("candidatos", [], [1, 2, 3, 4, 5], "Detección", t);
    expect(e?.texto).toBe("Detección · 5 candidatos");
    expect(e?.paso).toBe("Detección");
    expect(e?.at).toBe(t);
  });
  it("la morfometría lleva el diámetro con coma decimal", () => {
    const e = entradaPara("morfometria", null, { max_diameter_mm: 11 }, "Morfometría", t);
    expect(e?.texto).toBe("Medida · Ø máx. 11,0 mm");
  });
  it("serie, segmentación, elegido y guardado", () => {
    expect(entradaPara("serie", null, { slices: 120 }, "Carga", t)?.texto).toBe("DICOM cargado · 120 cortes");
    expect(entradaPara("segmentacion", null, { vertices: 80000 }, "Segmentación", t)?.texto).toBe("Segmentación · 80000 vértices");
    expect(entradaPara("candidato", null, "c2", "Detección", t)?.texto).toBe("Elegido c2");
    expect(entradaPara("guardado", null, new Date(), "Informe", t)?.texto).toBe("Progreso guardado");
  });
  it("un valor que sigue igual no añade nada", () => {
    expect(entradaPara("morfometria", { max_diameter_mm: 11 }, { max_diameter_mm: 11 }, "x", t)).toBeNull();
    expect(entradaPara("candidatos", [1], [1, 2], "x", t)).toBeNull();
    expect(entradaPara("candidato", "c2", "c2", "x", t)).toBeNull();
    expect(entradaPara("candidatos", [], [], "x", t)).toBeNull();
  });
});

describe("entradaPara sin la cifra", () => {
  it("no imprime «undefined»", () => {
    expect(entradaPara("serie", null, {}, "x", t)).toBeNull();
    expect(entradaPara("segmentacion", null, {}, "x", t)).toBeNull();
    expect(entradaPara("morfometria", null, {}, "x", t)).toBeNull();
  });
});
