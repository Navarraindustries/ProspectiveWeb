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

describe("ageFromDob con la fecha del calendario", () => {
  // El día local, no el de UTC: al oeste de UTC, `new Date("AAAA-MM-DD")` cae
  // en el día anterior y la edad subía la víspera del cumpleaños.
  const local = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  it("la víspera del cumpleaños aún no lo cumple", () => {
    const hoy = new Date(2026, 6, 14, 20, 0);          // 14 de julio, 20:00 local
    expect(ageFromDob("1981-07-15", hoy)).toBe("44");
    expect(ageFromDob("1981-07-14", hoy)).toBe("45");
  });

  it("el día del cumpleaños ya lo cumple, también con la fecha de hoy", () => {
    const d = new Date(); d.setFullYear(d.getFullYear() - 30);
    expect(ageFromDob(local(d))).toBe("30");
  });
});
