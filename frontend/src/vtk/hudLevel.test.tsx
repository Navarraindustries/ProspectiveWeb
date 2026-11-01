// frontend/src/vtk/hudLevel.test.tsx
// El nivel del HUD lo aplica el CSS (`[data-hud=…]` en hud.css): aquí se carga
// la hoja real en un <style> y se mira el `display` computado de cada pieza.
// Se lee del disco: en vitest `import "…css?raw"` llega vacío (css desactivado).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { HudLevel } from "./viewerPrefs";

const css = readFileSync(resolve(__dirname, "hud/hud.css"), "utf8");

let style: HTMLStyleElement;
beforeEach(() => {
  style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);
});
afterEach(() => style.remove());

function fixture(level: HudLevel) {
  const { container } = render(
    <div data-hud={level}>
      <div className="hud-decor" data-t="decor" />
      <div className="hud-decor hud-ladder" data-t="ladder" />
      <div className="hud-corner" data-t="corner" />
      <div className="hud-label" data-t="label" />
      <div className="hud-readout" data-t="readout" />
      <div className="hud-edge" data-t="edge" />
      <div className="hud-scale" data-t="scale" />
      <div className="hud-hint" data-t="hint" />
      <div className="hud-hint hud-hint-level" data-t="level-hint" />
      <div className="hud-hint hud-hint-aviso" data-t="aviso" />
      <div className="hud-readout hud-prompt" data-t="prompt" />
      <div className="hud-cine" data-t="cine" />
      <div className="hud-cine playing" data-t="cine-playing" />
      <button className="hud-toggle" data-t="toggle" />
      {/* Como el deslizador de LÁMINA en MIP: un control envuelto en .hud-toggle. */}
      <span className="hud-toggle"><input type="range" data-t="wrapped-range" /></span>
      {/* La fila de deslizadores del Oblicuo. */}
      <div className="hud-controls" data-t="controls"><input type="range" data-t="controls-range" /></div>
      <svg className="hud-anot" data-t="anot" />
    </div>,
  );
  // Visible solo si ni el nodo ni ningún antepasado está en display:none
  // (un control envuelto se oculta por su envoltorio).
  const shown = (t: string) => {
    for (let n: Element | null = container.querySelector(`[data-t="${t}"]`); n; n = n.parentElement) {
      if (getComputedStyle(n).display === "none") return false;
    }
    return true;
  };
  return shown;
}

describe("nivel del HUD (hud.css)", () => {
  it("completo: se ve todo", () => {
    const shown = fixture("completo");
    for (const t of ["decor", "ladder", "corner", "label", "readout", "edge", "scale", "hint", "cine", "toggle", "wrapped-range", "controls-range", "anot"]) {
      expect(shown(t), t).toBe(true);
    }
  });

  it("esencial: fuera decoración, esquinas, botones y pista; quedan escalera, lecturas, escala, cine y anotaciones", () => {
    const shown = fixture("esencial");
    for (const t of ["decor", "corner", "toggle", "hint", "wrapped-range", "controls", "controls-range"]) expect(shown(t), t).toBe(false);
    for (const t of ["ladder", "label", "readout", "edge", "scale", "cine", "anot", "level-hint", "aviso", "prompt"]) expect(shown(t), t).toBe(true);
  });

  it("limpio: la imagen con lateralidad, escala y anotaciones (y el cine mientras reproduce)", () => {
    const shown = fixture("limpio");
    for (const t of ["decor", "ladder", "corner", "label", "readout", "hint", "cine", "toggle", "wrapped-range", "controls", "controls-range"]) {
      expect(shown(t), t).toBe(false);
    }
    // Los avisos y la instrucción de la herramienta armada se leen también en limpio.
    for (const t of ["anot", "cine-playing", "level-hint", "aviso", "prompt"]) expect(shown(t), t).toBe(true);
  });

});

describe("banda del visor en táctil (hud.css)", () => {
  it("la banda táctil pide 44 px de alto y 44 px por botón", () => {
    const { container } = render(<div className="viewer-band" data-tactil="true"><button data-t="b">C</button></div>);
    expect(getComputedStyle(container.firstElementChild!).minHeight).toBe("44px");
    expect(getComputedStyle(container.querySelector('[data-t="b"]')!).minWidth).toBe("44px");
  });

  it("los desplegables y el ⚠ también son objetivos de 44 px a 13 px de letra", () => {
    const { container } = render(
      <div className="viewer-band" data-tactil="true">
        <select className="viewer-band-select" data-t="s"><option>3D</option></select>
        <button className="hud-note-toggle" data-t="w">!</button>
        <span className="hud-toggle"><button data-t="t">C</button></span>
      </div>,
    );
    for (const t of ["s", "w", "t"]) {
      const cs = getComputedStyle(container.querySelector(`[data-t="${t}"]`)!);
      expect(cs.minHeight, t).toBe("44px");
      expect(cs.minWidth, t).toBe("44px");
      expect(cs.fontSize, t).toBe("13px");
    }
  });

  it("fuera de táctil el desplegable de la banda es de 11 px y sin mínimo de 44", () => {
    const { container } = render(<div className="viewer-band"><select className="viewer-band-select" data-t="s" /></div>);
    const cs = getComputedStyle(container.querySelector('[data-t="s"]')!);
    expect(cs.fontSize).toBe("11px");
    expect(cs.minHeight).not.toBe("44px");
  });
});

describe("HUD de las celdas en táctil (hud.css)", () => {
  it("en táctil los conmutadores de la celda miden 44 px y envuelven; sin táctil, no", () => {
    const { container } = render(
      <div><div data-hud="completo" data-tactil="true"><span className="hud-toggle" data-t="g"><button data-t="b">AX</button></span></div>
           <div data-hud="completo"><span className="hud-toggle" data-t="g2"><button data-t="b2">AX</button></span></div></div>);
    const q = (t: string) => getComputedStyle(container.querySelector(`[data-t="${t}"]`)!);
    expect(q("b").minHeight).toBe("44px");
    expect(q("g").flexWrap).toBe("wrap");
    expect(q("b2").minHeight).not.toBe("44px");
  });
});

describe("nivel del HUD (hud.css), lateralidad", () => {
  /* F1-118: LIMPIO quitaba también ANT/POST/IZQ/DER y la regla de 10 mm; una
     captura limpia no decía de qué lado era la lesión ni cuánto medía. */
  it("F1-118: en LIMPIO siguen «DER», «IZQ» y la regla", () => {
    const { container } = render(
      <div data-hud="limpio">
        <span className="hud-edge left">DER</span>
        <span className="hud-edge right beside-ladder">IZQ</span>
        <div className="hud-scale" data-t="regla"><span>10 mm</span></div>
      </div>,
    );
    const visible = (el: Element | null) => {
      for (let n = el; n; n = n.parentElement) if (getComputedStyle(n).display === "none") return false;
      return el !== null;
    };
    const byText = (t: string) => [...container.querySelectorAll("span")].find((n) => n.textContent === t) ?? null;
    expect(visible(byText("DER"))).toBe(true);
    expect(visible(byText("IZQ"))).toBe(true);
    expect(visible(container.querySelector('[data-t="regla"]'))).toBe(true);
  });
});
