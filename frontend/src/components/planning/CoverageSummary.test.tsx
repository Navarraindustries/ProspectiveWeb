/* Cobertura metálica de la trenza: lo que enseña el resumen y el selector. */

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ClStentCoverage } from "../../api/types";

const setStentMap = vi.fn();
vi.mock("../../api/client", () => ({ api: {} }));
vi.mock("../../store/planning", () => ({ usePlanning: () => ({ stentMap: "apposition", setStentMap }) }));

import { CoverageSummary, StentMapSwitch } from "./DevicesPanel";

const base: ClStentCoverage = {
  device: "Pipeline", nominal_coverage_pct: 32.5, nominal_angle_deg: 67, neck_coverage_pct: 31,
  min_coverage_pct: 24, max_coverage_pct: 33, min_local_diameter_mm: 3.1,
  deployed_length_mm: 24, labelled_length_mm: 17, notes: ["Estimación geométrica."], sources: [],
};

describe("cobertura metálica", () => {
  it("da la del cuello, el rango y la etiqueta que cubre el tramo", () => {
    render(<CoverageSummary c={base} />);
    expect(screen.getByText(/Cobertura metálica · Pipeline/)).toBeInTheDocument();
    expect(screen.getByText("≈ 31")).toBeInTheDocument();
    expect(screen.getByText("Como el catálogo")).toBeInTheDocument();
    expect(screen.getByText("24–33")).toBeInTheDocument();
    // No «Longitud de catálogo»: no es la del dispositivo elegido (Case 3:
    // Pipeline × 16 mm junto a un «13 mm» parecía una contradicción).
    expect(screen.getByText("Etiqueta que cubre el tramo")).toBeInTheDocument();
    expect(screen.getByText("≈ 17")).toBeInTheDocument();
    expect(screen.getByText(/Estimación geométrica\./)).toBeInTheDocument();
  });

  it("con el dispositivo elegido por el dimensionado da su etiqueta, no la estimada", () => {
    // Case 3: «≈ 18 mm» para un Pipeline de 20 (otros diámetros, otra cifra).
    render(<CoverageSummary c={{ ...base, catalogue_length_mm: 20 }} />);
    expect(screen.getByText("Longitud de catálogo")).toBeInTheDocument();
    expect(screen.getByText("20")).toBeInTheDocument();
    expect(screen.queryByText("≈ 17")).not.toBeInTheDocument();
    expect(screen.getByText(/Sus 20 mm de catálogo se alargan a 24 mm/)).toBeInTheDocument();
  });

  it("avisa cuando delante del cuello queda bastante menos que en el catálogo", () => {
    render(<CoverageSummary c={{ ...base, neck_coverage_pct: 24 }} />);
    expect(screen.getByText("Baja")).toBeInTheDocument();
  });

  it("sin cuello medido no inventa la cifra del cuello", () => {
    render(<CoverageSummary c={{ ...base, neck_coverage_pct: null }} />);
    expect(screen.queryByText("Delante del cuello")).not.toBeInTheDocument();
  });

  it("el selector cambia lo que pinta el visor", () => {
    render(<StentMapSwitch />);
    expect(screen.getByRole("button", { name: "Aposición" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Cobertura" }));
    expect(setStentMap).toHaveBeenCalledWith("coverage");
  });
});
