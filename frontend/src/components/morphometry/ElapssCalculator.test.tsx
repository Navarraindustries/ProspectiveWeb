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

// La localización llega de Morfometría (F1-165): ELAPSS ya no la pregunta.
let planning: Record<string, unknown> = { aneurysmSite: "ACA / ACoA — Arteria Comunicante Anterior" };
vi.mock("../../store/planning", () => ({ usePlanning: () => planning }));

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
    render(<ElapssCalculator maxDiameterMm={6} sessionId="s1" measuredUi={0.3} />);
    expect(screen.getByRole("alert")).toHaveTextContent(/contradice el UI medido/);
    expect((screen.getByLabelText(/Forma irregular/) as HTMLInputElement).checked).toBe(false);
  });

  /* F1-235: el PDF decía «Forma (S) Regular» con un UI de 0,50. */
  it("UI 0,5 con «Regular» muestra el aviso", () => {
    render(<ElapssCalculator maxDiameterMm={6} sessionId="s1" measuredUi={0.5} />);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "La forma elegida (regular) contradice el UI medido (0,50): revisa el contorno en el visor");
    // Al marcarla irregular deja de contradecir.
    fireEvent.click(screen.getByText(/Forma irregular/));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("con UI bajo o sin volumen válido no avisa", () => {
    const { unmount } = render(<ElapssCalculator maxDiameterMm={6} sessionId="s1" measuredUi={0.08} />);
    expect(screen.queryByRole("alert")).toBeNull();
    unmount();
    render(<ElapssCalculator maxDiameterMm={6} sessionId="s1" measuredUi={null} />);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

/* F1-14: ELAPSS no decía qué Ø tomaba, ni que el del cuerpo lo cambiaba de tramo. */
describe("ELAPSS y el diámetro", () => {
  it("dice qué diámetro toma y avisa si el del cuerpo cambia de tramo", () => {
    render(<ElapssCalculator maxDiameterMm={10.9} bodyDiameterMm={9.5} sessionId="s1" />);
    expect(screen.getByText(/Ø máximo medido 10,9 mm/)).toBeInTheDocument();
    expect(screen.getByText(/cambia de tramo/).textContent).toContain("corte de 10 mm");
  });
});

describe("ELAPSS con la localización de Morfometría", () => {
  it("traduce la localización elegida y no tiene selector propio", async () => {
    planning = { aneurysmSite: "ACoP — Arteria Comunicante Posterior" };
    render(<ElapssCalculator maxDiameterMm={6} sessionId="s1" dob="1950-01-01" />);
    expect(screen.queryByLabelText("Localización")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Calcular ELAPSS"));
    await waitFor(() => expect(api.elapss).toHaveBeenLastCalledWith(
      expect.objectContaining({ location: "pcom_posterior" })));
  });

  it("sin localización lo dice y no calcula", () => {
    planning = { aneurysmSite: null };
    render(<ElapssCalculator maxDiameterMm={6} sessionId="s1" dob="1950-01-01" />);
    expect(screen.getByText("Elige la localización en Morfometría")).toBeInTheDocument();
    expect(screen.getByText("Calcular ELAPSS").closest("button")).toBeDisabled();
  });
});
