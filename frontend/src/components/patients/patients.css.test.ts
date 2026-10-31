import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(__dirname, "patients.css"), "utf8").replace(/\r\n/g, "\n");
const regla = (sel: string) => {
  const m = css.match(new RegExp(`^${sel.replace(/[.:]/g, "\$&")} \{([^}]*)\}`, "m"));
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
});
