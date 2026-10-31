import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Badge, riskVariant } from "./Badge";

describe("Badge", () => {
  it("peso 500 y la variante data usa --data sin relleno", () => {
    render(<Badge variant="data">1.º</Badge>);
    const b = screen.getByText("1.º");
    expect(b.style.fontWeight).toBe("500");
    expect(b.style.color).toContain("--data");
    expect(b.style.background).toBe("transparent");
  });
  it("pastilla de borde del color de riesgo", () => {
    render(<Badge variant="destructive">Alto</Badge>);
    const b = screen.getByText("Alto");
    expect(b.style.borderRadius).toBe("var(--radius-full)");
    expect(b.style.border).toContain("var(--destructive)");
  });
  it("mapea el riesgo clínico", () => {
    expect(riskVariant("Alto")).toBe("destructive");
    expect(riskVariant("Moderado")).toBe("warning");
    expect(riskVariant("Bajo")).toBe("success");
  });
});
