/* Fase 12 · T3: R12, R21, R25, R26, R28 y R29 leídos del CSS (jsdom no maqueta). */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const leer = (r: string) => readFileSync(join(__dirname, r), "utf8").replace(/\r\n/g, "\n");
const patients = leer("../components/patients/patients.css");
const office = leer("../styles/office.css");
const landing = leer("../styles/landing.css");

describe("T3 páginas y landing", () => {
  it("R12: el pie de la tarjeta parte en líneas, sin elipsis", () => {
    const m = /\.pt-card-foot > span \{([^}]*)\}/.exec(patients)!;
    expect(m[1]).not.toMatch(/nowrap|ellipsis/);
    expect(m[1]).toMatch(/overflow-wrap:\s*anywhere/);
  });
  it("R21: metadatos mono a 13 px hasta 1024", () => {
    expect(patients).toMatch(/@media \(max-width: 1024px\) \{ \.pt-card-meta \{ font-size: 13px; \} \}/);
    expect(office).toMatch(/@media \(max-width: 1024px\) \{ \.es-insignia, \.meta-mono \{ font-size: 13px; \} \}/);
  });
  it("R25: chips de Pedidos en una fila con scroll-snap en móvil", () => {
    expect(office).toMatch(/@media \(max-width: 640px\) \{\n  \.pastillas \{[^}]*flex-wrap: nowrap;[^}]*overflow: auto hidden;[^}]*scroll-snap-type/);
  });
  it("R26: el detalle del aviso baja de línea en móvil", () => {
    expect(patients).toMatch(/@media \(max-width: 640px\) \{[\s\S]*\.pt-aviso-detalle \{[^}]*white-space: normal/);
  });
  it("R28: correo y crédito con objetivo de 44 px hasta 1024", () => {
    const t = '.landing-stitch:is([data-tramo="movil"], [data-tramo="tableta"])';
    expect(landing).toContain(`${t} .sec__texto a {\n  display: inline-flex;\n  align-items: center;\n  min-height: 44px;`);
    expect(landing).toMatch(/franja-casos__credito a \{\n  display: inline-flex;\n  align-items: center;\n  min-height: 44px;/);
  });
  it("R29: hero compacto en pantallas de 600 px de alto o menos", () => {
    expect(landing).toMatch(/@media \(max-height: 600px\) \{[\s\S]*\.hero-cortes__titulo \{ font-size: clamp\(34px, 5vw, 52px\)/);
  });
});
