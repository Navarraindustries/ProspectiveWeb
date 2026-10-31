import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ThemeProvider } from "../store/theme";
import { Button } from "./Button";

const VARIANTS = ["default", "secondary", "outline", "ghost", "destructive", "link"] as const;

describe("Button", () => {
  it.each(VARIANTS)("renders the %s variant and exposes it", (variant) => {
    render(<ThemeProvider><Button variant={variant}>Acción</Button></ThemeProvider>);
    const b = screen.getByRole("button", { name: "Acción" });
    expect(b).toHaveAttribute("data-variant", variant);
    expect(b).toHaveAttribute("data-size", "md");
  });

  it("the default variant is filled with --primary", () => {
    render(<ThemeProvider><Button>Guardar</Button></ThemeProvider>);
    expect(screen.getByRole("button", { name: "Guardar" }).style.background).toContain("--primary");
  });

  it("exposes the size", () => {
    render(<ThemeProvider><Button size="sm" variant="ghost">x</Button></ThemeProvider>);
    expect(screen.getByRole("button")).toHaveAttribute("data-size", "sm");
  });

  it("el primario lleva la sombra con desplazamiento y no un halo", () => {
    const { container } = render(<ThemeProvider><Button>Guardar</Button></ThemeProvider>);
    const b = screen.getByRole("button", { name: "Guardar" });
    expect(b.style.boxShadow).toContain("--shadow-primary");
    expect(b.parentElement).toBe(container); // sin envoltorio BorderBeam
  });

  it("las propiedades de layout se aplican al propio botón", () => {
    render(<ThemeProvider><Button style={{ flex: 1, marginTop: 6 }}>Entrar</Button></ThemeProvider>);
    const b = screen.getByRole("button", { name: "Entrar" });
    expect(b.style.flexGrow).toBe("1"); // jsdom expande `flex: 1` a "1 1 0%"
    expect(b.style.marginTop).toBe("6px");
  });

  it("el enlace usa el color de dato y el destructivo no va relleno en reposo", () => {
    render(<ThemeProvider><Button variant="link">Ver</Button><Button variant="destructive">Borrar</Button></ThemeProvider>);
    expect(screen.getByRole("button", { name: "Ver" }).style.color).toContain("--data");
    expect(screen.getByRole("button", { name: "Borrar" }).style.background).toBe("transparent");
  });

  it("las alturas salen de los tokens de control", () => {
    render(<ThemeProvider><Button size="lg">Acción</Button></ThemeProvider>);
    expect(screen.getByRole("button").style.height).toContain("--control-lg");
  });

  it("no pone outline ni sombra de foco propios (queda el anillo global)", () => {
    render(<ThemeProvider><Button>Foco</Button></ThemeProvider>);
    const b = screen.getByRole("button", { name: "Foco" });
    fireEvent.focus(b);
    expect(b.style.outline).toBe("");
    // La sombra del primario es de desplazamiento, no un anillo de foco.
    expect(b.style.boxShadow).toBe("var(--shadow-primary)");
  });

  it("el primario deshabilitado no lleva sombra", () => {
    render(<ThemeProvider><Button disabled>Off</Button></ThemeProvider>);
    expect(screen.getByRole("button", { name: "Off" }).style.boxShadow).toBe("");
  });
});
