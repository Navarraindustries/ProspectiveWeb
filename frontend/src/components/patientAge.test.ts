import { describe, expect, it } from "vitest";
import { ageFromDob } from "./patientAge";
const iso = (d: Date) => d.toISOString().slice(0, 10);
describe("ageFromDob", () => {
  it("resta un año si el cumpleaños no ha llegado", () => {
    const d = new Date(); d.setFullYear(d.getFullYear() - 45); d.setDate(d.getDate() + 3);
    expect(ageFromDob(iso(d))).toBe("44");
    const e = new Date(); e.setFullYear(e.getFullYear() - 45); e.setDate(e.getDate() - 3);
    expect(ageFromDob(iso(e))).toBe("45");
  });
  it("sin fecha, inválida o imposible devuelve vacío", () => {
    expect(ageFromDob(undefined)).toBe(""); expect(ageFromDob("ayer")).toBe(""); expect(ageFromDob("2999-01-01")).toBe("");
  });
});
