import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";

import { HaloLesion } from "./HaloLesion";
import { QueEs } from "./SeccionQueEs";

const reducida = vi.hoisted(() => ({ valor: false }));
vi.mock("../../motion", async (orig) => ({
  ...(await orig<typeof import("../../motion")>()),
  useReducedMotion: () => reducida.valor,
}));

describe("QueEs", () => {
  beforeEach(() => { reducida.valor = false; });
  afterEach(() => vi.unstubAllGlobals());

  it("región «Qué es» con los dos textos de siempre", () => {
    const { container } = render(<QueEs />);
    expect(container.querySelector("section#que-es")).toHaveAccessibleName("Una mesa de quirófano hecha de imagen");
    expect(screen.getByText("Del DICOM a la decisión")).toBeInTheDocument();
    expect(screen.getByText(/Puedes registrar al paciente con iniciales o un código/)).toBeInTheDocument();
  });

  it("la imagen del render va en un marco de cristal, con tamaño y alt", () => {
    const { container } = render(<QueEs />);
    const img = container.querySelector("img")!;
    expect(img).toHaveAttribute("src", "/media/landing/secciones/case3-oblicua.webp");
    expect(img).toHaveAttribute("width", "800");
    expect(img).toHaveAttribute("height", "600");
    expect(img).toHaveAttribute("loading", "lazy");
    expect(img).toHaveAttribute("decoding", "async");
    expect(img.getAttribute("alt")).toMatch(/tronco basilar/);
    expect(img.closest("[data-glass]")).not.toBeNull();
    expect(screen.getByText("Case 3 · 3DRA · malla de la segmentación automática")).toBeInTheDocument();
    expect(container.querySelector('[data-pulso="true"]')).not.toBeNull();
  });

  it("HaloLesion solo late en pantalla: fuera de ella el anillo no se mueve", async () => {
    const avisos: ((e: { isIntersecting: boolean; target: Element }[]) => void)[] = [];
    vi.stubGlobal("IntersectionObserver", class {
      constructor(cb: (e: { isIntersecting: boolean; target: Element }[]) => void) { avisos.push(cb); }
      observe() {}
      unobserve() {}
      disconnect() {}
    });
    const { container } = render(<HaloLesion x={60} y={40} />);
    const anillo = container.querySelector<HTMLElement>(".halo-lesion__anillo")!;
    await act(() => new Promise((r) => setTimeout(r, 120)));
    expect(anillo.style.transform).toBe("");
    act(() => { for (const cb of avisos) cb([{ isIntersecting: true, target: anillo }]); });
    await act(() => new Promise((r) => setTimeout(r, 120)));
    expect(anillo.style.transform).toMatch(/scale\(/);
  });

  it("HaloLesion late con movimiento y queda quieto con movimiento reducido", () => {
    const { container, rerender } = render(<HaloLesion x={60} y={40} />);
    expect(container.firstElementChild).toHaveAttribute("data-pulso", "true");
    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
    reducida.valor = true;
    rerender(<HaloLesion x={60} y={40} />);
    expect(container.firstElementChild).toHaveAttribute("data-pulso", "false");
    for (const el of container.querySelectorAll<HTMLElement>("[style]")) {
      expect(el.style.transform).toBe("");
    }
  });
});
