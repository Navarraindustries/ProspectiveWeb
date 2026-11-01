import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

import { FranjaCasos } from "./FranjaCasos";

const reducida = vi.hoisted(() => ({ valor: false }));
vi.mock("../../motion", async (orig) => ({
  ...(await orig<typeof import("../../motion")>()),
  useReducedMotion: () => reducida.valor,
}));

const lienzo = (c: HTMLElement) => c.querySelector(".franja-casos__lienzo") as HTMLElement;

describe("FranjaCasos", () => {
  beforeEach(() => { reducida.valor = false; });

  it("con movimiento, la imagen lleva el paralaje (una transformación en línea)", () => {
    const { container } = render(<FranjaCasos />);
    expect(lienzo(container).style.transform).not.toBe("");
  });

  it("con movimiento reducido no hay paralaje: ninguna transformación", () => {
    reducida.valor = true;
    const { container } = render(<FranjaCasos />);
    expect(lienzo(container).style.transform).toBe("");
    for (const el of container.querySelectorAll<HTMLElement>("[style]")) {
      expect(el.style.transform).toBe("");
    }
  });

  it("el texto va sobre cristal, el <source> sigue el tramo móvil y el crédito enlaza IntrA", () => {
    const { container } = render(<FranjaCasos />);
    expect(container.querySelector(".franja-casos__texto")).toHaveAttribute("data-glass");
    expect(container.querySelector("source")).toHaveAttribute("media", "(max-width: 640px)");
    const enlace = container.querySelector(".franja-casos__credito a");
    expect(enlace).toHaveAttribute("href", "https://github.com/intra3d2019/IntrA");
  });
});
