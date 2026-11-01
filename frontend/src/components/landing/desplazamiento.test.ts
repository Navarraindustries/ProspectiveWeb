import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import type { MouseEvent } from "react";

import { EASE, animate } from "../../motion";
import { desplazarA, destinoDe, useIrASeccion } from "./desplazamiento";

const stop = vi.hoisted(() => vi.fn());
vi.mock("../../motion", async (orig) => ({
  ...(await orig<typeof import("../../motion")>()),
  animate: vi.fn(() => ({ stop })),
}));

const cajaEn = (top: number) => ({ getBoundingClientRect: () => ({ top }) }) as unknown as Element;
let el: HTMLElement;

beforeEach(() => {
  el = document.createElement("section");
  el.id = "indices";
  el.tabIndex = -1;
  el.getBoundingClientRect = () => ({ top: 1300 }) as DOMRect;
  document.body.appendChild(el);
  window.scrollTo = vi.fn();
  vi.stubGlobal("scrollY", 0);
});
afterEach(() => {
  // Corta lo que un test haya dejado en curso antes de limpiar los espías.
  window.dispatchEvent(new Event("wheel"));
  el.remove();
  stop.mockClear();
  vi.mocked(animate).mockClear();
  vi.unstubAllGlobals();
});

describe("desplazamiento", () => {
  it("destinoDe resta el alto de la nav y nunca baja de 0", () => {
    expect(destinoDe(el, 0)).toBe(1204);
    expect(destinoDe(cajaEn(50), 0)).toBe(0);
  });
  it("anima de scrollY al destino en 0,6 s con la curva común y deja el foco en la sección", () => {
    desplazarA("indices", { reducido: false });
    expect(animate).toHaveBeenCalledWith(0, 1204, expect.objectContaining({ duration: 0.6, ease: EASE }));
    const op = vi.mocked(animate).mock.calls[0][2] as unknown as { onUpdate(y: number): void; onComplete(): void };
    op.onUpdate(600);
    expect(window.scrollTo).toHaveBeenCalledWith(0, 600);
    op.onComplete();
    expect(document.activeElement).toBe(el);
    expect(location.hash).toBe("#indices");
  });
  it("la rueda, un toque, un clic o una tecla cortan la animación", () => {
    for (const tipo of ["wheel", "touchstart", "pointerdown", "keydown"]) {
      stop.mockClear();
      desplazarA("indices", { reducido: false });
      window.dispatchEvent(new Event(tipo));
      expect(stop).toHaveBeenCalledTimes(1);
    }
  });
  it("al acabar quita las escuchas de corte", () => {
    desplazarA("indices", { reducido: false });
    const op = vi.mocked(animate).mock.calls[0][2] as unknown as { onComplete(): void };
    op.onComplete();
    window.dispatchEvent(new Event("wheel"));
    expect(stop).not.toHaveBeenCalled();
  });
  it("solo un desplazamiento a la vez: el segundo corta el primero y solo se enfoca su sección", () => {
    const otra = document.createElement("section");
    otra.id = "dispositivos";
    otra.tabIndex = -1;
    otra.getBoundingClientRect = () => ({ top: 2600 }) as DOMRect;
    document.body.appendChild(otra);
    const paradas = [vi.fn(), vi.fn()];
    vi.mocked(animate)
      .mockImplementationOnce((() => ({ stop: paradas[0] })) as never)
      .mockImplementationOnce((() => ({ stop: paradas[1] })) as never);
    try {
      desplazarA("indices", { reducido: false });
      desplazarA("dispositivos", { reducido: false });
      expect(paradas[0]).toHaveBeenCalledTimes(1);
      expect(paradas[1]).not.toHaveBeenCalled();
      const [primera, segunda] = vi.mocked(animate).mock.calls.map((c) => c[2] as unknown as { onComplete(): void });
      // Aunque la primera avisara de que ha acabado, ya no enfoca nada.
      primera.onComplete();
      expect(document.activeElement).not.toBe(el);
      segunda.onComplete();
      expect(document.activeElement).toBe(otra);
      expect(location.hash).toBe("#dispositivos");
      // Ni la primera (cortada) ni la segunda (acabada) siguen escuchando la rueda.
      window.dispatchEvent(new Event("wheel"));
      expect(paradas[0]).toHaveBeenCalledTimes(1);
      expect(paradas[1]).not.toHaveBeenCalled();
    } finally {
      otra.remove();
    }
  });
  it("con movimiento reducido salta directo, sin animar", () => {
    desplazarA("indices", { reducido: true });
    expect(animate).not.toHaveBeenCalled();
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 1204, behavior: "instant" });
    expect(document.activeElement).toBe(el);
  });
  it("un id que no existe no hace nada", () => {
    desplazarA("nada", { reducido: false });
    expect(animate).not.toHaveBeenCalled();
  });
  it("Ctrl/Cmd/Mayús-clic y botón central se dejan al navegador", () => {
    const { result } = renderHook(() => useIrASeccion());
    const evento = (o: object) =>
      ({ button: 0, defaultPrevented: false, preventDefault: vi.fn(), ...o }) as unknown as MouseEvent<HTMLAnchorElement>;
    for (const o of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { button: 1 }]) {
      const e = evento(o);
      result.current(e, "indices");
      expect(e.preventDefault).not.toHaveBeenCalled();
    }
    expect(animate).not.toHaveBeenCalled();
    const e = evento({});
    result.current(e, "indices");
    expect(e.preventDefault).toHaveBeenCalled();
    expect(animate).toHaveBeenCalled();
  });
});
