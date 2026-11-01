import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ToastStack } from "./ToastStack";

describe("ToastStack", () => {
  it("pinta cada aviso con su rol y su cristal", () => {
    render(<ToastStack top={84} right={0} items={[
      { id: "a", tono: "error", texto: "Fallo A", role: "alert" },
      { id: "b", tono: "ok", texto: "Hecho B", role: "status" },
    ]} />);
    const a = screen.getByRole("alert");
    const b = screen.getByRole("status");
    expect(a.textContent).toContain("Fallo A");
    expect(b.textContent).toContain("Hecho B");
    expect(a.hasAttribute("data-glass")).toBe(true);
    expect(b.hasAttribute("data-glass")).toBe(true);
  });

  it("pulsar un aviso llama solo su onClose", () => {
    const cierraA = vi.fn();
    const cierraB = vi.fn();
    render(<ToastStack top={84} right={0} items={[
      { id: "a", tono: "error", texto: "Fallo A", role: "alert", onClose: cierraA },
      { id: "b", tono: "info", texto: "Info B", role: "status", onClose: cierraB },
    ]} />);
    fireEvent.click(screen.getByRole("alert"));
    expect(cierraA).toHaveBeenCalledTimes(1);
    expect(cierraB).not.toHaveBeenCalled();
  });

  it("sin avisos no pinta nada", () => {
    const { container } = render(<ToastStack top={84} right={0} items={[]} />);
    expect(container.firstChild).toBeNull();
  });
});
