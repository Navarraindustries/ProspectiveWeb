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

import { refocusAfterHide } from "./pointerFocus";
describe("refocusAfterHide", () => {
  const mk = () => {
    const host = document.createElement("div");
    const main = document.createElement("div"), hidden = document.createElement("div"), scene = document.createElement("div");
    const mainWrap = document.createElement("div"); mainWrap.tabIndex = 0; main.appendChild(mainWrap);
    const hiddenWrap = document.createElement("div"); hiddenWrap.tabIndex = 0; hidden.appendChild(hiddenWrap);
    const panelBtn = document.createElement("button");
    host.append(main, hidden, scene); document.body.append(host, panelBtn);
    return { host, main, mainWrap, hidden, hiddenWrap, scene, panelBtn, done: () => { host.remove(); panelBtn.remove(); } };
  };
  it("foco perdido o aún en la celda oculta: al envoltorio de la principal", () => {
    const t = mk();
    expect(refocusAfterHide(document.body, t.hidden, t.main, t.host)).toBe(t.mainWrap);
    expect(refocusAfterHide(t.hiddenWrap, t.hidden, t.main, t.host)).toBe(t.mainWrap);
    expect(refocusAfterHide(null, t.hidden, t.main, t.host)).toBe(t.mainWrap);
    t.done();
  });
  it("principal sin envoltorio (3D): al contenedor del visor", () => {
    const t = mk();
    expect(refocusAfterHide(document.body, t.hidden, t.scene, t.host)).toBe(t.host);
    t.done();
  });
  it("un control fuera de la celda oculta conserva el foco", () => {
    const t = mk();
    expect(refocusAfterHide(t.panelBtn, t.hidden, t.main, t.host)).toBeNull();
    t.done();
  });
});
