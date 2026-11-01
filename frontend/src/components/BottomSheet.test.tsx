import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BottomSheet } from "./BottomSheet";

const montar = (altura: "asomar" | "media" | "completa") => {
  const onAltura = vi.fn();
  render(<BottomSheet altura={altura} onAltura={onAltura} titulo="Panel del paso"><input aria-label="nota" /></BottomSheet>);
  return onAltura;
};
const tirador = () => screen.getByRole("button", { name: "Cambiar la altura del panel" });

describe("BottomSheet", () => {
  it("es una región de cristal con el título dado", () => {
    montar("media");
    const region = screen.getByRole("region", { name: "Panel del paso" });
    expect(region.hasAttribute("data-glass")).toBe(true);
    expect(region.style.bottom).toBe("0px");
  });

  it("mide 96 px, 50 % o hasta la banda superior", () => {
    const { rerender } = render(<BottomSheet altura="asomar" onAltura={() => {}} titulo="P">x</BottomSheet>);
    const region = screen.getByRole("region", { name: "P" });
    expect(region.style.height).toBe("96px");
    rerender(<BottomSheet altura="media" onAltura={() => {}} titulo="P">x</BottomSheet>);
    expect(region.style.height).toBe("50%");
    rerender(<BottomSheet altura="completa" onAltura={() => {}} titulo="P">x</BottomSheet>);
    expect(region.style.height).toBe("calc(100% - 72px)");
  });

  it("el tirador recorre asomar → media → completa → asomar", () => {
    let onAltura = montar("asomar");
    fireEvent.click(tirador());
    expect(onAltura).toHaveBeenCalledWith("media");
    document.body.innerHTML = "";
    onAltura = montar("completa");
    fireEvent.click(tirador());
    expect(onAltura).toHaveBeenCalledWith("asomar");
  });

  it("↑ sube una altura, ↓ la baja y Esc la deja asomada", () => {
    const onAltura = montar("media");
    const region = screen.getByRole("region", { name: "Panel del paso" });
    fireEvent.keyDown(region, { key: "ArrowUp" });
    expect(onAltura).toHaveBeenLastCalledWith("completa");
    fireEvent.keyDown(region, { key: "ArrowDown" });
    expect(onAltura).toHaveBeenLastCalledWith("asomar");
    fireEvent.keyDown(region, { key: "Escape" });
    expect(onAltura).toHaveBeenLastCalledWith("asomar");
  });

  it("las flechas dentro de un campo no mueven la hoja", () => {
    const onAltura = montar("media");
    fireEvent.keyDown(screen.getByLabelText("nota"), { key: "ArrowUp" });
    expect(onAltura).not.toHaveBeenCalled();
  });
});
