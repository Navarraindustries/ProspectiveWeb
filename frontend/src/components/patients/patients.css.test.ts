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
    expect(regla(".pt-card--skeleton:hover")).toMatch(/transform:\s*none/);
  });
  it("la rejilla admite tarjetas de 220px (tres columnas a 1440 px con el inspector)", () => {
    expect(regla(".pt-grid")).toMatch(/grid-template-columns:\s*repeat\(auto-fill,\s*minmax\(220px,\s*1fr\)\)/);
  });
  it("el inspector descuenta la barra superior de 56 px y usa la altura dinámica", () => {
    expect(regla(".pt-side")).toMatch(/max-height:\s*calc\(100dvh - 56px - 48px\)/);
  });
});
