import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HudAnnotations } from "./HudAnnotations";
import type { Shape } from "../annotationOverlay";

describe("HudAnnotations", () => {
  it("dibuja las formas como hijos SVG planos con px absolutos", () => {
    const shapes: Shape[] = [
      { kind: "line", x1: 1, y1: 2, x2: 30, y2: 40, color: "#f5c02e", width: 3, dashed: true },
      { kind: "polygon", points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }], color: "#5fd38a", fill: "#5fd38a33", closed: true },
      { kind: "circle", x: 5, y: 6, r: 2.5, color: "#e06ad1" },
      { kind: "text", x: 12, y: 14, text: "R1 · 30,0 mm", color: "#f5c02e" },
    ];
    const { container } = render(<HudAnnotations shapes={shapes} />);
    const svg = container.querySelector("svg.hud-anot")!;
    expect(svg).not.toBeNull();
    const line = svg.querySelector("line")!;
    expect([line.getAttribute("x1"), line.getAttribute("y2"), line.getAttribute("stroke"), line.getAttribute("stroke-width")]).toEqual(["1", "40", "#f5c02e", "3"]);
    expect(line.getAttribute("stroke-dasharray")).not.toBeNull();
    const poly = svg.querySelector("polygon")!;
    expect(poly.getAttribute("points")).toBe("0,0 10,0 10,10");
    expect(poly.getAttribute("fill")).toBe("#5fd38a33");
    expect(svg.querySelector("circle")?.getAttribute("fill")).toBe("#e06ad1");
    const text = svg.querySelector("text")!;
    expect([text.textContent, text.getAttribute("x"), text.getAttribute("fill")]).toEqual(["R1 · 30,0 mm", "12", "#f5c02e"]);
    // Nada de transformaciones: la captura lee las coordenadas tal cual.
    expect(svg.querySelector("[transform]")).toBeNull();
  });

  it("un polígono abierto (borrador) sale como tramos sueltos", () => {
    const shapes: Shape[] = [
      { kind: "polygon", points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }], color: "#fa8c1a", fill: "none", closed: false },
    ];
    const { container } = render(<HudAnnotations shapes={shapes} />);
    expect(container.querySelectorAll("line")).toHaveLength(2);
    expect(container.querySelector("polygon")).toBeNull();
  });

  it("nada cuando la lista está vacía", () => {
    const { container } = render(<HudAnnotations shapes={[]} />);
    expect(container.querySelector("svg")).toBeNull();
  });
});
