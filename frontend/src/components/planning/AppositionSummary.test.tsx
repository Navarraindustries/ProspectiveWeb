/* Aposición del stent a la pared: lo que enseña el resumen. */

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ClStentApposition } from "../../api/types";

vi.mock("../../api/client", () => ({ api: {} }));

import { AppositionSummary } from "./DevicesPanel";

const base: ClStentApposition = {
  noise_mm: 0.3, gap_area_pct: 4, compressed_area_pct: 62, max_gap_mm: 0.42,
  proximal_gap_mm: 0.1, distal_gap_mm: 0.2, neck_excluded: true, notes: [],
};

describe("aposición del stent", () => {
  it("con poco separado y los extremos en contacto no avisa", () => {
    render(<AppositionSummary a={base} />);
    expect(screen.getByText("Separado de la pared")).toBeInTheDocument();
    expect(screen.getByText("Bien")).toBeInTheDocument();
    expect(screen.queryByText("Separado")).not.toBeInTheDocument();
    expect(screen.getByText(/Sobre el cuello no hay pared/)).toBeInTheDocument();
  });

  it("avisa cuando buena parte queda separada o un extremo no toca", () => {
    render(<AppositionSummary a={{ ...base, gap_area_pct: 37, distal_gap_mm: 0.8 }} />);
    expect(screen.getByText("Revisar")).toBeInTheDocument();
    expect(screen.getAllByText("Separado")).toHaveLength(1);
  });

  it("dice que no es una simulación y enseña las notas", () => {
    render(<AppositionSummary a={{ ...base, neck_excluded: false, notes: ["Sin cuello medido."] }} />);
    expect(screen.getByText(/no una simulación de la trenza/)).toBeInTheDocument();
    expect(screen.getByText(/Sin cuello medido\./)).toBeInTheDocument();
    expect(screen.queryByText(/Sobre el cuello no hay pared/)).not.toBeInTheDocument();
  });
});
