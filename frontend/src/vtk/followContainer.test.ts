/* La escena 3D sigue al tamaño de su recuadro, no solo al de la ventana. */

import { afterEach, describe, expect, it, vi } from "vitest";
import { followContainer } from "./followContainer";

class FakeRO {
  static last: FakeRO | null = null;
  cb: () => void;
  disconnected = false;
  constructor(cb: () => void) { this.cb = cb; FakeRO.last = this; }
  observe() {}
  disconnect() { this.disconnected = true; }
}

afterEach(() => vi.unstubAllGlobals());

function conTamaño(width: number, height: number): HTMLElement {
  const el = document.createElement("div");
  el.getBoundingClientRect = () => ({ width, height, top: 0, left: 0, right: width, bottom: height, x: 0, y: 0, toJSON() {} });
  return el;
}

describe("followContainer", () => {
  it("redimensiona y repinta cuando cambia el recuadro (p. ej. al ocultar los cortes)", () => {
    vi.stubGlobal("ResizeObserver", FakeRO);
    vi.stubGlobal("requestAnimationFrame", (f: () => void) => { f(); return 1; });
    vi.stubGlobal("cancelAnimationFrame", () => {});
    const render = vi.fn();
    const fsrw = { resize: vi.fn(), getRenderWindow: () => ({ render }) };
    const stop = followContainer(conTamaño(800, 600), fsrw);

    FakeRO.last!.cb();
    expect(fsrw.resize).toHaveBeenCalledTimes(1);
    expect(render).toHaveBeenCalledTimes(1);

    stop();
    expect(FakeRO.last!.disconnected).toBe(true);
  });

  it("no rompe si la ventana ya se borró", () => {
    vi.stubGlobal("ResizeObserver", FakeRO);
    vi.stubGlobal("requestAnimationFrame", (f: () => void) => { f(); return 1; });
    vi.stubGlobal("cancelAnimationFrame", () => {});
    const fsrw = { resize: () => { throw new Error("deleted"); }, getRenderWindow: () => ({ render() {} }) };
    followContainer(conTamaño(800, 600), fsrw);
    expect(() => FakeRO.last!.cb()).not.toThrow();
  });

  it("no redimensiona con el recuadro a 0, que deja la cámara en NaN", () => {
    // Al desplegar el stent la escena se rehace y el recuadro pasa por 0:
    // vtk.js calculaba el aspecto 0/0 y la pantalla se quedaba negra.
    vi.stubGlobal("ResizeObserver", FakeRO);
    vi.stubGlobal("requestAnimationFrame", (f: () => void) => { f(); return 1; });
    vi.stubGlobal("cancelAnimationFrame", () => {});
    const fsrw = { resize: vi.fn(), getRenderWindow: () => ({ render: vi.fn() }) };
    followContainer(conTamaño(800, 0), fsrw);
    FakeRO.last!.cb();
    expect(fsrw.resize).not.toHaveBeenCalled();
  });
});
