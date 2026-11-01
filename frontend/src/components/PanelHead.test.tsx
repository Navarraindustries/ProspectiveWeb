import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Card, Collapsible, ErrorNote, SectionLabel } from "./PanelHead";

describe("SectionLabel", () => {
  it("es un rótulo mono en caja alta con el tracking de sobretítulo", () => {
    render(<SectionLabel>Antecedentes</SectionLabel>);
    const el = screen.getByText("Antecedentes");
    expect(el.style.fontFamily).toContain("--font-mono");
    expect(el.style.textTransform).toBe("uppercase");
    expect(el.style.fontSize).toContain("--text-eyebrow");
    expect(el.style.letterSpacing).toContain("--tracking-eyebrow");
    expect(el.style.color).toContain("--muted-foreground");
  });
});

describe("Card", () => {
  it("es una superficie de cristal con radio grande", () => {
    render(<Card>contenido</Card>);
    const el = screen.getByText("contenido");
    expect(el.hasAttribute("data-glass")).toBe(true);
    expect(el.style.borderRadius).toContain("--radius-lg");
  });

  it("no lleva desenfoque propio (el cristal se desenfoca una sola vez)", () => {
    render(<Card>plana</Card>);
    const el = screen.getByText("plana");
    expect(el.style.backdropFilter || "").toBe("");
    expect(el.style.boxShadow).toContain("--glass-highlight");
  });

  it("el estilo del llamador manda sobre el del cristal", () => {
    render(<Card style={{ padding: 3 }}>x</Card>);
    expect(screen.getByText("x").style.padding).toBe("3px");
  });
});

describe("Collapsible", () => {
  it("gira el chevron al abrir y no pone cristal propio al cuerpo", () => {
    render(<Collapsible title="Sección" storageKey="t-cristal">cuerpo</Collapsible>);
    const btn = screen.getByRole("button", { name: /Sección/ });
    const chevron = btn.querySelector("[data-chevron]") as HTMLElement;
    expect(chevron).toHaveAttribute("data-abierto", "false");
    fireEvent.click(btn);
    expect(chevron).toHaveAttribute("data-abierto", "true");
    expect(screen.getByText("cuerpo").closest("[data-glass]")).toBeNull();
  });
});

describe("ErrorNote", () => {
  it("usa los tokens de error legibles sobre cristal", () => {
    render(<ErrorNote>fallo</ErrorNote>);
    const el = screen.getByText("fallo");
    expect(el.style.color).toContain("--destructive-text");
    expect(el.style.background).toContain("--destructive-bg");
    expect(el.style.border).toContain("--destructive-text");
  });
});

describe("Collapsible chevron", () => {
  it("el plegable lleva un chevron de Icon que gira al abrir", () => {
    render(<Collapsible title="Más datos (opcional)" storageKey="t-chevron">x</Collapsible>);
    const b = screen.getByRole("button", { name: /Más datos/ });
    expect(b.querySelector("[data-chevron] svg")).not.toBeNull();
    expect(b.querySelector("[data-chevron]")!.textContent).toBe("");
    fireEvent.click(b);
    expect(b).toHaveAttribute("aria-expanded", "true");
    expect(b.querySelector("[data-chevron]")).toHaveAttribute("data-abierto", "true");
  });
});
