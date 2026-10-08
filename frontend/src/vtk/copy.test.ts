import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

// Los botones de reencuadre se llaman igual en toda la app: ENCUADRAR (la vista
// entera) y AL PUNTO (el plano vuelve al punto compartido). CENTRAR y AJUSTAR
// dejaron de existir como etiqueta.
function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return tsxFiles(p);
    return p.endsWith(".tsx") && !/\.test\./.test(n) ? [p] : [];
  });
}

const root = join(__dirname, "..");
const files = [...tsxFiles(join(root, "vtk")), ...tsxFiles(join(root, "components"))];
const OLD = /(?:label\s*[:=]\s*\{?\s*["'`]|>\s*)(CENTRAR|AJUSTAR|Ajustar)(?:["'`]|\s*<)/;
const NEW = /(?:label\s*[:=]\s*\{?\s*["'`]|>\s*|\[\s*"fit",\s*")ENCUADRAR(?:["'`]|\s*<)/; // Viewer la declara en CAMERA_BUTTONS

describe("nombres de los botones", () => {
  it("ninguna etiqueta usa CENTRAR, AJUSTAR ni Ajustar", () => {
    const bad = files.filter((f) => OLD.test(readFileSync(f, "utf8")));
    expect(bad).toEqual([]);
  });
  it("la regex distingue etiquetas de comentarios", () => {
    expect(OLD.test('<X label="CENTRAR" />')).toBe(true);
    expect(OLD.test("{ key: 'a', label: 'AJUSTAR' }")).toBe(true);
    expect(OLD.test("<b>Ajustar</b>")).toBe(true);
    expect(OLD.test("// antes CENTRAR")).toBe(false);
  });
  it("ENCUADRAR está en MipView, Viewer y ObliqueView", () => {
    for (const n of ["MipView.tsx", "Viewer.tsx", "ObliqueView.tsx"]) {
      expect(readFileSync(join(root, "vtk", n), "utf8"), n).toMatch(NEW);
    }
  });
});
