import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { reglas, tieneDeclaracion } from "../test/cssReglas";
import { DESFASE_NAV } from "../components/landing/desplazamiento";

const css = readFileSync(resolve(__dirname, "landing.css"), "utf8");

describe("landing.css, base responsive", () => {
  it("no tiene consultas de anchura: la disposición cuelga de data-tramo", () => {
    expect(css).not.toMatch(/@media[^{]*\b(?:max|min)-width/);
  });
  it("A12: secciones con clamp(64px, 10vh, 140px)", () => {
    expect(tieneDeclaracion(css, ".landing-stitch .sec", "padding: clamp(64px, 10vh, 140px) 24px")).toBe(true);
    expect(tieneDeclaracion(css, '.landing-stitch[data-tramo="movil"] .sec', "padding: clamp(64px, 10vh, 140px) 16px")).toBe(true);
  });
  it("hero y anchos por tramo", () => {
    expect(tieneDeclaracion(css, '.landing-stitch[data-tramo="movil"] .hero-cortes__contenido', "grid-template-columns: minmax(0, 1fr)")).toBe(true);
    expect(tieneDeclaracion(css, '.landing-stitch[data-tramo="tableta"] .hero-cortes__contenido', "grid-template-columns: minmax(0, 1fr) minmax(0, 340px)")).toBe(true);
    expect(tieneDeclaracion(css, '.landing-stitch[data-tramo="grande"] .hero-cortes__contenido', "max-width: 1600px")).toBe(true);
    expect(tieneDeclaracion(css, '.landing-stitch[data-tramo="grande"] .sec__cuerpo', "max-width: 1360px")).toBe(true);
  });
  it("objetivos de 44 px por debajo de 1024", () => {
    const hasta1024 = '.landing-stitch:is([data-tramo="movil"], [data-tramo="tableta"])';
    expect(tieneDeclaracion(css, `${hasta1024} .hero-cortes__ancla`, "height: var(--control-md)")).toBe(true);
    expect(tieneDeclaracion(css, `${hasta1024} .franja-casos__credito a`, "padding-block: 12px")).toBe(true);
  });
  it("ningún texto por debajo de 13 px salvo los rótulos mono en mayúsculas", () => {
    for (const r of reglas(css)) {
      const m = /font-size:\s*(\d+)px/.exec(r.cuerpo);
      const pequeno = (m && Number(m[1]) < 13) || /font-size:\s*var\(--text-(?:micro|eyebrow)\)/.test(r.cuerpo);
      if (!pequeno) continue;
      expect(r.cuerpo, r.selectores.join(", ")).toMatch(/text-transform:\s*uppercase/);
      expect(r.cuerpo, r.selectores.join(", ")).toMatch(/font-family:\s*var\(--font-mono\)/);
    }
  });
});

describe("landing.css, riel de «Cómo funciona»", () => {
  it("horizontal en 8 columnas y vertical con nodo de 44 px", () => {
    expect(tieneDeclaracion(css, '.landing-stitch .riel[data-disposicion="horizontal"]', "grid-template-columns: repeat(8, minmax(0, 1fr))")).toBe(true);
    expect(tieneDeclaracion(css, '.landing-stitch .riel[data-disposicion="vertical"] .riel__paso', "grid-template-columns: 44px minmax(0, 1fr)")).toBe(true);
  });
});

describe("landing.css, anclas", () => {
  it("las secciones con id dejan sitio a la nav al caer en un enlace profundo", () => {
    expect(tieneDeclaracion(css, ".landing-stitch section[id]", `scroll-margin-top: ${DESFASE_NAV}px`)).toBe(true);
  });

  it("«Qué es»: dos columnas 5fr/7fr y una sola en móvil y tableta", () => {
    expect(tieneDeclaracion(css, ".landing-stitch .que-es", "grid-template-columns: minmax(0, 5fr) minmax(0, 7fr)")).toBe(true);
    expect(tieneDeclaracion(css, '.landing-stitch:is([data-tramo="movil"], [data-tramo="tableta"]) .que-es', "grid-template-columns: minmax(0, 1fr)")).toBe(true);
  });
});

describe("landing.css, rejilla bento de «Funcionalidades»", () => {
  it("cuatro, dos y una columna por tramo, con las áreas de escritorio exactas", () => {
    expect(tieneDeclaracion(css, ".landing-stitch .bento", "grid-template-columns: repeat(4, minmax(0, 1fr))")).toBe(true);
    expect(tieneDeclaracion(css, '.landing-stitch[data-tramo="tableta"] .bento', "grid-template-columns: repeat(2, minmax(0, 1fr))")).toBe(true);
    expect(tieneDeclaracion(css, '.landing-stitch[data-tramo="movil"] .bento', "grid-template-columns: minmax(0, 1fr)")).toBe(true);
    expect(tieneDeclaracion(css, ".landing-stitch .bento", 'grid-template-areas: "seg seg morfo motor" "seg seg prueba informe" "sesiones pacientes detec detec" "clip clip detec detec"')).toBe(true);
  });
  it("cada tarjeta coge su área y en móvil manda el orden del DOM", () => {
    expect(tieneDeclaracion(css, '.landing-stitch .bento__tarjeta[data-area="detec"]', "grid-area: detec")).toBe(true);
    expect(tieneDeclaracion(css, '.landing-stitch[data-tramo="movil"] .bento__tarjeta', "grid-area: auto")).toBe(true);
    expect(tieneDeclaracion(css, '.landing-stitch[data-tramo="movil"] .bento', "grid-template-areas: none")).toBe(true);
  });
});

describe('landing.css, «Índices»', () => {
  it('dos columnas 7fr/5fr, diagrama fijo y estático en móvil y tableta', () => {
    expect(tieneDeclaracion(css, '.landing-stitch .indices', 'grid-template-columns: minmax(0, 7fr) minmax(0, 5fr)')).toBe(true);
    expect(tieneDeclaracion(css, '.landing-stitch .indices__diagrama', 'position: sticky')).toBe(true);
    expect(tieneDeclaracion(css, '.landing-stitch:is([data-tramo="movil"], [data-tramo="tableta"]) .indices__diagrama', 'position: static')).toBe(true);
    expect(tieneDeclaracion(css, '.landing-stitch .indices__fila', 'min-height: 44px')).toBe(true);
  });
});

describe("landing.css, series y «Próximamente»", () => {
  it("series: 4 columnas, 2 hasta 1024", () => {
    expect(tieneDeclaracion(css, ".landing-stitch .series", "grid-template-columns: repeat(4, minmax(0, 1fr))")).toBe(true);
    expect(tieneDeclaracion(css, '.landing-stitch:is([data-tramo="movil"], [data-tramo="tableta"]) .series', "grid-template-columns: repeat(2, minmax(0, 1fr))")).toBe(true);
  });
  it("próximamente: 3 columnas, 1 en móvil", () => {
    expect(tieneDeclaracion(css, ".landing-stitch .proximo", "grid-template-columns: repeat(3, minmax(0, 1fr))")).toBe(true);
    expect(tieneDeclaracion(css, '.landing-stitch[data-tramo="movil"] .proximo', "grid-template-columns: minmax(0, 1fr)")).toBe(true);
  });
});
