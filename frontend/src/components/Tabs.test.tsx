import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Tabs } from "./Tabs";

describe("Tabs", () => {
  it("expone la pestaña activa y cambia al pulsar", () => {
    let value = "Métricas";
    const { rerender } = render(<Tabs tabs={["Métricas", "Índices"]} value={value} onChange={(t) => { value = t; }} />);
    expect(screen.getByRole("tab", { name: "Métricas" })).toHaveAttribute("aria-selected", "true");
    fireEvent.click(screen.getByRole("tab", { name: "Índices" }));
    rerender(<Tabs tabs={["Métricas", "Índices"]} value={value} onChange={() => {}} />);
    expect(screen.getByRole("tab", { name: "Índices" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Índices" }).style.fontWeight).toBe("600");
  });
  it("el color del rótulo transiciona con la duración de estado (--dur-2)", () => {
    render(<Tabs tabs={["A", "B"]} value="A" onChange={() => {}} />);
    expect(screen.getByRole("tab", { name: "A" }).style.transition).toContain("color var(--dur-2)");
  });
  it("acepta un nombre accesible para la barra", () => {
    render(<Tabs aria-label="Qué ver" tabs={["A", "B"]} value="A" onChange={() => {}} />);
    expect(screen.getByRole("tablist", { name: "Qué ver" })).toBeInTheDocument();
  });
  it("el indicador es un solo elemento que vive bajo la pestaña activa", () => {
    render(<Tabs tabs={["A", "B", "C"]} value="B" onChange={() => {}} />);
    const ind = document.querySelectorAll("[data-tab-indicator]");
    expect(ind).toHaveLength(1);
    const active = screen.getByRole("tab", { name: "B" });
    expect(active).toHaveAttribute("aria-selected", "true");
    expect(active.contains(ind[0])).toBe(true);
  });
});
