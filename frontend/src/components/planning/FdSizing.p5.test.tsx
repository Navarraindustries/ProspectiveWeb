/* P5 (18-11): la trenza de cada opción del dimensionado en este vaso. */
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { FdOption, FdSizingResult } from "../../api/types";

vi.mock("../../api/client", () => ({ api: { fdSizing: vi.fn() } }));

import { api } from "../../api/client";
import { FdSizing } from "./FdSizing";

const zona = (d: number) => ({ arc_from_mm: 0, arc_to_mm: 5, diameter_mm: d, min_mm: d, max_mm: d, n_sections: 9, truncated: false });

const opcion = (extra: Partial<FdOption>): FdOption => ({
  device_id: "pipeline-flex-3.75-25", name: "Pipeline Flex", manufacturer: "Medtronic", diameter_mm: 4.0, length_mm: 16,
  fits: true, reason: "Ø4,00 mm", neck_note: "", narrow_end_note: "", deploy_arc_mm: [16, 44], elongated_length_mm: 21.2, ...extra,
});

function resultado(options: FdOption[]): FdSizingResult {
  return {
    neck_arc_mm: [28, 32], neck_from_rim: false, total_arc_mm: 60, proximal: zona(3.2), distal: zona(3.2), mismatch_mm: 0,
    target_diameter_mm: 3.2, required_length_mm: 16, multiple_devices: false, options, warnings: [], notes: [], sources: [],
  };
}

describe("dimensionado · trenza (P5)", () => {
  it("enseña cobertura, porosidad, poros y longitud desplegada de la opción", async () => {
    vi.mocked(api.fdSizing).mockResolvedValue(resultado([opcion({
      wires: 48, neck_coverage_pct: 24, neck_porosity_pct: 76, neck_pore_density: 12.4, nominal_pore_density: 17.2,
      deployed_length_mm: 27.7, elongation_pct: 73,
    })]));
    render(<FdSizing sessionId="s1" onApply={() => {}} />);
    fireEvent.click(screen.getByText("Dimensionar"));
    const t = await screen.findByRole("group", { name: "Trenza de Pipeline Flex en este vaso" });
    expect(within(t).getByText("cobertura ≈ 24 % · porosidad ≈ 76 %")).toBeInTheDocument();
    expect(within(t).getByText(/≈ 12 poros\/mm² \(17 al nominal\) · 48 hilos/)).toBeInTheDocument();
    expect(within(t).getByText("≈ 28 mm (+73 % sobre la etiqueta)")).toBeInTheDocument();
  });

  it("sin trenzado en el catálogo no enseña nada inventado", async () => {
    vi.mocked(api.fdSizing).mockResolvedValue(resultado([opcion({ device_id: "otro" })]));
    render(<FdSizing sessionId="s1" onApply={() => {}} />);
    fireEvent.click(screen.getByText("Dimensionar"));
    await screen.findByText("Usar en el despliegue");
    expect(screen.queryByRole("group", { name: /Trenza de/ })).toBeNull();
  });

  it("lleva el dispositivo al despliegue con su tramo desplegado", async () => {
    vi.mocked(api.fdSizing).mockResolvedValue(resultado([opcion({
      device_id: "surpass-streamline-4.0-25", name: "Surpass Streamline", neck_coverage_pct: 29, deploy_arc_mm: [20.1, 39.9],
    })]));
    const onApply = vi.fn();
    render(<FdSizing sessionId="s1" onApply={onApply} />);
    fireEvent.click(screen.getByText("Dimensionar"));
    fireEvent.click(await screen.findByText("Usar en el despliegue"));
    expect(onApply).toHaveBeenCalledWith(4.0, 20.1, 39.9, "surpass-streamline-4.0-25");
  });
});
