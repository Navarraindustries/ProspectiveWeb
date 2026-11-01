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
});
