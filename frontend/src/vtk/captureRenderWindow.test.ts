/* `grab`, lo que usa la grabación para copiar cada panel.

   El fallo que fija: mientras el profesional gira la malla, el interactor de
   vtk.js está animando y su `render()` no dibuja. El vídeo copiaba entonces
   un lienzo vacío y salían fotogramas enteros en verde. */
import { describe, expect, it, vi } from "vitest";
import { captureRenderWindow, drawNow } from "./captureRenderWindow";

function ventana() {
  const canvas = { width: 800, height: 600 } as HTMLCanvasElement;
  const pases = vi.fn();
  const preRender = vi.fn();
  const win = {
    getApiSpecificRenderWindow: () => ({ getCanvas: () => canvas, captureNextImage: vi.fn() }),
    getRenderWindow: () => ({ preRender, getViews: () => [{ traverseAllPasses: pases }] }),
  };
  return { win, canvas, pases, preRender };
}

describe("grab", () => {
  it("dibuja aunque el interactor esté animando (su render no hace nada)", () => {
    const { win, canvas, pases } = ventana();
    const renderDelInteractor = vi.fn();          // animando: no dibuja
    const ctx = { drawImage: vi.fn() } as unknown as CanvasRenderingContext2D;
    const cap = captureRenderWindow(win, renderDelInteractor);
    expect(cap.grab!(ctx, { x: 1, y: 2, w: 3, h: 4 })).toBe(true);
    expect(pases).toHaveBeenCalledTimes(1);       // dibujó de verdad
    expect(renderDelInteractor).not.toHaveBeenCalled();
    expect(ctx.drawImage).toHaveBeenCalledWith(canvas, 1, 2, 3, 4);
  });

  it("dibuja ANTES de copiar", () => {
    const orden: string[] = [];
    const win = {
      getApiSpecificRenderWindow: () => ({ getCanvas: () => ({ width: 8, height: 6 } as HTMLCanvasElement) }),
      getRenderWindow: () => ({ getViews: () => [{ traverseAllPasses: () => { orden.push("dibuja"); } }] }),
    };
    const ctx = { drawImage: () => orden.push("copia") } as unknown as CanvasRenderingContext2D;
    captureRenderWindow(win, () => {}).grab!(ctx, { x: 0, y: 0, w: 1, h: 1 });
    expect(orden).toEqual(["dibuja", "copia"]);
  });

  it("sin lienzo no copia nada y lo dice", () => {
    const cap = captureRenderWindow({ getApiSpecificRenderWindow: () => ({ getCanvas: () => null }) }, () => {});
    expect(cap.grab!({ drawImage: vi.fn() } as unknown as CanvasRenderingContext2D, { x: 0, y: 0, w: 1, h: 1 })).toBe(false);
  });
});

describe("drawNow", () => {
  it("sin vistas que recorrer, vuelve al render de siempre", () => {
    const render = vi.fn();
    drawNow({ getRenderWindow: () => ({ getViews: () => [] }) }, render);
    drawNow(null, render);
    expect(render).toHaveBeenCalledTimes(2);
  });
});
