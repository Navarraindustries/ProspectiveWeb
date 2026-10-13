import { describe, expect, it } from "vitest";
import { modalidadesDe } from "./modalidades";

describe("modalidadesDe", () => {
  it("angio y pangio juntas dan una sola «Angiografía por catéter»", () => {
    expect(modalidadesDe({ mod_angio: true, mod_pangio: true })).toBe("Angiografía por catéter");
  });
  it("solo pangio también se muestra", () => {
    expect(modalidadesDe({ mod_pangio: true, mod_tac: true })).toBe("TAC · Angiografía por catéter");
  });
  it("sin marcas, vacío", () => {
    expect(modalidadesDe({})).toBe("");
  });
});
