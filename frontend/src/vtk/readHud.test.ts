/* Leer el HUD del DOM: que la captura diga lo mismo que la pantalla.

   Si esto se rompe, la imagen sale sin índice de corte ni ventana/nivel y
   deja de poder situarse. Por eso se prueba contra el marcado real que
   producen `HudFrame` y `HudReadout`. */
import { describe, expect, it } from "vitest";

import { readHeading, readPaneHud } from "./readHud";

function panel(html: string): HTMLElement {
  const el = document.createElement("div");
  el.innerHTML = html;
  return el;
}

describe("las lecturas de un panel", () => {
  it("saca el rótulo y cada esquina con sus líneas", () => {
    // El marcado es el de HudFrame + HudReadout: `.hud-label` y
    // `.hud-readout` con la esquina en la clase, líneas separadas por \n.
    const el = panel(`
      <div class="hud">
        <span class="hud-label">AXIAL</span>
        <div class="hud-readout bl">193 / 384\nW 7578 · L -343</div>
        <div class="hud-readout tr hud-warn">RESOLUCIÓN REDUCIDA · 1:2</div>
      </div>`);
    const hud = readPaneHud(el);
    expect(hud.label).toBe("AXIAL");
    expect(hud.readouts).toEqual([
      { at: "bl", lines: ["193 / 384", "W 7578 · L -343"] },
      { at: "tr", lines: ["RESOLUCIÓN REDUCIDA · 1:2"] },
    ]);
  });

  it("ignora una lectura vacía en lugar de dibujar una línea en blanco", () => {
    const el = panel('<div class="hud-readout bl">   </div>');
    expect(readPaneHud(el).readouts).toEqual([]);
  });

  it("una lectura sin esquina conocida no se inventa un sitio", () => {
    const el = panel('<div class="hud-readout">suelta</div>');
    expect(readPaneHud(el).readouts).toEqual([]);
  });

  it("un panel que aún no está montado no rompe la captura", () => {
    expect(readPaneHud(null)).toEqual({ readouts: [] });
    expect(readPaneHud(undefined).readouts).toEqual([]);
  });
});

describe("la lectura de rumbo", () => {
  it("se copia tal cual", () => {
    const el = panel('<span data-testid="heading-readout">AZ 12° · EL -20°</span>');
    expect(readHeading(el)).toBe("AZ 12° · EL -20°");
  });

  it("conserva los corchetes de la orientación asumida", () => {
    // Quitarlos haría que una orientación inventada pareciera medida dentro
    // de una imagen que alguien va a enseñar en una sesión clínica.
    const el = panel('<span data-testid="heading-readout">[AZ 0° · EL -20°]</span>');
    expect(readHeading(el)).toBe("[AZ 0° · EL -20°]");
  });

  it("sin cinta en pantalla no devuelve nada", () => {
    expect(readHeading(panel("<div></div>"))).toBeUndefined();
    expect(readHeading(null)).toBeUndefined();
  });
});
