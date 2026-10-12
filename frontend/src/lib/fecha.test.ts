import { describe, expect, it } from "vitest";
import { desdeServidor, fecha, fechaHora, hoyLocal } from "./fecha";

const BOGOTA = { timeZone: "America/Bogota" }; // UTC−5 todo el año

describe("horas del servidor en hora local", () => {
  it("un ISO sin zona se lee como UTC: 05:05 UTC son las 00:05 en UTC−5", () => {
    expect(fechaHora("2026-10-11T05:05:09", BOGOTA)).toBe("11/10/26, 0:05");
    expect(desdeServidor("2026-10-11T05:05:09").toISOString()).toBe("2026-10-11T05:05:09.000Z");
  });

  it("03:28 UTC es 22:28 del día anterior en UTC−5", () => {
    expect(fechaHora("2026-10-11T03:28:00", BOGOTA)).toBe("10/10/26, 22:28");
  });

  it("03:01Z de la cadena de auditoría es 22:01 en UTC−5", () => {
    expect(fechaHora("2026-10-11T03:01:00Z", BOGOTA)).toBe("10/10/26, 22:01");
  });

  it("un ISO con zona explícita se respeta, sin volver a desplazarlo", () => {
    expect(fechaHora("2026-10-11T05:05:09+00:00", BOGOTA)).toBe("11/10/26, 0:05");
    expect(fechaHora("2026-10-11T00:05:09-05:00", BOGOTA)).toBe("11/10/26, 0:05");
  });

  it("fecha() solo da el día local", () => {
    expect(fecha("2026-10-11T03:28:00", BOGOTA)).toBe("10/10/26");
  });

  it("vacío o inválido da «—», nunca «Invalid Date»", () => {
    expect(fechaHora("", BOGOTA)).toBe("—");
    expect(fechaHora(null, BOGOTA)).toBe("—");
    expect(fechaHora("no es una fecha", BOGOTA)).toBe("—");
    expect(fecha(undefined, BOGOTA)).toBe("—");
  });

  it("hoyLocal a las 22:15 en UTC−5 sigue siendo el mismo día, no el de UTC", () => {
    const ahora = new Date("2026-10-12T03:15:00Z"); // 22:15 del 11 en Bogotá
    expect(hoyLocal(ahora, BOGOTA)).toBe("2026-10-11");
    expect(ahora.toISOString().slice(0, 10)).toBe("2026-10-12"); // lo que proponía antes
  });
});
