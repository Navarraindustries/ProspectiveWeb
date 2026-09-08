/* La regla de nombrar una pieza, que es el espejo de `navarro.shape_label`.

   Los dos lados tienen que dar la misma cadena para la misma pieza: cuando no
   la daban, la pantalla decía «recto» de un fenestrado y el albarán del taller
   decía «Fenestrado ventana 5 mm». El cirujano y el taller hablaban de piezas
   distintas creyendo hablar de la misma. */
import { describe, expect, it } from "vitest";
import { SERIES_FOR_SHAPE, seriesAndShape, shapeLabel } from "./clipShape";

describe("cómo se nombra una pieza", () => {
  it("nombra cada serie por lo que es", () => {
    expect(shapeLabel("straight")).toBe("Recto");
    expect(shapeLabel("curved")).toBe("Curvo");
    expect(shapeLabel("angled", 60)).toBe("Angulado 60°");
    expect(shapeLabel("fenestrated", 0, 5)).toBe("Fenestrado ventana 5 mm");
  });

  it("no deja que un acodado de cero arrastre a «Recto»", () => {
    // El fallo exacto: un curvo y un fenestrado tienen angle_deg 0, igual que un
    // recto, y era lo único que las tres ramas miraban.
    expect(shapeLabel("curved", 0)).not.toBe("Recto");
    expect(shapeLabel("fenestrated", 0, 3)).not.toBe("Recto");
  });

  it("cada forma la dibuja una serie, y solo una", () => {
    expect(SERIES_FOR_SHAPE).toEqual({
      straight: "T1", curved: "T2", angled: "T3", fenestrated: "T4",
    });
    expect(new Set(Object.values(SERIES_FOR_SHAPE)).size).toBe(4);
  });

  it("junta serie y forma como se lee un pedido", () => {
    expect(seriesAndShape("fenestrated", 0, 7)).toBe("T4 Fenestrado ventana 7 mm");
    expect(seriesAndShape("angled", 15)).toBe("T3 Angulado 15°");
  });
});
