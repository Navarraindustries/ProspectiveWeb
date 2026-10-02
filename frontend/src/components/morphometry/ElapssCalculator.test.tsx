/* ELAPSS: lo que manda, lo que enseña y lo que nunca marca solo. */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../api/client", () => ({
  api: {
    elapss: vi.fn().mockResolvedValue({
      earlier_sah_pts: 1, location_pts: 3, age_pts: 2, population_pts: 0, size_pts: 13, shape_pts: 4,
      total_score: 23, score_band: "20-24", growth_3yr_pct: 25.8, growth_5yr_pct: 39.9,
      notes: ["Predice CRECIMIENTO, no rotura: orienta cada cuánto repetir la imagen."], sources: [],
    }),
  },
}));

import { api } from "../../api/client";
import { ElapssCalculator } from "./ElapssCalculator";

describe("ELAPSS", () => {
  it("rellena el tamaño desde la morfometría y manda los factores", async () => {
    render(<ElapssCalculator maxDiameterMm={7.66} sessionId="s1" />);
    expect((screen.getByLabelText("Tamaño (mm)") as HTMLInputElement).value).toBe("7.7");
    fireEvent.change(screen.getByLabelText("Edad (años)"), { target: { value: "68" } });
    fireEvent.click(screen.getByText(/Forma irregular/));
    fireEvent.click(screen.getByText("Calcular ELAPSS"));
    await waitFor(() => expect(api.elapss).toHaveBeenCalledWith({
      session_id: "s1", population: "other", location: "ica_aca_acom", age_years: 68,
      size_mm: 7.7, earlier_sah: false, irregular: true,
    }));
    expect(await screen.findByText("25.8 %")).toBeInTheDocument();
    expect(screen.getByText(/de crecimiento a 3 años/)).toBeInTheDocument();
  });

  it("si la morfometría sugiere contorno irregular, lo dice pero no lo marca", () => {
    render(<ElapssCalculator maxDiameterMm={6} sessionId="s1" irregularHint />);
    expect(screen.getByText(/contorno ondulado/)).toBeInTheDocument();
    expect((screen.getByLabelText(/Forma irregular/) as HTMLInputElement).checked).toBe(false);
  });
});
