import { describe, expect, it } from "vitest";
import { joinTipo, splitTipo } from "./tipoAneurisma";

describe("tipo de aneurisma: morfología y tamaño en una columna", () => {
  it("une con « · » y omite la parte vacía", () => {
    expect(joinTipo("Sacular", "Pequeño (< 10 mm)")).toBe("Sacular · Pequeño (< 10 mm)");
    expect(joinTipo("Sacular", "")).toBe("Sacular");
    expect(joinTipo("", "Gigante (> 25 mm)")).toBe("Gigante (> 25 mm)");
    expect(joinTipo("", "")).toBe("");
  });
  it("separa un valor con las dos partes", () => {
    expect(splitTipo("Fusiforme · Grande (10–25 mm)")).toEqual({ morfologia: "Fusiforme", tamano: "Grande (10–25 mm)" });
  });
  it("un valor antiguo de tamaño cae en Tamaño, también con guion corto", () => {
    expect(splitTipo("Gigante (> 25 mm)")).toEqual({ morfologia: "", tamano: "Gigante (> 25 mm)" });
    expect(splitTipo("Grande (10-25 mm)")).toEqual({ morfologia: "", tamano: "Grande (10–25 mm)" });
  });
  it("un valor antiguo de morfología u «Otro» cae en Morfología", () => {
    expect(splitTipo("Blíster")).toEqual({ morfologia: "Blíster", tamano: "" });
    expect(splitTipo("Otro")).toEqual({ morfologia: "Otro", tamano: "" });
  });
  it("vacío o ausente da dos campos vacíos", () => {
    expect(splitTipo("")).toEqual({ morfologia: "", tamano: "" });
    expect(splitTipo(undefined)).toEqual({ morfologia: "", tamano: "" });
  });
});
