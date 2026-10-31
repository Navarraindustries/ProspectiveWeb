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
  it("el subrayado es un solo elemento que vive bajo la pestaña activa", () => {
    render(<Tabs tabs={["A", "B", "C"]} value="B" onChange={() => {}} />);
    const under = document.querySelectorAll("[data-tab-underline]");
    expect(under).toHaveLength(1);
    expect(screen.getByRole("tab", { name: "B" }).contains(under[0])).toBe(true);
  });
});
