/* F1-68: la ficha del paciente enseñaba «Alto» a secas, que se leía como riesgo de rotura. */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MorphoRiskBadge } from "./MorphoRiskBadge";

describe("insignia del riesgo morfométrico", () => {
  it("la insignia lleva «morfométrico»", () => {
    render(<MorphoRiskBadge label="Alto" />);
    expect(screen.getByText("Riesgo morfométrico alto")).toBeInTheDocument();
  });

  it("sin índices dice «Sin medir» y no un nivel", () => {
    render(<MorphoRiskBadge label="Alto" measured={false} />);
    expect(screen.getByText("Sin medir")).toBeInTheDocument();
    expect(screen.queryByText(/alto/)).not.toBeInTheDocument();
  });

  it("explica el criterio en el tooltip", () => {
    render(<MorphoRiskBadge label="Bajo" />);
    expect(screen.getByText("Riesgo morfométrico bajo").closest("[title]")?.getAttribute("title"))
      .toMatch(/AR ≥ 1,6/);
  });
});
