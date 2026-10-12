/* PHASES partía de una edad inventada («60»); ahora de la del paciente, y sin ella no calcula (spec §8). */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

/* F1-15 / F1-14 / F1-157: el tamaño decía un número sin decir de dónde salía, y
   un Ø de 10,9 mm (Case 3) da 10 puntos donde uno de 9,5 da 7. */
describe("PHASES y el corte de tamaño", () => {
  // La localización ya no se elige aquí: llega de Morfometría en el store (F1-165).

  it("el texto nombra el diámetro que toma", () => {
    planning = { patient: null };
    render(<PhasesCalculator maxDiameterMm={10.9} sessionId="s" />);
    expect(screen.getByText(/Ø máximo medido 10,9 mm/)).toBeInTheDocument();
  });

  it("con 9,5 mm avisa del corte de 10 mm con los puntos", () => {
    planning = { patient: null, aneurysmSite: "basilar" };
    render(<PhasesCalculator maxDiameterMm={9.5} sessionId="s" />);
    const aviso = screen.getByText(/junto al corte de 10 mm/);
    expect(aviso.textContent).toContain("10 mm");
    expect(aviso.textContent).toContain("7 puntos");
  });

  it("10,9 frente a 9,5 del cuerpo muestra el aviso de tramo", () => {
    planning = { patient: null, aneurysmSite: "basilar" };
    render(<PhasesCalculator maxDiameterMm={10.9} bodyDiameterMm={9.5} sessionId="s" />);
    expect(screen.getByText(/junto al corte de 10 mm/).textContent)
      .toContain("con 9,5 mm el PHASES baja de 10 a 7 puntos");
    expect(screen.getByText(/Ø máximo medido/).textContent).toContain("Ø del cuerpo 9,5 mm");
  });

  it("lejos de un corte no avisa", () => {
    planning = { patient: null };
    render(<PhasesCalculator maxDiameterMm={8.5} sessionId="s" />);
    expect(screen.queryByText(/junto al corte/)).not.toBeInTheDocument();
  });

  it("con el aviso del recorte, el tamaño lleva «provisional»", () => {
    planning = { patient: null };
    render(<PhasesCalculator maxDiameterMm={10.9} sessionId="s" provisional />);
    expect(screen.getByText(/Ø máximo medido 10,9 mm/).textContent).toContain("provisional");
  });

  it("el resultado se rotula con la tabla publicada", async () => {
    planning = { patient: { dob: "1999-01-01" }, setTreatment: () => {}, aneurysmSite: "basilar" };
    const { api } = await import("../../api/client");
    (api.phases as ReturnType<typeof vi.fn>).mockResolvedValue({
      population_pts: 0, hypertension_pts: 0, age_pts: 0, size_pts: 6, sah_pts: 0, site_pts: 4,
      total_score: 10, risk_5yr_pct: 5.3, risk_band: "moderate",
    });
    render(<PhasesCalculator maxDiameterMm={10.9} sessionId="s" />);
    fireEvent.click(screen.getByRole("button", { name: "Calcular PHASES" }));
    expect(await screen.findByText("PHASES 10 · 5,3 % a 5 años (Greving 2014)")).toBeInTheDocument();
  });
});

describe("PHASES con el tamaño escrito a mano", () => {
  it("deja de decir que toma el Ø medido", () => {
    planning = { patient: null };
    render(<PhasesCalculator maxDiameterMm={10.9} sessionId="s" />);
    fireEvent.change(screen.getByLabelText("Tamaño (mm)"), { target: { value: "8" } });
    expect(screen.getByText(/Tamaño escrito a mano \(8,0 mm\); el Ø máximo medido es 10,9 mm/)).toBeInTheDocument();
    expect(screen.queryByText(/Se toma el Ø máximo/)).not.toBeInTheDocument();
  });
});

/* F1-165: la localización se elegía cuatro veces; ahora se hereda de Morfometría. */
describe("PHASES con la localización de Morfometría", () => {
  it("con basilar suma +4 de localización sin tocar nada", async () => {
    planning = { patient: { dob: "1950-01-01" }, setTreatment: () => {}, aneurysmSite: "basilar" };
    const { api } = await import("../../api/client");
    const phases = api.phases as ReturnType<typeof vi.fn>;
    phases.mockReset();
    phases.mockResolvedValue({
      population_pts: 0, hypertension_pts: 0, age_pts: 1, size_pts: 0, sah_pts: 0, site_pts: 4,
      total_score: 5, risk_5yr_pct: 1.3, risk_band: "low",
    });
    render(<PhasesCalculator maxDiameterMm={6} sessionId="s" />);
    expect(screen.queryByLabelText("Localización")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Calcular PHASES" }));
    expect(phases).toHaveBeenCalledWith(expect.objectContaining({ site: "aca_pcom_posterior" }));
    expect(await screen.findByText("+4")).toBeInTheDocument();
  });

  it("sin localización lo dice y no calcula", () => {
    planning = { patient: { dob: "1950-01-01" }, aneurysmSite: null };
    render(<PhasesCalculator maxDiameterMm={6} sessionId="s" />);
    expect(screen.getByText("Elige la localización en Morfometría")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Calcular PHASES" })).toBeDisabled();
  });
});

/* Revisión de la Tarea 2: con el resultado en pantalla, cambiar la localización
   lo recalcula (el informe también se recalcula) en vez de dejar uno viejo. */
describe("PHASES al cambiar la localización", () => {
  it("recalcula el resultado de la pantalla con la nueva categoría", async () => {
    planning = { patient: { dob: "1950-01-01" }, setTreatment: () => {}, aneurysmSite: "ACM — Arteria Cerebral Media" };
    const { api } = await import("../../api/client");
    const phases = api.phases as ReturnType<typeof vi.fn>;
    phases.mockReset();
    phases.mockResolvedValue({
      population_pts: 0, hypertension_pts: 0, age_pts: 1, size_pts: 0, sah_pts: 0, site_pts: 2,
      total_score: 3, risk_5yr_pct: 0.9, risk_band: "low",
    });
    const { rerender } = render(<PhasesCalculator maxDiameterMm={6} sessionId="s" />);
    fireEvent.click(screen.getByRole("button", { name: "Calcular PHASES" }));
    await screen.findByText("+2");
    planning = { ...planning, aneurysmSite: "Basilar (punta, tronco o AICA)" };
    rerender(<PhasesCalculator maxDiameterMm={6} sessionId="s" />);
    await waitFor(() => expect(phases).toHaveBeenLastCalledWith(
      expect.objectContaining({ site: "aca_pcom_posterior" })));
    expect(phases).toHaveBeenCalledTimes(2);
  });
});
