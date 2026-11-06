import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(__dirname, "patients.css"), "utf8").replace(/\r\n/g, "\n");
const regla = (sel: string) => {
  const m = css.match(new RegExp(`^${sel.replace(/[.:]/g, "\\$&")} \{([^}]*)\}`, "m"));
  expect(m, sel).not.toBeNull();
  return m![1];
};

describe("contrato CSS de las tarjetas de paciente", () => {
  it(".pt-card no lleva desenfoque propio (el blur es de las piezas flotantes)", () => {
    expect(regla(".pt-card")).not.toMatch(/backdrop-filter/);
  });
  it("el esqueleto no crece al pasar el cursor", () => {
    // Crece quien lleva .tarjeta-lente: la tarjeta real sí, el esqueleto no.
    const pagina = readFileSync(join(__dirname, "../../pages/Patients.tsx"), "utf8");
    expect(pagina).toContain('className="pt-card pt-card--skeleton"');
    expect(css).not.toMatch(/\.pt-card[^{]*:hover \{[^}]*\bscale/);
  });
  it("la rejilla admite tarjetas de 220px (tres columnas a 1440 px con el inspector)", () => {
    expect(regla(".pt-grid")).toMatch(/grid-template-columns:\s*repeat\(auto-fill,\s*minmax\(220px,\s*1fr\)\)/);
  });
  it("el panel lateral crece con la página: sticky sin alto máximo ni scroll propio", () => {
    expect(regla(".pt-side")).toMatch(/position:\s*sticky/);
    expect(regla(".pt-side")).not.toMatch(/max-height|overflow-y/);
  });
  it("la HC va en una línea con elipsis", () => {
    expect(regla(".pt-card-meta")).toMatch(/white-space:\s*nowrap/);
    expect(regla(".pt-card-meta")).toMatch(/text-overflow:\s*ellipsis/);
  });
  it("a ≤ 640 px la rejilla es de una columna", () => {
    expect(css).toMatch(/@media \(max-width: 640px\) \{ \.pt-grid \{ grid-template-columns: 1fr; \}/);
  });
});
