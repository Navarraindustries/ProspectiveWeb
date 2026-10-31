import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Select } from "./Select";

describe("Select", () => {
  it("la etiqueta va en minúscula, 13 px y peso 500, como la de Input", () => {
    render(<Select label="Sexo" options={["Mujer", "Hombre"]} />);
    const label = screen.getByText("Sexo");
    expect(label.style.textTransform).toBe("");
    expect(label.style.letterSpacing).toBe("");
    expect(label.style.fontSize).toContain("--text-label");
    expect(label.style.fontWeight).toContain("--weight-label");
    expect(screen.getByLabelText("Sexo").tagName).toBe("SELECT");
  });
});
