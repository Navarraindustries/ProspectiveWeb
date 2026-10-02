/* Dimensionado de flow-diverter: lo que enseña y lo que lleva al despliegue. */

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { FdSizingResult } from "../../api/types";

vi.mock("../../api/client", () => ({ api: { fdSizing: vi.fn() } }));

import { api } from "../../api/client";
import { FdSizing } from "./FdSizing";

const zona = (d: number) => ({ arc_from_mm: 0, arc_to_mm: 5, diameter_mm: d, min_mm: d - 0.1, max_mm: d + 0.1, n_sections: 9, truncated: false });

const resultado: FdSizingResult = {
  neck_arc_mm: [28, 32], neck_from_rim: false, total_arc_mm: 60,
  proximal: zona(4.5), distal: zona(3.0), mismatch_mm: 1.5,
  target_diameter_mm: 4.5, required_length_mm: 16, multiple_devices: true,
  options: [
    { device_id: "pipeline", name: "Pipeline Flex", manufacturer: "Medtronic",
      diameter_mm: 4.5, length_mm: 16, fits: true, reason: "Ø4.50 mm por el anclaje mayor",
      neck_note: "nota cuello", narrow_end_note: "sobredimensionado 1.50 mm",
      deploy_arc_mm: [22.4, 38.4], elongated_length_mm: 21.2 },
    { device_id: "surpass", name: "Surpass Streamline", manufacturer: "Stryker",
      diameter_mm: 0, length_mm: 0, fits: false, reason: "Ninguna medida encaja",
      neck_note: "", narrow_end_note: "", deploy_arc_mm: [0, 0], elongated_length_mm: 0 },
  ],
  warnings: ["El anclaje proximal y el distal difieren 1.50 mm; lo habitual es usar varios"],
  notes: ["La longitud es la etiquetada."], sources: ["fuente"],
};

describe("dimensionado de flow-diverter", () => {
  it("enseña los dos anclajes, el aviso de varios dispositivos y cada opción", async () => {
    vi.mocked(api.fdSizing).mockResolvedValue(resultado);
    render(<FdSizing sessionId="s1" onApply={() => {}} />);
    fireEvent.click(screen.getByText("Dimensionar"));
    expect(await screen.findByText("4.50 mm")).toBeInTheDocument();
    expect(screen.getByText("3.00 mm")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(/varios/);
    expect(screen.getByText("Ø4.50 × 16 mm")).toBeInTheDocument();
    expect(screen.getByText(/sobredimensionado 1.50 mm/)).toBeInTheDocument();
    expect(screen.getByText("Ninguna medida encaja")).toBeInTheDocument();
    // Solo la opción que encaja se puede llevar al despliegue.
    expect(screen.getAllByText("Usar en el despliegue")).toHaveLength(1);
  });

  it("lleva diámetro y tramo al despliegue", async () => {
    vi.mocked(api.fdSizing).mockResolvedValue(resultado);
    const onApply = vi.fn();
    render(<FdSizing sessionId="s1" onApply={onApply} />);
    fireEvent.click(screen.getByText("Dimensionar"));
    fireEvent.click(await screen.findByText("Usar en el despliegue"));
    expect(onApply).toHaveBeenCalledWith(4.5, 22.4, 38.4);
  });

  it("dice qué falta cuando el servidor no puede medir", async () => {
    vi.mocked(api.fdSizing).mockRejectedValue(new Error("Falta la morfometría"));
    render(<FdSizing sessionId="s1" onApply={() => {}} />);
    fireEvent.click(screen.getByText("Dimensionar"));
    expect(await screen.findByText("Falta la morfometría")).toBeInTheDocument();
  });
});
