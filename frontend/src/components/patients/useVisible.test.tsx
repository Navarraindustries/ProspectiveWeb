import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { useRef } from "react";
import { useVisible } from "./useVisible";

function Sonda({ margen }: { margen?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const visible = useVisible(ref, margen);
  return <div ref={ref} data-testid="sonda">{visible ? "visible" : "oculto"}</div>;
}

afterEach(() => vi.unstubAllGlobals());

describe("useVisible", () => {
  it("sin IntersectionObserver (jsdom) devuelve true de inmediato", () => {
    render(<Sonda />);
    expect(screen.getByTestId("sonda").textContent).toBe("visible");
  });

  it("con IntersectionObserver es false hasta que entra en pantalla y luego se queda true y se desconecta", () => {
    let callback: (e: { isIntersecting: boolean }[]) => void = () => {};
    const disconnect = vi.fn();
    const observe = vi.fn();
    const opciones: IntersectionObserverInit[] = [];
    vi.stubGlobal("IntersectionObserver", class {
      constructor(cb: typeof callback, o: IntersectionObserverInit) { callback = cb; opciones.push(o); }
      observe = observe;
      disconnect = disconnect;
    });
    render(<Sonda margen="100px" />);
    expect(screen.getByTestId("sonda").textContent).toBe("oculto");
    expect(observe).toHaveBeenCalledTimes(1);
    expect(opciones[0].rootMargin).toBe("100px");

    act(() => callback([{ isIntersecting: false }]));
    expect(screen.getByTestId("sonda").textContent).toBe("oculto");

    act(() => callback([{ isIntersecting: true }]));
    expect(screen.getByTestId("sonda").textContent).toBe("visible");
    expect(disconnect).toHaveBeenCalled();
  });
});
