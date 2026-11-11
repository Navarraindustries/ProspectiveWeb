import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { AUTOCIERRE_MS, ToastStack } from "./ToastStack";

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

  it("los «ok» e «info» se cierran solos; los errores se quedan hasta pulsarlos", () => {
    vi.useFakeTimers();
    try {
      const err = vi.fn(); const ok = vi.fn(); const info = vi.fn();
      render(<ToastStack top={84} right={0} items={[
        { id: "e", tono: "error", texto: "Fallo", role: "alert", onClose: err },
        { id: "o", tono: "ok", texto: "Hecho", role: "status", onClose: ok },
        { id: "i", tono: "info", texto: "Ojo", role: "status", onClose: info },
      ]} />);
      vi.advanceTimersByTime(AUTOCIERRE_MS - 1);
      expect(ok).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(ok).toHaveBeenCalledTimes(1);
      expect(info).toHaveBeenCalledTimes(1);
      expect(err).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
