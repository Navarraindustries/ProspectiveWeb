/* La gráfica de calibre enseñaba dónde se estrecha el vaso y no llevaba allí (spec §7.2). */
import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DiameterChart } from "./DiameterChart";

const arc = [0, 10, 20, 30, 40], d = [3, 3.2, 2.1, 3.1, 3];

function chart(onPick = vi.fn(), cursor: number | null = null) {
  const { container } = render(<DiameterChart arc={arc} diameters={d} meanDiameter={2.9} onPick={onPick} cursorArcMm={cursor} />);
  const svg = container.querySelector("svg")!;
  // viewBox 320×150; el área del trazado va de x=30 a x=310.
  svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 320, height: 150, right: 320, bottom: 150, x: 0, y: 0, toJSON: () => ({}) });
  return { svg, onPick };
}

describe("DiameterChart", () => {
  it("un clic en el trazado llama a onPick con la posición en mm", () => {
    const { svg, onPick } = chart();
    fireEvent.click(svg, { clientX: 170, clientY: 60 });   // mitad del área → 20 mm
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick.mock.calls[0][0]).toBeCloseTo(20, 5);
  });
  it("fuera del área se acota a los extremos", () => {
    const { svg, onPick } = chart();
    fireEvent.click(svg, { clientX: 2, clientY: 60 });
    expect(onPick).toHaveBeenLastCalledWith(0);
    fireEvent.click(svg, { clientX: 318, clientY: 60 });
    expect(onPick).toHaveBeenLastCalledWith(40);
  });
  it("dibuja el cursor donde está el foco", () => {
    const { svg } = chart(vi.fn(), 20);
    expect(svg.querySelector('[data-t="cursor"]')).not.toBeNull();
    expect(chart(vi.fn(), null).svg.querySelector('[data-t="cursor"]')).toBeNull();
  });
  it("← y → mueven una muestra desde el cursor", () => {
    const { svg, onPick } = chart(vi.fn(), 20);
    fireEvent.keyDown(svg, { key: "ArrowRight" });
    expect(onPick).toHaveBeenLastCalledWith(30);
    fireEvent.keyDown(svg, { key: "ArrowLeft" });
    expect(onPick).toHaveBeenLastCalledWith(10);
  });
  it("con muestras muy juntas, → va a la siguiente aunque el cursor esté entre dos", () => {
    const onPick = vi.fn();
    render(<DiameterChart arc={[0, 0.2, 0.4, 0.6, 0.8]} diameters={d} meanDiameter={2.9} onPick={onPick} cursorArcMm={0.3} />);
    const svg = document.querySelector("svg")!;
    fireEvent.keyDown(svg, { key: "ArrowRight" });
    expect(onPick).toHaveBeenLastCalledWith(0.4);
    fireEvent.keyDown(svg, { key: "ArrowLeft" });
    expect(onPick).toHaveBeenLastCalledWith(0.2);
  });
  it("→ no se atasca cuando el punto compartido vuelve al mismo sitio de la línea central", () => {
    // Muestras cada 0,25 mm y puntos de la línea central cada 0,5: elegir 0,75
    // deja el cursor otra vez en 0,5; la flecha siguiente tiene que seguir avanzando.
    const fino = [0, 0.25, 0.5, 0.75, 1];
    const onPick = vi.fn();
    const { rerender } = render(<DiameterChart arc={fino} diameters={d} meanDiameter={2.9} onPick={onPick} cursorArcMm={0.5} />);
    const svg = document.querySelector("svg")!;
    fireEvent.keyDown(svg, { key: "ArrowRight" });
    expect(onPick).toHaveBeenLastCalledWith(0.75);
    rerender(<DiameterChart arc={fino} diameters={d} meanDiameter={2.9} onPick={onPick} cursorArcMm={0.5} />);
    fireEvent.keyDown(svg, { key: "ArrowRight" });
    expect(onPick).toHaveBeenLastCalledWith(1);
  });
  it("arrastrar sobre el trazado va llamando a onPick", () => {
    const { svg, onPick } = chart();
    fireEvent.pointerDown(svg, { clientX: 30, clientY: 60, button: 0, buttons: 1, pointerId: 1 });
    fireEvent.pointerMove(svg, { clientX: 170, clientY: 60, buttons: 1, pointerId: 1 });
    fireEvent.pointerMove(svg, { clientX: 240, clientY: 60, buttons: 0, pointerId: 1 });   // ya soltado: no cuenta
    expect(onPick.mock.calls.map((c) => c[0])).toEqual([0, expect.closeTo(20, 5)]);
  });
  it("un clic con ratón elige una sola vez", () => {
    const { svg, onPick } = chart();
    fireEvent.pointerDown(svg, { clientX: 170, clientY: 60, button: 0, buttons: 1, pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: 170, clientY: 60, button: 0, buttons: 0, pointerId: 1 });
    fireEvent.click(svg, { clientX: 170, clientY: 60 });
    expect(onPick).toHaveBeenCalledTimes(1);
  });
  it("sin onPick sigue siendo una imagen", () => {
    const { container } = render(<DiameterChart arc={arc} diameters={d} meanDiameter={2.9} />);
    expect(container.querySelector("svg")!.getAttribute("tabindex")).toBeNull();
  });
});
