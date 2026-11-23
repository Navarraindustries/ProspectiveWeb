/* F1-68: la ficha del paciente enseñaba «Alto» a secas, que se leía como riesgo de rotura. */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MorphoRiskBadge, etiquetaFormaMedida } from "./MorphoRiskBadge";

describe("la etiqueta de forma de la cabecera", () => {
  it("sin volumen ni cuello válidos no hay etiqueta (decía «Forma: bajo»)", () => {
    expect(etiquetaFormaMedida({ rupture_risk_label: "Bajo", reliable: false,
                                 volume_valid: false, neck_valid: false })).toBeNull();
    expect(etiquetaFormaMedida(null)).toBeNull();
  });
  it("con uno de los dos medido, sí", () => {
    expect(etiquetaFormaMedida({ rupture_risk_label: "Alto", reliable: false,
                                 volume_valid: true, neck_valid: false })).toBe("Alto");
  });
  it("las medidas antiguas, sin volume_valid ni neck_valid, siguen a `reliable`", () => {
    expect(etiquetaFormaMedida({ rupture_risk_label: "Moderado", reliable: true })).toBe("Moderado");
    expect(etiquetaFormaMedida({ rupture_risk_label: "Bajo", reliable: false })).toBeNull();
  });
});

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
