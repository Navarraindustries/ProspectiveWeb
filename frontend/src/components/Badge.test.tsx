import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Badge, riskVariant } from "./Badge";

describe("Badge", () => {
  it("peso 600 y la variante data usa --data sobre --accent", () => {
    render(<Badge variant="data">1.º</Badge>);
    const b = screen.getByText("1.º");
    expect(b.style.fontWeight).toBe("600");
    expect(b.style.color).toContain("--data");
    expect(b.style.background).toContain("--accent");
  });
  it("mapea el riesgo clínico", () => {
    expect(riskVariant("Alto")).toBe("destructive");
    expect(riskVariant("Moderado")).toBe("warning");
    expect(riskVariant("Bajo")).toBe("success");
  });
});
