/* La hoja inferior se prueba donde vive: el contenedor de RightPanelColumn en modo estrecho. */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RightPanelColumn } from "./RightPanelColumn";
import type { AlturaHoja } from "./BottomSheet";

const montar = (altura: AlturaHoja) => {
  const onAltura = vi.fn();
  const r = render(
    <RightPanelColumn collapsed={false} onToggle={() => {}} stepLabel="Detección" stepIndex={2} stepKey="d"
                      wide={false} estrecho altura={altura} onAltura={onAltura}>
      <input aria-label="nota" />
      <button type="button">acción</button>
      <div role="slider" tabIndex={0} aria-label="corte" aria-valuenow={1} />
    </RightPanelColumn>,
  );
  return { onAltura, ...r };
};
const tirador = () => screen.getByRole("button", { name: "Cambiar la altura del panel" });
const hoja = () => screen.getByRole("region", { name: "Panel del paso" });

describe("hoja inferior", () => {
  it("es una región de cristal pegada abajo", () => {
    montar("media");
    expect(hoja().hasAttribute("data-glass")).toBe(true);
    expect(hoja().style.bottom).toBe("0px");
  });

  it("mide 96 px, 50 % o hasta la banda superior", () => {
    const props = { collapsed: false, onToggle: () => {}, stepLabel: "P", stepIndex: 0, stepKey: "p", wide: false, estrecho: true, onAltura: () => {} } as const;
    const { rerender } = render(<RightPanelColumn {...props} altura="asomar"><p>x</p></RightPanelColumn>);
    expect(hoja().style.height).toBe("96px");
    rerender(<RightPanelColumn {...props} altura="media"><p>x</p></RightPanelColumn>);
    expect(hoja().style.height).toBe("50%");
    rerender(<RightPanelColumn {...props} altura="completa"><p>x</p></RightPanelColumn>);
    expect(hoja().style.height).toBe("calc(100% - 72px)");
  });

  it("el tirador recorre asomar → media → completa → asomar", () => {
    const a = montar("asomar");
    fireEvent.click(tirador());
    expect(a.onAltura).toHaveBeenCalledWith("media");
    a.unmount();
    const b = montar("completa");
    fireEvent.click(tirador());
    expect(b.onAltura).toHaveBeenCalledWith("asomar");
  });

  it("↑ sube y ↓ baja una altura con el foco en cualquier control del cuerpo", () => {
    const { onAltura } = montar("media");
    const boton = screen.getByRole("button", { name: "acción" });
    boton.focus();
    fireEvent.keyDown(boton, { key: "ArrowUp" });
    expect(onAltura).toHaveBeenLastCalledWith("completa");
    fireEvent.keyDown(boton, { key: "ArrowDown" });
    expect(onAltura).toHaveBeenLastCalledWith("asomar");
  });

  it("Esc la deja asomada y se queda la tecla (defaultPrevented)", () => {
    const { onAltura } = montar("media");
    const boton = screen.getByRole("button", { name: "acción" });
    const ev = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    boton.dispatchEvent(ev);
    expect(onAltura).toHaveBeenCalledWith("asomar");
    expect(ev.defaultPrevented).toBe(true);
  });

  it("ya asomada, Esc sigue su camino sin marcarse como atendido", () => {
    const { onAltura } = montar("asomar");
    const ev = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    screen.getByRole("button", { name: "acción" }).dispatchEvent(ev);
    expect(onAltura).not.toHaveBeenCalled();
    expect(ev.defaultPrevented).toBe(false);
  });

  it("campos y controles con flechas propias no mueven la hoja", () => {
    const { onAltura } = montar("media");
    fireEvent.keyDown(screen.getByLabelText("nota"), { key: "ArrowUp" });
    fireEvent.keyDown(screen.getByRole("slider"), { key: "ArrowDown" });
    expect(onAltura).not.toHaveBeenCalled();
  });
});
