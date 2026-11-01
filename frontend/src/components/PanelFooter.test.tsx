import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PanelActions, PanelFooter } from "./PanelFooter";
import { simularPantalla } from "../test/pantalla";

const css = readFileSync(resolve(__dirname, "../styles/responsive.css"), "utf8");
let style: HTMLStyleElement;
beforeEach(() => {
  style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);
});
afterEach(() => {
  style.remove();
  vi.unstubAllGlobals();
});

describe("PanelFooter", () => {
  it("pinta la nota encima de los botones y lleva la clase del pie", () => {
    const { container } = render(<PanelFooter note="Guardado hace un momento"><button type="button">Siguiente</button></PanelFooter>);
    const note = screen.getByText("Guardado hace un momento");
    const btn = screen.getByRole("button", { name: "Siguiente" });
    expect(note.compareDocumentPosition(btn) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(container.querySelector(".ws-panel-footer")).not.toBeNull();
  });

  it.each([360, 768, 1440])("a %i px los botones del pie no se parten y la fila envuelve", (w) => {
    simularPantalla(w);
    const { container } = render(<PanelFooter><PanelActions><button>Re-segmentar</button><button>Continuar a detección</button></PanelActions></PanelFooter>);
    const fila = container.querySelector(".ws-panel-actions")!;
    expect(getComputedStyle(fila).flexWrap).toBe("wrap");
    for (const b of fila.querySelectorAll("button")) expect(getComputedStyle(b).whiteSpace).toBe("nowrap");
  });
});
