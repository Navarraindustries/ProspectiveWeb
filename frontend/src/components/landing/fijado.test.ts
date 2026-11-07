import { describe, expect, it } from "vitest";
import { DESFASE_NAV } from "./desplazamiento";
import { OFFSET_FIJADO, altoRecorrido, escalaDial, scrollFijado } from "./fijado";
import { pasosEncendidos } from "./riel";

describe("dial fijado (UNI-132)", () => {
  it("el progreso arranca en el desfase de la nav y acaba con el fondo de la pantalla", () => {
    expect(OFFSET_FIJADO).toEqual([`start ${DESFASE_NAV}px`, "end end"]);
  });

  it("el recorrido da un tramo por paso tras el primero", () => {
    expect(altoRecorrido(8)).toBe("415vh");
    expect(altoRecorrido(1)).toBe("100vh");
  });

  it.each([651, 800, 1080])("a %i px de alto, el tramo fijo es el mismo que mide el progreso", (alto) => {
    // Progreso de useScroll con ese offset: desde que el borde de arriba del
    // recorrido toca el desfase hasta que el de abajo toca el fondo.
    const recorrido = alto + (7 * 45 * alto) / 100;
    const progreso = DESFASE_NAV - (alto - recorrido);
    // Fijo mientras el recorrido cubre el tramo fijo (alto − desfase).
    expect(scrollFijado(8, alto)).toBeCloseTo(progreso, 6);
    expect(scrollFijado(8, alto)).toBeCloseTo(recorrido - (alto - DESFASE_NAV), 6);
  });

  it("los pasos se encienden de uno en uno en el tramo fijo y al soltarse están todos", () => {
    const vistos = Array.from({ length: 101 }, (_, k) => pasosEncendidos(k / 100, 8));
    expect(vistos[0]).toBe(0);
    expect(vistos[100]).toBe(8);
    for (let k = 1; k < vistos.length; k++) expect(vistos[k] - vistos[k - 1]).toBeLessThanOrEqual(1);
  });

  it("el dial encoge en pantallas bajas para caber bajo la nav, sin pasar de su tamaño", () => {
    expect(escalaDial(1080)).toBe(1);
    expect(escalaDial(651)).toBeCloseTo((651 - DESFASE_NAV - 32) / 620, 6);
    expect(escalaDial(300)).toBe(0.6);
  });
});
