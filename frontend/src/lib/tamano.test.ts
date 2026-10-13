import { describe, expect, it } from "vitest";
import { formatBytes } from "./tamano";

/* F2-73: cada guardado es una copia completa (349 927 KB, unos 342 MB) y la
   ficha no decía cuánto ocupaba. Unidades de 1024, coma decimal de es-ES. */
describe("formatBytes", () => {
  it("cero y bytes sueltos", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
  });

  it("el guardado de la auditoría: 349 927 KB son 342 MB", () => {
    expect(formatBytes(349927 * 1024)).toBe("342 MB");
  });

  it("por debajo de 10 un decimal con coma; de 10 en adelante, sin decimales", () => {
    expect(formatBytes(1.2 * 1024 ** 3)).toBe("1,2 GB");
    expect(formatBytes(1536)).toBe("1,5 KB");
    expect(formatBytes(10 * 1024)).toBe("10 KB");
    expect(formatBytes(1024 ** 2)).toBe("1 MB");
    expect(formatBytes(2 * 1024 ** 4)).toBe("2 TB");
  });

  it("un valor que no es un tamaño no se inventa", () => {
    expect(formatBytes(Number.NaN)).toBe("—");
    expect(formatBytes(-5)).toBe("—");
  });
});
