/* Mandos del recorrido por dentro del vaso desde el teclado (17-11). */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HudRecorrido, crearProgreso, teclaDeAvance } from "./HudRecorrido";

function montar(extra: Partial<Parameters<typeof HudRecorrido>[0]> = {}) {
  const props = {
    progreso: crearProgreso(), totalMm: 60, diametroEn: () => 3, estado: "andando" as const,
    onPausa: vi.fn(), onSeguir: vi.fn(), onSalir: vi.fn(), onTeclas: vi.fn(), onMirarAlFrente: vi.fn(),
    ...extra,
  };
  render(<HudRecorrido {...props} />);
  return props;
}

describe("teclas del recorrido", () => {
  it("↑/W adelante, ↓/S atrás, nada más", () => {
    expect(teclaDeAvance("ArrowUp")).toBe("adelante");
    expect(teclaDeAvance("W")).toBe("adelante");
    expect(teclaDeAvance("s")).toBe("atras");
    expect(teclaDeAvance("ArrowLeft")).toBeNull();
  });

  it("mantener ↑ avanza y soltarla para; con Mayús va rápido", () => {
    const p = montar();
    fireEvent.keyDown(window, { key: "ArrowUp" });
    expect(p.onTeclas).toHaveBeenLastCalledWith({ adelante: true, atras: false, rapido: false });
    fireEvent.keyDown(window, { key: "Shift", shiftKey: true });
    expect(p.onTeclas).toHaveBeenLastCalledWith({ adelante: true, atras: false, rapido: true });
    fireEvent.keyUp(window, { key: "ArrowUp", shiftKey: true });
    expect(p.onTeclas).toHaveBeenLastCalledWith({ adelante: false, atras: false, rapido: true });
  });

  it("la repetición automática de la tecla no avisa de nuevo", () => {
    const p = montar();
    fireEvent.keyDown(window, { key: "ArrowDown" });
    fireEvent.keyDown(window, { key: "ArrowDown" });
    fireEvent.keyDown(window, { key: "ArrowDown" });
    expect(p.onTeclas).toHaveBeenCalledTimes(1);
  });

  it("al perder la ventana se sueltan las teclas", () => {
    const p = montar();
    fireEvent.keyDown(window, { key: "ArrowUp" });
    act(() => { window.dispatchEvent(new Event("blur")); });
    expect(p.onTeclas).toHaveBeenLastCalledWith({ adelante: false, atras: false, rapido: false });
  });

  it("Espacio pausa andando y sigue en pausa; F mira al frente; Esc sale", () => {
    const p = montar();
    fireEvent.keyDown(window, { key: " " });
    expect(p.onPausa).toHaveBeenCalled();
    fireEvent.keyDown(window, { key: "f" });
    expect(p.onMirarAlFrente).toHaveBeenCalled();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(p.onSalir).toHaveBeenCalled();
  });

  it("en la presentación, Espacio y Esc no son suyos", () => {
    const p = montar({ sinSalir: true, estado: "pausa" });
    fireEvent.keyDown(window, { key: " " });
    fireEvent.keyDown(window, { key: "Escape" });
    expect(p.onSeguir).not.toHaveBeenCalled();
    expect(p.onSalir).not.toHaveBeenCalled();
  });

  it("escribiendo en un campo, las teclas son del campo", () => {
    const p = montar();
    const input = document.createElement("input");
    document.body.appendChild(input);
    fireEvent.keyDown(input, { key: "w" });
    expect(p.onTeclas).not.toHaveBeenCalled();
    input.remove();
  });
});

describe("grabar", () => {
  it("sin grabar ofrece GRABAR; grabando enseña el tiempo y para", () => {
    const onGrabar = vi.fn(), onPararGrabacion = vi.fn();
    montar({ onGrabar, onPararGrabacion });
    fireEvent.click(screen.getByRole("button", { name: /GRABAR/ }));
    expect(onGrabar).toHaveBeenCalled();
  });

  it("grabando, el botón es el contador y para la grabación", () => {
    const onPararGrabacion = vi.fn();
    montar({ onGrabar: vi.fn(), onPararGrabacion, grabandoMs: 12_400 });
    const b = screen.getByRole("button", { name: /Parar la grabación \(00:12\)/ });
    fireEvent.click(b);
    expect(onPararGrabacion).toHaveBeenCalled();
  });
});
