import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LeyendaRed } from "./LeyendaRed";

const RED = { url: "/x.red.vtp", tramos: 269, uniones: 120, extremos: 135, largo_total_mm: 2594.4, segundos: 13.7, voxel_mm: 0.4 };

describe("LeyendaRed", () => {
  it("lista: tramos, bifurcaciones y largo total", () => {
    render(<LeyendaRed red={{ estado: "listo", resumen: RED }} />);
    expect(screen.getByTestId("leyenda-red")).toHaveTextContent("RED · 269 tramos · 120 bifurcaciones · 2594 mm");
  });

  it("mientras calcula lo dice, y si falla lo explica", () => {
    const { rerender } = render(<LeyendaRed red={{ estado: "cargando" }} />);
    expect(screen.getByRole("status")).toHaveTextContent("trazando");
    rerender(<LeyendaRed red={{ estado: "error" }} />);
    expect(screen.getByRole("status")).toHaveTextContent("no se pudo extraer");
  });
});
