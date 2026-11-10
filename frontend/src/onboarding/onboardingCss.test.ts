import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(__dirname, "onboarding.css"), "utf-8");

describe("«Listo, <nombre>» en el móvil", () => {
  it("el saludo parte línea en vez de salirse por la derecha", () => {
    expect(css).toMatch(/\.ob-listo__cabecera \.ob-titulo \{[^}]*min-width: 0;[^}]*overflow-wrap: anywhere;/);
    expect(css).toMatch(/\.ob-listo__cabecera \{[^}]*max-width: 100%;/);
  });
  it("en 640 px o menos, avatar encima y letra acotada para caber en 390 px", () => {
    const movil = css.slice(css.indexOf("/* Móvil: el avatar encima del saludo"));
    expect(movil).toMatch(/@media \(max-width: 640px\) \{\s*\.ob-listo__cabecera \{ flex-direction: column;/);
    expect(movil).toMatch(/\.ob-titulo--grande \{ font-size: clamp\(28px, 9vw, 40px\); \}/);
  });
});
