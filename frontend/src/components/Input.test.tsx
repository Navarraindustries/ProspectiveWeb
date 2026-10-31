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

  // Un solo anillo: el del contorno. El campo anula el :focus-visible global (que Chromium aplica
  // también con ratón y con focus()) y el contorno dibuja el halo con --primary, no con --ring.
  it.each([false, true])("un solo anillo de foco, el del contorno (multiline=%s)", (multiline) => {
    render(<Input label="Nombre" multiline={multiline} />);
    const field = screen.getByLabelText("Nombre");
    const wrapper = field.parentElement as HTMLElement;
    expect(field.style.outline).toBe("none");
    fireEvent.focus(field);
    expect(field.style.outline).toBe("none");
    expect(field.style.boxShadow).toBe("");
    expect(wrapper.style.boxShadow).toContain("--primary");
    expect(wrapper.style.boxShadow).not.toContain("--ring");
  });

  it("la etiqueta va en minúscula, 13 px y peso 500", () => {
    render(<Input label="Historia clínica" />);
    const label = screen.getByText("Historia clínica");
    expect(label.style.textTransform).toBe("");
    expect(label.style.fontSize).toContain("--text-label");
    expect(label.style.fontWeight).toContain("--weight-label");
  });

  it("al enfocar, el contorno toma el borde primario y el halo primario", () => {
    render(<Input label="Nombre" />);
    const field = screen.getByLabelText("Nombre");
    const wrapper = field.parentElement as HTMLElement;
    fireEvent.focus(field);
    expect(wrapper.style.border).toContain("--primary");
    expect(wrapper.style.boxShadow).toContain("--primary");
    fireEvent.blur(field);
    expect(wrapper.style.border).toContain("--input");
  });

  it("un campo inválido conserva el borde de error al enfocar y añade el anillo", () => {
    render(<Input label="Nombre" invalid />);
    const field = screen.getByLabelText("Nombre");
    const wrapper = field.parentElement as HTMLElement;
    fireEvent.focus(field);
    expect(wrapper.style.border).toContain("--destructive");
    expect(wrapper.style.boxShadow).toContain("--destructive");
  });

  it("un campo inválido con foco usa un anillo distinto al de sin foco", () => {
    render(<Input label="Nombre" invalid />);
    const field = screen.getByLabelText("Nombre");
    const wrapper = field.parentElement as HTMLElement;
    const rest = wrapper.style.boxShadow;
    fireEvent.focus(field);
    expect(wrapper.style.boxShadow).not.toBe(rest);
    expect(wrapper.style.boxShadow).toContain("--destructive");
  });

  it("deshabilitado, el campo va al 40 % de opacidad", () => {
    render(<Input label="Nombre" disabled />);
    expect((screen.getByLabelText("Nombre").parentElement as HTMLElement).style.opacity).toBe("0.4");
  });

  it("encadena los onFocus y onBlur del llamador", () => {
    const calls: string[] = [];
    render(<Input label="Nombre" onFocus={() => calls.push("f")} onBlur={() => calls.push("b")} />);
    const field = screen.getByLabelText("Nombre");
    fireEvent.focus(field);
    fireEvent.blur(field);
    expect(calls).toEqual(["f", "b"]);
  });

  it("la altura mínima del área de texto sale del token de campo, no de píxeles fijos", () => {
    const { container } = render(<Input label="Notas" multiline />);
    expect(container.querySelector("textarea")!.style.minHeight).toContain("--field-h");
  });

  it("el contorno de un campo de una línea mide --field-h", () => {
    render(<Input label="Nombre" />);
    const wrapper = screen.getByLabelText("Nombre").parentElement as HTMLElement;
    expect(wrapper.style.height).toBe("var(--field-h)");
  });

  it("con invalid, la pista pasa a mensaje de error con role alert", () => {
    render(<Input label="Apellidos" invalid hint="Los apellidos son obligatorios." />);
    expect(screen.getByRole("alert")).toHaveTextContent("Los apellidos son obligatorios.");
  });

  it("sin invalid, la pista no es un alert", () => {
    render(<Input label="Apellidos" hint="Como en el DNI." />);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText("Como en el DNI.")).toBeInTheDocument();
  });
});
