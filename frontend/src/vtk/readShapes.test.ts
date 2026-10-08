/* Las anotaciones de una celda, leídas de su DOM para la captura.

   Lo que se defiende: que cada hijo del <svg class="hud-anot"> vuelve a ser la
   forma que lo dibujó, en px de la celda (sumando dónde está el svg), y que
   las demás capas en svg —las decorativas— no se cuelan como anotaciones. */
import { describe, expect, it } from "vitest";

import { readPaneShapes } from "./readShapes";

function celda(html: string): HTMLElement {
  const el = document.createElement("div");
  el.innerHTML = html;
  return el;
}

const rect = (left: number, top: number) => ({ left, top, x: left, y: top, width: 100, height: 100, right: left + 100, bottom: top + 100, toJSON: () => ({}) }) as DOMRect;

const ANOT = `<svg class="hud-anot" style="left:10px;top:5px">
  <line x1="1" y1="2" x2="30" y2="40" stroke="#f5c02e" stroke-width="3"></line>
  <polygon points="0,0 10,0 10,10" stroke="#3ad" fill="#3ad33"></polygon>
  <circle cx="7" cy="8" r="2.5" fill="#f5c02e"></circle>
  <text x="20" y="30" fill="#f5c02e">R1 · 5,0 mm</text>
</svg>`;

describe("readPaneShapes", () => {
  it("devuelve las cuatro formas con el desplazamiento del svg sumado", () => {
    const shapes = readPaneShapes(celda(ANOT));
    expect(shapes).toEqual([
      { kind: "line", x1: 11, y1: 7, x2: 40, y2: 45, color: "#f5c02e", width: 3, dashed: false },
      { kind: "polygon", points: [{ x: 10, y: 5 }, { x: 20, y: 5 }, { x: 20, y: 15 }], color: "#3ad", fill: "#3ad33", closed: true, width: 1.5 },
      { kind: "circle", x: 17, y: 13, r: 2.5, color: "#f5c02e" },
      { kind: "text", x: 30, y: 35, text: "R1 · 5,0 mm", color: "#f5c02e" },
    ]);
  });

  it("con maquetación, el desplazamiento sale de los rectángulos y no del estilo", () => {
    const el = celda(ANOT);
    const svg = el.querySelector("svg")!;
    el.getBoundingClientRect = () => rect(100, 50);
    svg.getBoundingClientRect = () => rect(103, 54);
    const [line] = readPaneShapes(el);
    expect(line).toMatchObject({ x1: 4, y1: 6 });
  });

  it("la línea discontinua y el grosor por defecto", () => {
    const [line] = readPaneShapes(celda(`<svg class="hud-anot"><line x1="0" y1="0" x2="5" y2="5" stroke="#fa8c1a" stroke-dasharray="4 3"></line></svg>`));
    expect(line).toEqual({ kind: "line", x1: 0, y1: 0, x2: 5, y2: 5, color: "#fa8c1a", width: 1.5, dashed: true });
  });

  it("un rótulo oculto (display none, el 3D fuera de cámara) no entra", () => {
    const shapes = readPaneShapes(celda(`<svg class="hud-anot"><text fill="#fff" display="none">M1</text><text x="3" y="4" fill="#fff">M2</text></svg>`));
    expect(shapes).toEqual([{ kind: "text", x: 3, y: 4, text: "M2", color: "#fff" }]);
  });

  it("ignora los svg decorativos y los demás", () => {
    const shapes = readPaneShapes(celda(`<svg class="hud-decor"><line x1="0" y1="0" x2="5" y2="5" stroke="#fff"></line></svg><svg><circle cx="1" cy="1" r="1" fill="#fff"></circle></svg>`));
    expect(shapes).toEqual([]);
  });
});
