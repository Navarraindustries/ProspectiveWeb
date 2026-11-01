import { beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";

import { Dispositivos } from "./SeccionDispositivos";

// Movimiento reducido desde el primer uso del hook.
beforeAll(() => {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query.includes("prefers-reduced-motion"),
    media: query, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {},
    addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  }));
});

const FICHAS: [string, string, string, string[]][] = [
  ["T1 recto", "navarro-t1-recto", "Clip NAVARRO™ T1 recto", []],
  ["T2 curvo", "navarro-t2-curvo", "Clip NAVARRO™ T2 curvo", []],
  ["T3 angulado", "navarro-t3-angulado-45", "Clip NAVARRO™ T3 angulado", ["15–90°"]],
  ["T4 fenestrado", "navarro-t4-fenestrado", "Clip NAVARRO™ T4 fenestrado", ["ventana 3 · 5 · 7 mm"]],
];

describe("Dispositivos", () => {
  it("región con id y cuatro fichas de cristal con su imagen", () => {
    const { container } = render(<Dispositivos />);
    expect(container.querySelector("section#dispositivos")).toHaveAttribute("aria-label", "Dispositivos NAVARRO™");
    const lis = [...container.querySelectorAll("ul.series > li")];
    expect(lis).toHaveLength(4);
    lis.forEach((li, i) => {
      const [nombre, archivo, alt, detalles] = FICHAS[i];
      expect(li.querySelector("[data-glass]")).not.toBeNull();
      expect(li.textContent).toContain(nombre);
      const img = li.querySelector("img")!;
      expect(img).toHaveAttribute("src", `/media/landing/clips/${archivo}.webp`);
      expect(img).toHaveAttribute("alt", alt);
      expect(img).toHaveAttribute("width", "600");
      expect(img).toHaveAttribute("height", "600");
      expect(img).toHaveAttribute("loading", "lazy");
      expect(img).toHaveAttribute("decoding", "async");
      for (const d of detalles) expect(li.textContent).toContain(d);
    });
  });

  it("con movimiento reducido el cursor no mueve ninguna ficha", () => {
    const { container } = render(<Dispositivos />);
    for (const f of container.querySelectorAll<HTMLElement>(".series__ficha")) {
      fireEvent.mouseEnter(f);
      expect(f.style.transform).toBe("");
    }
  });
});
