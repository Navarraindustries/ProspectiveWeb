import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HudToggleGroup } from "./HudToggleGroup";

describe("HudToggleGroup", () => {
  const opts = [{ key: "3d", label: "3D" }, { key: "vol", label: "VOLUMEN" }];
  it("brackets the active option and exposes it as pressed", () => {
    render(<HudToggleGroup options={opts} value="vol" onChange={() => {}} />);
    expect(screen.getByRole("button", { name: /VOLUMEN/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /VOLUMEN/ }).textContent).toBe("[ VOLUMEN ]");
    expect(screen.getByRole("button", { name: /3D/ }).textContent).toBe("3D");
  });
  it("calls onChange with the key", () => {
    const on = vi.fn();
    render(<HudToggleGroup options={opts} value="3d" onChange={on} />);
    fireEvent.click(screen.getByRole("button", { name: /VOLUMEN/ }));
    expect(on).toHaveBeenCalledWith("vol");
  });
  it("con anchoFijo, apagado reserva los corchetes sin verse ni leerse (UNI-89)", () => {
    const local = [{ key: "local", label: "LOCAL ○" }];
    const { container, rerender } = render(<HudToggleGroup options={local} value="" onChange={() => {}} anchoFijo />);
    const boton = screen.getByRole("button", { name: "LOCAL ○" });
    const huecos = container.querySelectorAll<HTMLElement>('span[aria-hidden="true"]');
    expect(huecos).toHaveLength(2);
    huecos.forEach((h) => expect(h.style.visibility).toBe("hidden"));
    // Mismos caracteres encendido y apagado: el ancho no cambia en una fuente monoespaciada.
    const apagado = boton.textContent!;
    rerender(<HudToggleGroup options={[{ key: "local", label: "LOCAL ●" }]} value="local" onChange={() => {}} anchoFijo />);
    expect(screen.getByRole("button").textContent).toBe("[ LOCAL ● ]");
    expect(apagado.length).toBe("[ LOCAL ● ]".length);
  });
  it("sin anchoFijo, apagado no lleva hueco", () => {
    const { container } = render(<HudToggleGroup options={[{ key: "fit", label: "ENCUADRAR" }]} value="" onChange={() => {}} />);
    expect(container.querySelector("span")).toBeNull();
  });
  it("pinta el prefijo antes de las opciones, dentro del grupo", () => {
    const { container } = render(<HudToggleGroup label="EJE ▸" options={opts} value="3d" onChange={() => {}} />);
    const group = container.querySelector(".hud-toggle")!;
    const first = group.firstElementChild as HTMLElement;
    expect(first.className).toBe("hud-toggle-label");
    expect(first.textContent).toBe("EJE ▸");
    expect(group.textContent).toBe("EJE ▸[ 3D ]VOLUMEN");
  });
});
