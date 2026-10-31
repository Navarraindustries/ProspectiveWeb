import { fireEvent, render, screen } from "@testing-library/react";
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

  it("usa appearance none y un chevron propio aria-hidden hermano", () => {
    render(<Select label="Sexo" options={["Mujer", "Hombre"]} />);
    const select = screen.getByLabelText("Sexo");
    expect(select.style.appearance).toBe("none");
    expect(select.parentElement!.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
  });

  it("al enfocar, el borde y el halo son primarios y se quita el outline global", () => {
    render(<Select label="Sexo" options={["Mujer", "Hombre"]} />);
    const select = screen.getByLabelText("Sexo");
    fireEvent.focus(select);
    expect(select.style.border).toContain("--primary");
    expect(select.style.boxShadow).toContain("--primary");
    expect(select.style.outline).toBe("none");
    fireEvent.blur(select);
    expect(select.style.border).toContain("--input");
  });

  it("con invalid marca aria-invalid y borde destructivo, también enfocado", () => {
    render(<Select label="Sexo" options={["Mujer", "Hombre"]} invalid />);
    const select = screen.getByLabelText("Sexo");
    expect(select).toHaveAttribute("aria-invalid", "true");
    expect(select.style.border).toContain("--destructive");
    fireEvent.focus(select);
    expect(select.style.border).toContain("--destructive");
    expect(select.style.boxShadow).toContain("--destructive");
  });
});
