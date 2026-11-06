import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { anchoInspector, zonaLibre } from "../pipeline/zonaLibre";
import { CONSULTA, PUNTOS_CORTE } from "./puntosCorte";

const css = readFileSync(join(__dirname, "compacto.css"), "utf8").replace(/\r\n/g, "\n");
const sinComentarios = css.replace(/\/\*[\s\S]*?\*\//g, "");

describe("pantalla compacta", () => {
  it("la hoja y el código usan la misma consulta", () => {
    expect(css).toContain(`@media ${CONSULTA.compacto} {`);
    expect(CONSULTA.compacto).toContain(`(max-width: ${PUNTOS_CORTE.compacto}px)`);
  });

  it("no alcanza a tableta ni a móvil", () => {
    for (const parte of CONSULTA.compacto.split(",")) expect(parte).toContain("(min-width: 1025px)");
  });

  it("carga después de la landing, a la que corrige", () => {
    const index = readFileSync(join(__dirname, "index.css"), "utf8");
    expect(index.indexOf("./compacto.css")).toBeGreaterThan(index.indexOf("./landing.css"));
  });

  it("el texto no baja de 12 px", () => {
    const tamanos = [...sinComentarios.matchAll(/font-size:\s*(\d+)px/g)].map((m) => Number(m[1]));
    expect(tamanos.length).toBeGreaterThan(5);
    expect(Math.min(...tamanos)).toBeGreaterThanOrEqual(12);
  });

  it("no toca el visor", () => {
    expect(sinComentarios).not.toMatch(/\.ws-|vtk|viewer|hud/i);
  });

  it("el dial sigue siendo un círculo: el anillo cae sobre los nodos", () => {
    const lado = Number(sinComentarios.match(/width: (\d+)px;\n\s*height: \1px/)?.[1]);
    const radio = Number(sinComentarios.match(/--radio: (\d+)px/)?.[1]);
    const margen = Number(sinComentarios.match(/::before \{ inset: (\d+)px/)?.[1]);
    expect(Math.abs(lado / 2 - margen - radio)).toBeLessThanOrEqual(2);
  });

  it("el inspector cede ancho al visor salvo en los pasos anchos", () => {
    expect(anchoInspector(false, true)).toBeLessThan(anchoInspector(false));
    expect(anchoInspector(true, true)).toBe(anchoInspector(true));
    const normal = zonaLibre({ estrecho: false, plegado: false, ancho: false });
    const compacta = zonaLibre({ estrecho: false, plegado: false, ancho: false, compacto: true });
    expect(compacta.right).toBeLessThan(normal.right);
  });
});
