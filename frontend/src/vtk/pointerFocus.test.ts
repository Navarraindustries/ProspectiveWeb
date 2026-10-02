// frontend/src/vtk/pointerFocus.test.ts
import { afterEach, describe, expect, it } from "vitest";
import { focusOnPointerDown } from "./pointerFocus";

function build() {
  document.body.innerHTML = `
    <button id="outside">paso</button>
    <div id="host" tabindex="0">
      <div id="grid" tabindex="-1">
        <div data-pane="axial"><div id="axial" tabindex="0"><canvas id="axcv"></canvas><button id="hudbtn">▶</button></div></div>
        <div data-pane="mip"><div id="mip" tabindex="0"><canvas id="mipcv"></canvas><input id="slider" type="range"/></div></div>
        <div id="gap"></div>
      </div>
    </div>`;
  const $ = (id: string) => document.getElementById(id)!;
  return { $, host: $("host") };
}
afterEach(() => { document.body.innerHTML = ""; });

describe("focusOnPointerDown", () => {
  it("pinchar el lienzo de un corte enfoca su celda, no el contenedor", () => {
    const { $, host } = build();
    $("outside").focus();
    expect(focusOnPointerDown($("axcv"), host, document.activeElement)).toBe($("axial"));
  });
  it("de una celda a otra el foco se mueve aunque ya esté dentro del visor", () => {
    const { $, host } = build();
    $("axial").focus();
    expect(focusOnPointerDown($("mipcv"), host, document.activeElement)).toBe($("mip"));
  });
  it("la celda que ya tiene el foco (o algo suyo) no se toca", () => {
    const { $, host } = build();
    $("axial").focus();
    expect(focusOnPointerDown($("axcv"), host, document.activeElement)).toBeNull();
  });
  it("un control nativo se queda su foco: lo pone el navegador", () => {
    const { $, host } = build();
    $("outside").focus();
    expect(focusOnPointerDown($("hudbtn"), host, document.activeElement)).toBeNull();
    expect(focusOnPointerDown($("slider"), host, document.activeElement)).toBeNull();
  });
  it("fuera de toda celda: el contenedor, solo si el foco estaba fuera del visor", () => {
    const { $, host } = build();
    $("outside").focus();
    expect(focusOnPointerDown($("gap"), host, document.activeElement)).toBe(host);
    $("axial").focus();
    expect(focusOnPointerDown($("gap"), host, document.activeElement)).toBeNull();
  });
});
