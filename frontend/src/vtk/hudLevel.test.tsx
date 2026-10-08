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
      <div className="hud-cine" data-t="cine" />
      <div className="hud-cine playing" data-t="cine-playing" />
      <button className="hud-toggle" data-t="toggle" />
      <svg className="hud-anot" data-t="anot" />
    </div>,
  );
  const shown = (t: string) => getComputedStyle(container.querySelector(`[data-t="${t}"]`)!).display !== "none";
  return shown;
}

describe("nivel del HUD (hud.css)", () => {
  it("completo: se ve todo", () => {
    const shown = fixture("completo");
    for (const t of ["decor", "ladder", "corner", "label", "readout", "edge", "scale", "hint", "cine", "toggle", "anot"]) {
      expect(shown(t), t).toBe(true);
    }
  });

  it("esencial: fuera decoración, esquinas, botones y pista; quedan escalera, lecturas, escala, cine y anotaciones", () => {
    const shown = fixture("esencial");
    for (const t of ["decor", "corner", "toggle", "hint"]) expect(shown(t), t).toBe(false);
    for (const t of ["ladder", "label", "readout", "edge", "scale", "cine", "anot", "level-hint"]) expect(shown(t), t).toBe(true);
  });

  it("limpio: solo la imagen y las anotaciones (y el cine mientras reproduce)", () => {
    const shown = fixture("limpio");
    for (const t of ["decor", "ladder", "corner", "label", "readout", "edge", "scale", "hint", "cine", "toggle"]) {
      expect(shown(t), t).toBe(false);
    }
    for (const t of ["anot", "cine-playing", "level-hint"]) expect(shown(t), t).toBe(true);
  });
});
