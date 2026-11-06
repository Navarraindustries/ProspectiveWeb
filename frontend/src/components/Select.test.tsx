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

  it("inválido con foco usa un anillo distinto al de sin foco", () => {
    render(<Select label="Sexo" invalid options={["Mujer", "Hombre"]} />);
    const select = screen.getByLabelText("Sexo");
    const rest = select.style.boxShadow;
    fireEvent.focus(select);
    expect(select.style.boxShadow).not.toBe(rest);
    expect(select.style.boxShadow).toContain("--destructive");
  });

  it("deshabilitado, el campo va al 40 % de opacidad", () => {
    render(<Select label="Sexo" disabled options={["Mujer", "Hombre"]} />);
    expect(screen.getByLabelText("Sexo").style.opacity).toBe("0.4");
  });

  it("lleva la clase del cristal y un chevron propio aria-hidden hermano", () => {
    render(<Select label="Sexo" options={["Mujer", "Hombre"]} />);
    const select = screen.getByLabelText("Sexo");
    expect(select).toHaveClass("campo-select");
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
