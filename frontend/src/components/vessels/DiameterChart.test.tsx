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
  it("sin onPick sigue siendo una imagen", () => {
    const { container } = render(<DiameterChart arc={arc} diameters={d} meanDiameter={2.9} />);
    expect(container.querySelector("svg")!.getAttribute("tabindex")).toBeNull();
  });
});
