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
  it("da la del cuello, el rango y la longitud de catálogo", () => {
    render(<CoverageSummary c={base} />);
    expect(screen.getByText(/Cobertura metálica · Pipeline/)).toBeInTheDocument();
    expect(screen.getByText("≈ 31")).toBeInTheDocument();
    expect(screen.getByText("Como el catálogo")).toBeInTheDocument();
    expect(screen.getByText("24–33")).toBeInTheDocument();
    expect(screen.getByText("17")).toBeInTheDocument();
    expect(screen.getByText(/Estimación geométrica\./)).toBeInTheDocument();
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
