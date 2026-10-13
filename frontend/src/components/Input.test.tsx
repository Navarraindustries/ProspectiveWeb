import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Input } from "./Input";

describe("Input", () => {
  it("multiline renders a textarea with its label associated", () => {
    render(<Input label="Notas" multiline />);
    const field = screen.getByLabelText("Notas");
    expect(field.tagName).toBe("TEXTAREA");
    expect(Number(field.getAttribute("rows"))).toBeGreaterThanOrEqual(3);
  });

  it("without multiline renders an input", () => {
    render(<Input label="Nombre" />);
    expect(screen.getByLabelText("Nombre").tagName).toBe("INPUT");
  });

  // F2-63: un campo vacío no debe nacer en rojo; solo marca error cuando se le pide.
  it("is not aria-invalid unless invalid is passed", () => {
    const { rerender } = render(<Input label="Nombre" hint="Obligatorio" />);
    expect(screen.getByLabelText("Nombre")).not.toHaveAttribute("aria-invalid");
    rerender(<Input label="Nombre" hint="Obligatorio" invalid />);
    expect(screen.getByLabelText("Nombre")).toHaveAttribute("aria-invalid", "true");
  });

  it("textarea honours invalid and shows the hint under the field", () => {
    render(<Input label="Notas" multiline invalid hint="Demasiado corto" />);
    expect(screen.getByLabelText("Notas")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Demasiado corto")).toBeInTheDocument();
  });

  it("typing in the textarea calls onChange with the value", () => {
    const seen: string[] = [];
    render(<Input label="Notas" multiline onChange={(e) => seen.push(e.target.value)} />);
    fireEvent.change(screen.getByLabelText("Notas"), { target: { value: "hola" } });
    expect(seen).toEqual(["hola"]);
  });

  // Un solo anillo de foco: lo dibuja el contenedor y el campo interior no añade otro.
  it.each([false, true])("draws one focus ring on the wrapper only (multiline=%s)", (multiline) => {
    render(<Input label="Nombre" multiline={multiline} />);
    const field = screen.getByLabelText("Nombre");
    const wrapper = field.parentElement as HTMLElement;
    expect(wrapper.style.boxShadow).not.toContain("--ring");
    fireEvent.focus(field);
    expect(wrapper.style.boxShadow).toContain("--ring");
    expect(field.style.outline).toBe("none");
    expect(field.style.boxShadow).toBe("");
  });
});
