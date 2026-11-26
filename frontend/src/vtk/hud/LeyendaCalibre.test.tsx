import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LeyendaCalibre } from "./LeyendaCalibre";

const RESUMEN = { url: "/x.calibre.vtp", campo: "calibre_mm", p5_mm: 0.2, mediana_mm: 0.83, p95_mm: 2.44, maximo_mm: 16.9 };

describe("LeyendaCalibre", () => {
  it("con el mapa listo: escala, mediana y p95 con coma decimal, y una descripción entera", () => {
    render(<LeyendaCalibre calibre={{ estado: "listo", resumen: RESUMEN }} />);
    const l = screen.getByTestId("leyenda-calibre");
    expect(l).toHaveTextContent("Ø LOCAL");
    expect(l).toHaveTextContent("6+ mm");
    expect(l).toHaveTextContent("mediana 0,8 mm · p95 2,4 mm");
    expect(screen.getByRole("img")).toHaveAccessibleName(/de violeta \(0 mm\) a amarillo \(6 mm o más\).*percentil 95 2,4 mm/);
  });

  it("mientras calcula lo dice, y si falla explica que se ve sin el mapa", () => {
    const { rerender } = render(<LeyendaCalibre calibre={{ estado: "cargando" }} />);
    expect(screen.getByRole("status")).toHaveTextContent("calculando");
    rerender(<LeyendaCalibre calibre={{ estado: "error" }} />);
    expect(screen.getByRole("status")).toHaveTextContent("no se pudo calcular");
    expect(screen.getByRole("status").className).toContain("hud-warn");
  });
});
