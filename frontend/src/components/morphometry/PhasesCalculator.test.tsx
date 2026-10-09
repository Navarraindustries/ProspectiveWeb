/* PHASES partía de una edad inventada («60»); ahora de la del paciente, y sin ella no calcula (spec §8). */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
let planning: Record<string, unknown> = {};
vi.mock("../../store/planning", () => ({ usePlanning: () => planning }));
vi.mock("../../api/client", () => ({ api: { phases: vi.fn() } }));
import { PhasesCalculator } from "./PhasesCalculator";

describe("PHASES y la edad", () => {
  it("rellena la edad desde la fecha de nacimiento", () => {
    const d = new Date(); d.setFullYear(d.getFullYear() - 61); d.setDate(d.getDate() - 2);
    planning = { patient: { dob: d.toISOString().slice(0, 10) } };
    render(<PhasesCalculator maxDiameterMm={6} sessionId="s" />);
    expect((screen.getByLabelText("Edad (años)") as HTMLInputElement).value).toBe("61");
  });
  it("sin fecha el campo queda vacío y no se puede calcular", () => {
    planning = { patient: null };
    render(<PhasesCalculator maxDiameterMm={6} sessionId="s" />);
    expect((screen.getByLabelText("Edad (años)") as HTMLInputElement).value).toBe("");
    expect(screen.getByRole("button", { name: "Calcular PHASES" })).toBeDisabled();
  });
});
